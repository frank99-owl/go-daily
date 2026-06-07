import type Stripe from "stripe";

import { createApiResponse, readRequestBodyBytes } from "@/lib/apiHeaders";
import { isProSubscriptionStatus } from "@/lib/entitlements";
import { getStripeClient, inferPlanFromPriceId } from "@/lib/stripe/server";
import {
  captureInvoicePaid,
  capturePaymentFailed,
  captureSubscriptionCanceled,
  captureTrialStarted,
} from "@/lib/stripe/stripeWebhookAnalytics";
import {
  sendPaymentFailedNotice,
  sendSubscriptionStartedNotice,
} from "@/lib/stripe/stripeWebhookEmail";
import {
  anchorDayFromIso,
  getStringId,
  minItemPeriodEnd,
  toIsoOrNull,
} from "@/lib/stripe/stripeWebhookHelpers";
import {
  claimStripeEvent,
  markStripeEventFailed,
  markStripeEventProcessed,
  type StripeEventClaim,
} from "@/lib/stripe/stripeEventStore";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

// Event claiming uses the stripe_events table for idempotent processing.
const FOREIGN_KEY_VIOLATION = "23503";
const MAX_WEBHOOK_BODY_BYTES = 1_000_000;

function isForeignKeyViolation(error: { code?: string } | null | undefined): boolean {
  return error?.code === FOREIGN_KEY_VIOLATION;
}

function normalizePlan({
  metadataPlan,
  priceId,
}: {
  metadataPlan: string | null | undefined;
  priceId: string | null | undefined;
}): string {
  if (metadataPlan && metadataPlan.trim().length > 0) return metadataPlan;
  const inferred = inferPlanFromPriceId(priceId);
  if (inferred) return inferred;
  return "unknown";
}

async function upsertSubscriptionFromStripe(
  admin: ReturnType<typeof createServiceClient>,
  sub: Stripe.Subscription,
  fallbackUserId?: string | null,
  extras?: {
    firstPaidAt?: string | null;
    coachAnchorDay?: number | null;
    status?: string;
  },
) {
  const userId = sub.metadata?.user_id || fallbackUserId;
  if (!userId) {
    console.warn("[stripe/webhook] subscription missing metadata.user_id", {
      subscriptionId: sub.id,
    });
    return;
  }

  const customerId = getStringId(sub.customer);
  if (!customerId) {
    console.warn("[stripe/webhook] subscription missing customer id", { subscriptionId: sub.id });
    return;
  }

  const priceId = sub.items.data[0]?.price?.id ?? null;
  const plan = normalizePlan({ metadataPlan: sub.metadata?.plan, priceId });
  const nextStatus = extras?.status ?? sub.status;
  const nextCurrentPeriodEnd = toIsoOrNull(minItemPeriodEnd(sub));
  const { data: existing, error: existingError } = await admin
    .from("subscriptions")
    .select("stripe_subscription_id, status, current_period_end, first_paid_at, coach_anchor_day")
    .eq("user_id", userId)
    .maybeSingle();

  if (existingError) {
    throw new Error(`failed to load existing subscription: ${existingError.message}`);
  }

  const existingSubscription = existing as {
    stripe_subscription_id?: string | null;
    status?: string | null;
    current_period_end?: string | null;
    first_paid_at?: string | null;
    coach_anchor_day?: number | null;
  } | null;

  if (
    existingSubscription?.stripe_subscription_id &&
    existingSubscription.stripe_subscription_id !== sub.id &&
    isProSubscriptionStatus(existingSubscription.status, {
      currentPeriodEnd: existingSubscription.current_period_end,
    }) &&
    !isProSubscriptionStatus(nextStatus, { currentPeriodEnd: nextCurrentPeriodEnd })
  ) {
    console.warn("[stripe/webhook] ignoring stale non-pro update for old subscription", {
      userId,
      currentSubscriptionId: existingSubscription.stripe_subscription_id,
      incomingSubscriptionId: sub.id,
      incomingStatus: nextStatus,
    });
    return;
  }

  const firstPaidAt = existingSubscription?.first_paid_at ?? extras?.firstPaidAt ?? null;
  const coachAnchorDay = existingSubscription?.coach_anchor_day ?? extras?.coachAnchorDay ?? null;

  const { error } = await admin.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      plan,
      status: nextStatus,
      current_period_end: nextCurrentPeriodEnd,
      cancel_at_period_end: sub.cancel_at_period_end,
      trial_end: toIsoOrNull(sub.trial_end),
      first_paid_at: firstPaidAt,
      coach_anchor_day: coachAnchorDay,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    if (isForeignKeyViolation(error)) {
      console.warn("[stripe/webhook] subscription user no longer exists; skipping upsert", {
        userId,
        subscriptionId: sub.id,
      });
      return;
    }
    throw new Error(`failed to upsert subscription: ${error.message}`);
  }
}

// ── POST handler ──────────────────────────────────────────────────────

export async function POST(request: Request) {
  let stripe: ReturnType<typeof getStripeClient>;
  try {
    stripe = getStripeClient();
  } catch (error) {
    const err = error as Error;
    console.error("[stripe/webhook] not configured", { message: err.message });
    return createApiResponse({ error: "not_configured" }, { status: 500 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const signature = request.headers.get("stripe-signature");

  if (!webhookSecret) {
    console.error("[stripe/webhook] missing STRIPE_WEBHOOK_SECRET");
    return createApiResponse({ error: "not_configured" }, { status: 500 });
  }

  if (!signature) {
    return createApiResponse({ error: "missing_signature" }, { status: 400 });
  }

  const rawBody = await readRequestBodyBytes(request, MAX_WEBHOOK_BODY_BYTES, "payload_too_large");
  if (rawBody instanceof Response) return rawBody;
  const body = Buffer.from(rawBody);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    const err = error as Error;
    console.warn("[stripe/webhook] signature verification failed", { message: err.message });
    return createApiResponse({ error: "invalid_signature" }, { status: 400 });
  }

  const admin = createServiceClient();

  let claim: StripeEventClaim;
  try {
    claim = await claimStripeEvent(admin, event);
  } catch (error) {
    const err = error as Error;
    console.error("[stripe/webhook] event claim failed", {
      eventId: event.id,
      message: err.message,
    });
    return createApiResponse({ error: "event_claim_failed" }, { status: 500 });
  }

  if (claim === "duplicate") {
    return createApiResponse({ ok: true, duplicate: true });
  }
  if (claim === "in_progress") {
    return createApiResponse({ error: "event_in_progress" }, { status: 503 });
  }

  let afterProcessed: (() => Promise<void>) | null = null;

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await upsertSubscriptionFromStripe(admin, sub);
        if (event.type === "customer.subscription.deleted") {
          await captureSubscriptionCanceled(sub);
        }
        break;
      }
      case "customer.subscription.updated": {
        await upsertSubscriptionFromStripe(admin, event.data.object as Stripe.Subscription);
        break;
      }
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const subscriptionId = getStringId(session.subscription);
        if (!subscriptionId) break;
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        await upsertSubscriptionFromStripe(admin, sub, session.client_reference_id);
        await captureTrialStarted(sub, session.client_reference_id);
        afterProcessed = () =>
          sendSubscriptionStartedNotice({
            admin,
            sub,
            fallbackUserId: session.client_reference_id,
          });
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoiceSubscriptionId(invoice);
        if (!subscriptionId) break;
        if (typeof invoice.amount_paid === "number" && invoice.amount_paid <= 0) break;
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const firstPaidAt = invoicePaidAt(invoice);
        await upsertSubscriptionFromStripe(admin, sub, null, {
          firstPaidAt,
          coachAnchorDay: anchorDayFromIso(firstPaidAt),
        });
        await captureInvoicePaid(sub, invoice);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoiceSubscriptionId(invoice);
        if (!subscriptionId) break;
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        await upsertSubscriptionFromStripe(admin, sub, null, { status: "past_due" });
        await capturePaymentFailed(sub);
        await sendPaymentFailedNotice({ admin, stripe, sub });
        break;
      }
      default:
        break;
    }

    await markStripeEventProcessed(admin, event.id);

    if (afterProcessed) {
      try {
        await afterProcessed();
      } catch (error) {
        console.warn("[stripe/webhook] post-process action skipped", error);
      }
    }

    return createApiResponse({ ok: true });
  } catch (error) {
    const err = error as Error;
    console.error("[stripe/webhook] handler failed", { eventId: event.id, message: err.message });
    await markStripeEventFailed(admin, event.id, err.message);
    return createApiResponse({ error: "handler_failed" }, { status: 500 });
  }
}

// ── Invoice helpers ───────────────────────────────────────────────────

function invoicePaidAt(invoice: Stripe.Invoice): string | null {
  const paidAt =
    typeof invoice.status_transitions?.paid_at === "number"
      ? invoice.status_transitions.paid_at
      : typeof invoice.created === "number"
        ? invoice.created
        : null;
  return toIsoOrNull(paidAt);
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const parentSubscription = invoice.parent?.subscription_details?.subscription;
  if (parentSubscription) return getStringId(parentSubscription);

  const legacyInvoice = invoice as Stripe.Invoice & { subscription?: unknown };
  return getStringId(legacyInvoice.subscription);
}

import type Stripe from "stripe";

import { createApiResponse } from "@/lib/apiHeaders";
import { sendPaymentFailedEmail } from "@/lib/email";
import { DEFAULT_LOCALE, isLocale, localePath } from "@/lib/i18n/localePath";
import { captureServerEvent } from "@/lib/posthog/server";
import { absoluteUrl } from "@/lib/siteUrl";
import { getStripeClient, inferPlanFromPriceId } from "@/lib/stripe/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { Locale } from "@/types";

export const runtime = "nodejs";

const EVENT_PROCESSING_STALE_MS = 10 * 60 * 1000;
const UNIQUE_VIOLATION = "23505";

type StripeEventClaim = "claimed" | "duplicate" | "in_progress";

function toIsoOrNull(epochSeconds: number | null | undefined): string | null {
  if (!epochSeconds) return null;
  return new Date(epochSeconds * 1000).toISOString();
}

function minItemPeriodEnd(sub: Stripe.Subscription): number | null {
  const ends = sub.items?.data
    ?.map((item) => item.current_period_end)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!ends || ends.length === 0) return null;
  return Math.min(...ends);
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

function getStringId(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value && "id" in value) {
    const maybe = value as { id?: unknown };
    if (typeof maybe.id === "string") return maybe.id;
  }
  return null;
}

function isUniqueViolation(error: { code?: string } | null | undefined): boolean {
  return error?.code === UNIQUE_VIOLATION;
}

function truncateErrorMessage(message: string): string {
  return message.length > 1000 ? `${message.slice(0, 997)}...` : message;
}

async function tryClaimExistingStripeEvent(
  admin: ReturnType<typeof createServiceClient>,
  event: Stripe.Event,
  processingStartedAt: string | null,
): Promise<StripeEventClaim> {
  const now = new Date();
  const nextProcessingStartedAt = now.toISOString();
  const staleBefore = new Date(now.getTime() - EVENT_PROCESSING_STALE_MS).toISOString();

  let update = admin
    .from("stripe_events")
    .update({
      event_type: event.type,
      processing_started_at: nextProcessingStartedAt,
      last_error: null,
    })
    .eq("id", event.id)
    .is("processed_at", null);

  update = processingStartedAt
    ? update.lt("processing_started_at", staleBefore)
    : update.is("processing_started_at", null);

  const { data, error } = await update.select("id").maybeSingle();
  if (error) {
    throw new Error(`failed to claim existing stripe event: ${error.message}`);
  }

  return data?.id ? "claimed" : "in_progress";
}

async function claimStripeEvent(
  admin: ReturnType<typeof createServiceClient>,
  event: Stripe.Event,
): Promise<StripeEventClaim> {
  const now = new Date().toISOString();
  const { error } = await admin.from("stripe_events").insert({
    id: event.id,
    event_type: event.type,
    processing_started_at: now,
    last_error: null,
  });

  if (!error) return "claimed";
  if (!isUniqueViolation(error)) {
    throw new Error(`failed to claim stripe event: ${error.message}`);
  }

  const { data: existing, error: lookupErr } = await admin
    .from("stripe_events")
    .select("processed_at, processing_started_at")
    .eq("id", event.id)
    .maybeSingle();

  if (lookupErr) {
    throw new Error(`failed to inspect duplicate stripe event: ${lookupErr.message}`);
  }
  if (existing?.processed_at) return "duplicate";

  return tryClaimExistingStripeEvent(
    admin,
    event,
    typeof existing?.processing_started_at === "string" ? existing.processing_started_at : null,
  );
}

async function markStripeEventProcessed(
  admin: ReturnType<typeof createServiceClient>,
  eventId: string,
) {
  const { error } = await admin
    .from("stripe_events")
    .update({
      processed_at: new Date().toISOString(),
      processing_started_at: null,
      last_error: null,
    })
    .eq("id", eventId);

  if (error) {
    throw new Error(`failed to mark stripe event processed: ${error.message}`);
  }
}

async function markStripeEventFailed(
  admin: ReturnType<typeof createServiceClient>,
  eventId: string,
  message: string,
) {
  const { error } = await admin
    .from("stripe_events")
    .update({
      processing_started_at: null,
      last_error: truncateErrorMessage(message),
    })
    .eq("id", eventId)
    .is("processed_at", null);

  if (error) {
    console.warn("[stripe/webhook] failed to release failed stripe event claim", {
      eventId,
      message: error.message,
    });
  }
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
  const { data: existing, error: existingError } = await admin
    .from("subscriptions")
    .select("first_paid_at, coach_anchor_day")
    .eq("user_id", userId)
    .maybeSingle();

  if (existingError) {
    throw new Error(`failed to load existing subscription: ${existingError.message}`);
  }

  const firstPaidAt = existing?.first_paid_at ?? extras?.firstPaidAt ?? null;
  const coachAnchorDay = existing?.coach_anchor_day ?? extras?.coachAnchorDay ?? null;

  const { error } = await admin.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      plan,
      status: extras?.status ?? sub.status,
      current_period_end: toIsoOrNull(minItemPeriodEnd(sub)),
      cancel_at_period_end: sub.cancel_at_period_end,
      trial_end: toIsoOrNull(sub.trial_end),
      first_paid_at: firstPaidAt,
      coach_anchor_day: coachAnchorDay,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    throw new Error(`failed to upsert subscription: ${error.message}`);
  }
}

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

function anchorDayFromIso(iso: string | null): number | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getUTCDate();
}

function subscriptionInterval(sub: Stripe.Subscription): "monthly" | "yearly" | "unknown" {
  const interval = sub.items.data[0]?.price?.recurring?.interval;
  if (interval === "month") return "monthly";
  if (interval === "year") return "yearly";
  return "unknown";
}

function subscriptionAnalyticsProps(sub: Stripe.Subscription) {
  const priceId = sub.items.data[0]?.price?.id ?? null;
  return {
    plan: normalizePlan({ metadataPlan: sub.metadata?.plan, priceId }),
    interval: subscriptionInterval(sub),
    subscriptionId: sub.id,
    stripeCustomerId: getStringId(sub.customer),
  };
}

function subscriptionDistinctId(sub: Stripe.Subscription, fallbackUserId?: string | null): string {
  return sub.metadata?.user_id || fallbackUserId || getStringId(sub.customer) || sub.id;
}

async function captureTrialStarted(sub: Stripe.Subscription, fallbackUserId?: string | null) {
  if (!sub.trial_end) return;
  await captureServerEvent({
    distinctId: subscriptionDistinctId(sub, fallbackUserId),
    event: "trial_started",
    properties: {
      ...subscriptionAnalyticsProps(sub),
      trialEnd: toIsoOrNull(sub.trial_end),
    },
  });
}

async function captureInvoicePaid(sub: Stripe.Subscription, invoice: Stripe.Invoice) {
  const revenueUsd =
    typeof invoice.amount_paid === "number" ? Math.round(invoice.amount_paid) / 100 : null;
  const currency = typeof invoice.currency === "string" ? invoice.currency : null;
  const firstPaidAt = invoicePaidAt(invoice);

  await captureServerEvent({
    distinctId: subscriptionDistinctId(sub),
    event: "subscription_activated",
    properties: {
      ...subscriptionAnalyticsProps(sub),
      revenueUsd,
      currency,
    },
  });

  if (sub.trial_end && firstPaidAt) {
    const trialEndIso = toIsoOrNull(sub.trial_end);
    if (trialEndIso && firstPaidAt >= trialEndIso) {
      await captureServerEvent({
        distinctId: subscriptionDistinctId(sub),
        event: "trial_converted",
        properties: {
          ...subscriptionAnalyticsProps(sub),
          revenueUsd,
          currency,
        },
      });
    }
  }
}

async function capturePaymentFailed(sub: Stripe.Subscription) {
  const props = subscriptionAnalyticsProps(sub);
  await captureServerEvent({
    distinctId: subscriptionDistinctId(sub),
    event: "subscription_past_due",
    properties: props,
  });

  if (sub.trial_end) {
    await captureServerEvent({
      distinctId: subscriptionDistinctId(sub),
      event: "trial_abandoned",
      properties: {
        ...props,
        reason: "payment_failed",
      },
    });
  }
}

async function captureSubscriptionCanceled(sub: Stripe.Subscription) {
  await captureServerEvent({
    distinctId: subscriptionDistinctId(sub),
    event: "subscription_canceled",
    properties: {
      ...subscriptionAnalyticsProps(sub),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    },
  });
}

type PaymentEmailProfile = {
  locale?: string | null;
  email_opt_out?: boolean | null;
  email_unsubscribe_token?: string | null;
};

function localeFromProfile(value: string | null | undefined): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

async function sendPaymentFailedNotice({
  admin,
  stripe,
  sub,
}: {
  admin: ReturnType<typeof createServiceClient>;
  stripe: ReturnType<typeof getStripeClient>;
  sub: Stripe.Subscription;
}): Promise<void> {
  const userId = sub.metadata?.user_id;
  if (!userId) return;

  try {
    const customerId = getStringId(sub.customer);
    if (!customerId) return;

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("locale, email_opt_out, email_unsubscribe_token")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileError) {
      console.warn("[stripe/webhook] payment email profile lookup failed", {
        userId,
        message: profileError.message,
      });
      return;
    }

    const emailProfile = profile as PaymentEmailProfile | null;
    if (emailProfile?.email_opt_out) return;

    const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId);
    const email = userData.user?.email;
    if (userError || !email) return;

    const locale = localeFromProfile(emailProfile?.locale);
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: absoluteUrl(localePath(locale, "/account")),
    });

    await sendPaymentFailedEmail({
      to: email,
      locale,
      portalUrl: portal.url,
      unsubscribeToken: emailProfile?.email_unsubscribe_token,
    });
  } catch (error) {
    console.warn("[stripe/webhook] payment failed email skipped", error);
  }
}

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

  const body = Buffer.from(await request.arrayBuffer());

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
        // Ignore other events for now.
        break;
    }

    await markStripeEventProcessed(admin, event.id);

    return createApiResponse({ ok: true });
  } catch (error) {
    const err = error as Error;
    console.error("[stripe/webhook] handler failed", { eventId: event.id, message: err.message });
    await markStripeEventFailed(admin, event.id, err.message);
    // Return 500 so Stripe retries; upserts are idempotent.
    return createApiResponse({ error: "handler_failed" }, { status: 500 });
  }
}

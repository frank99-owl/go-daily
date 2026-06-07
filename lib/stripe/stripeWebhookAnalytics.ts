/**
 * PostHog analytics helpers for Stripe webhook events.
 */
import type Stripe from "stripe";

import { captureServerEvent } from "@/lib/posthog/server";
import { inferPlanFromPriceId } from "@/lib/stripe/server";
import { getStringId } from "@/lib/stripe/stripeWebhookHelpers";

function toIsoOrNull(epochSeconds: number | null | undefined): string | null {
  if (!epochSeconds) return null;
  return new Date(epochSeconds * 1000).toISOString();
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
  };
}

function subscriptionDistinctId(sub: Stripe.Subscription, fallbackUserId?: string | null): string {
  return sub.metadata?.user_id || fallbackUserId || getStringId(sub.customer) || sub.id;
}

export async function captureTrialStarted(
  sub: Stripe.Subscription,
  fallbackUserId?: string | null,
) {
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

export async function captureInvoicePaid(sub: Stripe.Subscription, invoice: Stripe.Invoice) {
  const revenueUsd =
    typeof invoice.amount_paid === "number" ? Math.round(invoice.amount_paid) / 100 : null;
  const currency = typeof invoice.currency === "string" ? invoice.currency : null;
  const firstPaidAt =
    typeof invoice.status_transitions?.paid_at === "number"
      ? toIsoOrNull(invoice.status_transitions.paid_at)
      : typeof invoice.created === "number"
        ? toIsoOrNull(invoice.created)
        : null;

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

export async function capturePaymentFailed(sub: Stripe.Subscription) {
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

export async function captureSubscriptionCanceled(sub: Stripe.Subscription) {
  await captureServerEvent({
    distinctId: subscriptionDistinctId(sub),
    event: "subscription_canceled",
    properties: {
      ...subscriptionAnalyticsProps(sub),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    },
  });
}

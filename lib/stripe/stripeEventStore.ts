/**
 * Stripe event claiming and processing status tracking.
 *
 * Provides idempotent event processing with stale-detection:
 * - claimStripeEvent: INSERT with unique violation handling + stale reclaim
 * - markStripeEventProcessed: mark successful completion
 * - markStripeEventFailed: release claim for retry
 */
import type Stripe from "stripe";

import { createServiceClient } from "@/lib/supabase/service";

const EVENT_PROCESSING_STALE_MS = 10 * 60 * 1000;
const UNIQUE_VIOLATION = "23505";

export type StripeEventClaim = "claimed" | "duplicate" | "in_progress";

export function truncateErrorMessage(message: string): string {
  return message.length > 1000 ? `${message.slice(0, 997)}...` : message;
}

function isUniqueViolation(error: { code?: string } | null | undefined): boolean {
  return error?.code === UNIQUE_VIOLATION;
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

export async function claimStripeEvent(
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

export async function markStripeEventProcessed(
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

export async function markStripeEventFailed(
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

/**
 * POST /api/account/delete — permanently delete the currently-signed-in user.
 *
 * Flow:
 *   1. Read the session via the server-side Supabase client (cookie-backed).
 *   2. Cancel any linked Stripe subscription before deleting the account.
 *   3. Use the service-role client to call `auth.admin.deleteUser`.
 *   4. DB triggers on `auth.users` cascade-delete rows in our tables
 *      (profiles, attempts, coach_usage, subscriptions, srs_cards,
 *      user_devices). See supabase/migrations/0001_init.sql.
 *   5. Return `{ ok: true }`; the client will then call auth.signOut() to
 *      drop the local session cookies.
 *
 * Security:
 *   - Only deletes the caller's own user id — the service-role key is
 *     never exposed to the browser and the user id is taken from the
 *     server-side session, not the request body.
 *   - GET / PUT / DELETE are rejected; only POST with same-origin cookie
 *     credentials is accepted.
 */
import { createApiResponse } from "@/lib/apiHeaders";
import { createRateLimiter, isRateLimiterConfigurationError } from "@/lib/rateLimit";
import { isSameOriginMutationRequest } from "@/lib/requestSecurity";
import { getStripeClient } from "@/lib/stripe/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const rateLimiter = createRateLimiter();
const STRIPE_TERMINAL_SUBSCRIPTION_STATUSES = new Set(["canceled", "incomplete_expired"]);

type SubscriptionRow = {
  stripe_subscription_id: string | null;
  status: string | null;
};

function isMissingStripeResource(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { code?: unknown; statusCode?: unknown; raw?: { code?: unknown } };
  return maybe.code === "resource_missing" || maybe.raw?.code === "resource_missing";
}

async function cancelLinkedStripeSubscription({
  admin,
  userId,
}: {
  admin: ReturnType<typeof createServiceClient>;
  userId: string;
}): Promise<Response | null> {
  const { data, error } = await admin
    .from("subscriptions")
    .select("stripe_subscription_id, status")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[account/delete] failed to look up subscription", {
      userId,
      message: error.message,
    });
    return createApiResponse({ error: "subscription_lookup_failed" }, { status: 500 });
  }

  const subscription = data as SubscriptionRow | null;
  const subscriptionId = subscription?.stripe_subscription_id?.trim();
  if (!subscriptionId) return null;
  if (STRIPE_TERMINAL_SUBSCRIPTION_STATUSES.has(subscription?.status ?? "")) return null;

  let stripe: ReturnType<typeof getStripeClient>;
  try {
    stripe = getStripeClient();
  } catch (error) {
    const err = error as Error;
    console.error("[account/delete] Stripe not configured", { userId, message: err.message });
    return createApiResponse({ error: "stripe_not_configured" }, { status: 500 });
  }

  try {
    await stripe.subscriptions.cancel(subscriptionId);
  } catch (error) {
    if (isMissingStripeResource(error)) {
      console.warn("[account/delete] linked Stripe subscription was already missing", {
        userId,
        subscriptionId,
      });
      return null;
    }

    const err = error as Error;
    console.error("[account/delete] failed to cancel Stripe subscription", {
      userId,
      subscriptionId,
      message: err.message,
    });
    return createApiResponse({ error: "subscription_cancel_failed" }, { status: 502 });
  }

  return null;
}

export async function POST(request: Request) {
  if (!isSameOriginMutationRequest(request)) {
    return createApiResponse({ error: "forbidden" }, { status: 403 });
  }

  const supabase = await createServerSupabase();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return createApiResponse({ error: "unauthenticated" }, { status: 401 });
  }

  // Rate limit: 5 requests per hour per user (destructive action)
  try {
    if (await rateLimiter.isLimited(`delete:${user.id}`)) {
      return createApiResponse({ error: "Too many requests, slow down." }, { status: 429 });
    }
  } catch (error) {
    if (isRateLimiterConfigurationError(error)) {
      console.error("[account/delete] rate limiter unavailable", { userId: user.id, error });
      return createApiResponse({ error: "rate_limiter_unavailable" }, { status: 503 });
    }
    console.warn("[account/delete] rate limiter failed open", { userId: user.id, error });
  }

  const admin = createServiceClient();
  const cancelError = await cancelLinkedStripeSubscription({ admin, userId: user.id });
  if (cancelError) return cancelError;

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    // Surface only a generic message; the detail is in server logs.
    console.error("[api/account/delete] deleteUser failed", {
      userId: user.id,
      error: error.message,
    });
    return createApiResponse({ error: "delete_failed" }, { status: 500 });
  }

  return createApiResponse({ ok: true });
}

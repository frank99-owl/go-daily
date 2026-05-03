/**
 * POST /api/account/delete — permanently delete the currently-signed-in user.
 *
 * Flow:
 *   1. Read the session via the server-side Supabase client (cookie-backed).
 *   2. Use the service-role client to call `auth.admin.deleteUser`.
 *   3. DB triggers on `auth.users` cascade-delete rows in our tables
 *      (profiles, attempts, coach_usage, subscriptions, srs_cards,
 *      user_devices). See supabase/migrations/0001_init.sql.
 *   4. Return `{ ok: true }`; the client will then call auth.signOut() to
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
import { createRateLimiter } from "@/lib/rateLimit";
import { isSameOriginMutationRequest } from "@/lib/requestSecurity";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const rateLimiter = createRateLimiter();

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
    console.warn("[account/delete] rate limiter failed open", { userId: user.id, error });
  }

  const admin = createServiceClient();
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

import { z } from "zod";

import { isAdmin } from "@/lib/admin";
import { apiError, createApiResponse, parseMutationBody } from "@/lib/apiHeaders";
import { getClientIP } from "@/lib/clientIp";
import { checkRateLimit, createRateLimiter } from "@/lib/rateLimit";
import { constantTimeEqual } from "@/lib/secureCompare";
import { createClient as createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MIN_ADMIN_PIN_LENGTH = 12;
const rateLimiter = createRateLimiter();

/**
 * GET — report whether the current session belongs to an admin.
 *
 * Used by the client shell (footer admin link, /admin gate) so layouts never
 * have to resolve auth server-side. Only reveals the caller's own status.
 */
export async function GET(request: Request) {
  const ip = getClientIP(request);
  const ipLimit = await checkRateLimit(rateLimiter, `admin-status:${ip}`, "[admin/verify:get]");
  if (ipLimit) return ipLimit;

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return createApiResponse({ isAdmin: !!user && isAdmin(user.id, user.email) });
}

const VerifyRequestSchema = z.object({
  pin: z.string().min(1).max(128),
});

export async function POST(request: Request) {
  const rawBody = await parseMutationBody(request);
  if (rawBody instanceof Response) return rawBody;

  const parsed = VerifyRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return apiError("invalid_request", 400);
  }

  const ipLimit = await checkRateLimit(rateLimiter, "admin-verify", "[admin/verify]");
  if (ipLimit) return ipLimit;

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email || !isAdmin(user.id, user.email)) {
    return createApiResponse({ error: "forbidden" }, { status: 403 });
  }

  const userLimit = await checkRateLimit(
    rateLimiter,
    `admin-verify:user:${user.id}`,
    "[admin/verify]",
  );
  if (userLimit) return userLimit;

  const expectedPin = process.env.ADMIN_PIN;

  // Missing and too-short PINs return the same opaque response so callers
  // cannot distinguish server configuration state from a failed check.
  if (!expectedPin || expectedPin.length < MIN_ADMIN_PIN_LENGTH) {
    console.error("[admin/verify] ADMIN_PIN is missing or too short");
    return createApiResponse({ error: "forbidden" }, { status: 403 });
  }

  if (!constantTimeEqual(parsed.data.pin, expectedPin)) {
    return createApiResponse({ error: "invalid pin" }, { status: 403 });
  }

  return createApiResponse({ ok: true });
}

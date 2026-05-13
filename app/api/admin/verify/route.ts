import { z } from "zod";

import { createApiResponse, parseMutationBody } from "@/lib/apiHeaders";
import { getClientIP } from "@/lib/clientIp";
import { createRateLimiter, isRateLimiterConfigurationError } from "@/lib/rateLimit";
import { isSameOriginMutationRequest } from "@/lib/requestSecurity";
import { constantTimeEqual } from "@/lib/secureCompare";
import { createClient as createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MIN_ADMIN_PIN_LENGTH = 12;
const rateLimiter = createRateLimiter();

const VerifyRequestSchema = z.object({
  pin: z.string().min(1).max(128),
});

async function isVerifyRateLimited(request: Request, userId?: string): Promise<Response | null> {
  const ip = getClientIP(request);
  try {
    const key = userId ? `admin-verify:user:${userId}` : `admin-verify:${ip}`;
    if (await rateLimiter.isLimited(key)) {
      return createApiResponse({ error: "too_many_requests" }, { status: 429 });
    }
  } catch (error) {
    if (isRateLimiterConfigurationError(error)) {
      console.error("[admin/verify] rate limiter unavailable", { ip, userId, error });
      return createApiResponse({ error: "rate_limiter_unavailable" }, { status: 503 });
    }
    console.warn("[admin/verify] rate limiter failed open", { ip, userId, error });
  }
  return null;
}

export async function POST(request: Request) {
  if (!isSameOriginMutationRequest(request)) {
    return createApiResponse({ error: "forbidden" }, { status: 403 });
  }

  const rawBody = await parseMutationBody(request);
  if (rawBody instanceof Response) return rawBody;

  const parsed = VerifyRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return createApiResponse({ error: "invalid_request" }, { status: 400 });
  }

  const ipLimit = await isVerifyRateLimited(request);
  if (ipLimit) return ipLimit;

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return createApiResponse({ error: "unauthorized" }, { status: 401 });
  }

  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase());

  if (!adminEmails.includes(user.email.toLowerCase())) {
    return createApiResponse({ error: "forbidden" }, { status: 403 });
  }

  const userLimit = await isVerifyRateLimited(request, user.id);
  if (userLimit) return userLimit;

  const expectedPin = process.env.ADMIN_PIN;

  if (!expectedPin) {
    return createApiResponse({ error: "admin not configured" }, { status: 500 });
  }

  if (expectedPin.length < MIN_ADMIN_PIN_LENGTH) {
    console.error("[admin/verify] ADMIN_PIN is too short");
    return createApiResponse({ error: "admin not configured" }, { status: 500 });
  }

  if (!constantTimeEqual(parsed.data.pin, expectedPin)) {
    return createApiResponse({ error: "invalid pin" }, { status: 403 });
  }

  return createApiResponse({ ok: true });
}

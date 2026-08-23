import { createApiResponse, parseMutationBody } from "@/lib/apiHeaders";
import { getClientIP } from "@/lib/clientIp";
import { checkRateLimit, createRateLimiter } from "@/lib/rateLimit";
import { createClient } from "@/lib/supabase/server";
import { TrainingLevelPreferenceRequestSchema } from "@/types/schemas";

export const runtime = "nodejs";

const rateLimiter = createRateLimiter();

export async function POST(request: Request) {
  const rawBody = await parseMutationBody(request);
  if (rawBody instanceof Response) return rawBody;

  const parsed = TrainingLevelPreferenceRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return createApiResponse({ error: "invalid_request" }, { status: 400 });
  }

  // Throttle before the auth round-trip so an unauthenticated flood cannot
  // drive Supabase calls. Own key namespace so it shares no budget with the
  // other routes' limiters.
  const limitRes = await checkRateLimit(
    rateLimiter,
    `${getClientIP(request)}:training-level`,
    "[profile/training-level]",
  );
  if (limitRes) return limitRes;

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return createApiResponse({ error: "unauthenticated" }, { status: 401 });
  }

  const { level } = parsed.data;
  const { error } = await supabase.from("profiles").upsert(
    {
      user_id: user.id,
      training_level: level,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error("[profile/training-level] failed to update profile", {
      userId: user.id,
      message: error.message,
    });
    return createApiResponse({ error: "profile_update_failed" }, { status: 500 });
  }

  return createApiResponse({ ok: true, level });
}

import { createApiResponse, parseMutationBody } from "@/lib/apiHeaders";
import { createClient } from "@/lib/supabase/server";
import { TrainingLevelPreferenceRequestSchema } from "@/types/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const rawBody = await parseMutationBody(request);
  if (rawBody instanceof Response) return rawBody;

  const parsed = TrainingLevelPreferenceRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return createApiResponse({ error: "invalid_request" }, { status: 400 });
  }

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

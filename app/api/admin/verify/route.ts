import { createApiResponse } from "@/lib/apiHeaders";
import { isSameOriginMutationRequest } from "@/lib/requestSecurity";
import { createClient as createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOriginMutationRequest(request)) {
    return createApiResponse({ error: "forbidden" }, { status: 403 });
  }

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return createApiResponse({ error: "unauthorized" }, { status: 401 });
  }

  const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase());

  if (!adminEmails.includes(user.email.toLowerCase())) {
    return createApiResponse({ error: "forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as { pin?: string };
  const expectedPin = process.env.ADMIN_PIN;

  if (!expectedPin) {
    return createApiResponse({ error: "admin not configured" }, { status: 500 });
  }

  if (body.pin !== expectedPin) {
    return createApiResponse({ error: "invalid pin" }, { status: 403 });
  }

  return createApiResponse({ ok: true });
}

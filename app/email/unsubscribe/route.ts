import { NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type UnsubscribeResult = "unsubscribed" | "unsubscribe_invalid" | "unsubscribe_failed";

async function markEmailOptOut(token: string | null | undefined): Promise<UnsubscribeResult> {
  const trimmed = token?.trim();
  if (!trimmed) return "unsubscribe_invalid";

  try {
    const admin = createServiceClient();
    const { data, error } = await admin
      .from("profiles")
      .update({ email_opt_out: true, updated_at: new Date().toISOString() })
      .eq("email_unsubscribe_token", trimmed)
      .select("user_id")
      .maybeSingle();

    if (error) return "unsubscribe_failed";
    return data ? "unsubscribed" : "unsubscribe_invalid";
  } catch (error) {
    console.warn("[email/unsubscribe] failed", error);
    return "unsubscribe_failed";
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim();
  const redirectUrl = new URL("/en", url.origin);

  redirectUrl.searchParams.set("email", await markEmailOptOut(token));
  return NextResponse.redirect(redirectUrl);
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const result = await markEmailOptOut(url.searchParams.get("token"));
  return new Response(null, { status: result === "unsubscribe_failed" ? 500 : 200 });
}

import { NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim();
  const redirectUrl = new URL("/en", url.origin);

  if (!token) {
    redirectUrl.searchParams.set("email", "unsubscribe_invalid");
    return NextResponse.redirect(redirectUrl);
  }

  try {
    const admin = createServiceClient();
    const { error } = await admin
      .from("profiles")
      .update({ email_opt_out: true, updated_at: new Date().toISOString() })
      .eq("email_unsubscribe_token", token);

    redirectUrl.searchParams.set("email", error ? "unsubscribe_failed" : "unsubscribed");
  } catch (error) {
    console.warn("[email/unsubscribe] failed", error);
    redirectUrl.searchParams.set("email", "unsubscribe_failed");
  }

  return NextResponse.redirect(redirectUrl);
}

import { createApiResponse } from "@/lib/apiHeaders";
import { isSameOriginMutationRequest } from "@/lib/requestSecurity";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function isAdmin(email: string | undefined | null): boolean {
  const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase());
  return !!email && adminEmails.includes(email.toLowerCase());
}

async function verifyAdmin() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !isAdmin(user.email)) {
    return null;
  }
  return user;
}

export async function GET() {
  const user = await verifyAdmin();
  if (!user) {
    return createApiResponse({ error: "forbidden" }, { status: 403 });
  }

  const admin = createServiceClient();
  const { data, error } = await admin
    .from("manual_grants")
    .select("email, expires_at, granted_by, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return createApiResponse({ error: error.message }, { status: 500 });
  }

  return createApiResponse({ grants: data ?? [] });
}

export async function POST(request: Request) {
  if (!isSameOriginMutationRequest(request)) {
    return createApiResponse({ error: "forbidden" }, { status: 403 });
  }

  const user = await verifyAdmin();
  if (!user) {
    return createApiResponse({ error: "forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    email?: string;
    days?: number;
    granted_by?: string;
  };

  const email = body.email?.trim().toLowerCase();
  const days = body.days;

  if (!email || !email.includes("@")) {
    return createApiResponse({ error: "invalid email" }, { status: 400 });
  }
  if (!days || days < 1 || days > 3650) {
    return createApiResponse({ error: "days must be 1-3650" }, { status: 400 });
  }

  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  const admin = createServiceClient();
  const { error } = await admin.from("manual_grants").upsert(
    {
      email,
      expires_at: expiresAt,
      granted_by: body.granted_by ?? "admin",
    },
    { onConflict: "email" },
  );

  if (error) {
    return createApiResponse({ error: error.message }, { status: 500 });
  }

  return createApiResponse({ ok: true, email, expires_at: expiresAt });
}

export async function DELETE(request: Request) {
  if (!isSameOriginMutationRequest(request)) {
    return createApiResponse({ error: "forbidden" }, { status: 403 });
  }

  const user = await verifyAdmin();
  if (!user) {
    return createApiResponse({ error: "forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as { email?: string };
  const email = body.email?.trim().toLowerCase();

  if (!email) {
    return createApiResponse({ error: "email required" }, { status: 400 });
  }

  const admin = createServiceClient();
  const { error } = await admin.from("manual_grants").delete().eq("email", email);

  if (error) {
    return createApiResponse({ error: error.message }, { status: 500 });
  }

  return createApiResponse({ ok: true });
}

import { z } from "zod";

import { createApiResponse, parseMutationBody } from "@/lib/apiHeaders";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const GrantRequestSchema = z.object({
  email: z.string().trim().email().max(320),
  days: z.number().int().min(1).max(3650),
  granted_by: z.string().trim().min(1).max(120).optional(),
});

const RevokeRequestSchema = z.object({
  email: z.string().trim().email().max(320),
});

function isAdmin(userId: string | undefined | null): boolean {
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map((id) => id.trim());
  return !!userId && adminIds.includes(userId);
}

async function verifyAdmin() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id || !isAdmin(user.id)) {
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
  const rawBody = await parseMutationBody(request);
  if (rawBody instanceof Response) return rawBody;

  const user = await verifyAdmin();
  if (!user) {
    return createApiResponse({ error: "forbidden" }, { status: 403 });
  }

  const parsed = GrantRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return createApiResponse({ error: "invalid_request" }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  const { days } = parsed.data;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  const admin = createServiceClient();
  const { error } = await admin.from("manual_grants").upsert(
    {
      email,
      expires_at: expiresAt,
      granted_by: parsed.data.granted_by ?? "admin",
    },
    { onConflict: "email" },
  );

  if (error) {
    return createApiResponse({ error: error.message }, { status: 500 });
  }

  return createApiResponse({ ok: true, email, expires_at: expiresAt });
}

export async function DELETE(request: Request) {
  const rawBody = await parseMutationBody(request);
  if (rawBody instanceof Response) return rawBody;

  const user = await verifyAdmin();
  if (!user) {
    return createApiResponse({ error: "forbidden" }, { status: 403 });
  }

  const parsed = RevokeRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return createApiResponse({ error: "invalid_request" }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  const admin = createServiceClient();
  const { error } = await admin.from("manual_grants").delete().eq("email", email);

  if (error) {
    return createApiResponse({ error: error.message }, { status: 500 });
  }

  return createApiResponse({ ok: true });
}

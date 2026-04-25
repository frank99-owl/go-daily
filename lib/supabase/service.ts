import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client that bypasses RLS. Use ONLY in trusted
 * server contexts (webhooks, admin route handlers, cron jobs). Must never
 * be imported from client components or edge code that flows to browsers.
 */
if (typeof window !== "undefined") {
  throw new Error(
    "lib/supabase/service.ts must only be imported on the server. " +
      "Check that your client component is not importing this module.",
  );
}

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set (server-only secret).");
  }
  return createSupabaseClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

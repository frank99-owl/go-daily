import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client. Safe to import from "use client" components.
 * Uses the publishable (anon) key; row-level security gates access.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!key) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set");
  return createBrowserClient(url, key);
}

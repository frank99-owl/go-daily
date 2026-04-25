import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

/**
 * Supabase session-refresh helper for the root middleware (`proxy.ts`).
 *
 * Mutates cookies on the caller-provided `response` so the caller can
 * decide whether to `NextResponse.next()`, redirect, or rewrite while
 * still propagating a fresh access token.
 *
 * Contract:
 *   - Reads cookies from `request`.
 *   - Writes refreshed cookies onto `response`.
 *   - Returns the authenticated user (or null) so callers can implement
 *     auth guards without re-issuing another Supabase call.
 *
 * Missing Supabase env vars short-circuits to anonymous — useful during
 * local bring-up before keys are wired.
 */
export async function refreshSupabaseSession(
  request: NextRequest,
  response: NextResponse,
): Promise<{ user: { id: string } | null }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { user: null };

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // Never put logic between createServerClient and auth.getUser — doing so
  // breaks cookie propagation and leads to sporadic logouts.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { user: user ? { id: user.id } : null };
}

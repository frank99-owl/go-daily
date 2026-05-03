import { NextResponse } from "next/server";

/**
 * Lightweight health check for uptime monitoring.
 * Probes Supabase auth settings (no DB query, no service-role key).
 * Returns 200 if the app + Supabase are reachable, 503 otherwise.
 */
export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const checks: Record<string, "ok" | "error" | "skipped"> = {};
  let healthy = true;

  // Supabase connectivity — probe the auth settings endpoint
  if (supabaseUrl && anonKey) {
    try {
      const res = await fetch(`${supabaseUrl}/auth/v1/settings`, {
        headers: { apikey: anonKey },
        signal: AbortSignal.timeout(5000),
      });
      checks.supabase = res.ok ? "ok" : "error";
      if (!res.ok) healthy = false;
    } catch {
      checks.supabase = "error";
      healthy = false;
    }
  } else {
    checks.supabase = "skipped";
  }

  const status = healthy ? 200 : 503;
  return NextResponse.json(
    {
      status: healthy ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      checks,
    },
    { status },
  );
}

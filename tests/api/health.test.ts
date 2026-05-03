import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/health/route";

// Mock NextResponse
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) =>
      new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: { "Content-Type": "application/json" },
      }),
  },
}));

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns healthy when Supabase responds ok", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }),
    );

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("healthy");
    expect(body.checks.supabase).toBe("ok");
    expect(body.timestamp).toBeDefined();
  });

  it("returns degraded when Supabase returns error status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("error", { status: 500 }));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.checks.supabase).toBe("error");
  });

  it("returns degraded when Supabase fetch throws", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("network"));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.checks.supabase).toBe("error");
  });

  it("skips Supabase check when env vars are missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("healthy");
    expect(body.checks.supabase).toBe("skipped");
  });
});

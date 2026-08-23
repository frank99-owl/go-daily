/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: supabaseMocks.createClient,
}));

import { POST } from "@/app/api/profile/training-level/route";

// Each call gets a fresh, valid-looking IPv4 so the route's module-level rate
// limiter keys per-test instead of pooling every request under one sentinel.
let ipCounter = 0;
function nextTestIp(): string {
  ipCounter = (ipCounter + 1) % (1 << 24);
  return `10.${(ipCounter >> 16) & 0xff}.${(ipCounter >> 8) & 0xff}.${ipCounter & 0xff}`;
}

function request(body: unknown, headers: HeadersInit = {}): Request {
  return new Request("http://localhost/api/profile/training-level", {
    method: "POST",
    headers: {
      origin: "http://localhost",
      "content-type": "application/json",
      "x-forwarded-for": nextTestIp(),
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("/api/profile/training-level", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    supabaseMocks.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    supabaseMocks.upsert.mockResolvedValue({ error: null });
    supabaseMocks.createClient.mockResolvedValue({
      auth: { getUser: supabaseMocks.getUser },
      from: vi.fn(() => ({ upsert: supabaseMocks.upsert })),
    });
  });

  it("persists the authenticated user's training level", async () => {
    const response = await POST(request({ level: "advanced" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, level: "advanced" });
    expect(supabaseMocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        training_level: "advanced",
        updated_at: expect.any(String),
      }),
      { onConflict: "user_id" },
    );
  });

  it("requires an authenticated user", async () => {
    supabaseMocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await POST(request({ level: "beginner" }));

    expect(response.status).toBe(401);
    expect(supabaseMocks.upsert).not.toHaveBeenCalled();
  });

  it("rate limits before the auth round-trip", async () => {
    const ip = nextTestIp();
    let limited: Response | null = null;
    // The route's limiter is real (memory-backed in tests), so hammer a single
    // IP until it trips rather than reaching into module internals.
    for (let i = 0; i < 40; i++) {
      const response = await POST(request({ level: "beginner" }, { "x-forwarded-for": ip }));
      if (response.status === 429) {
        limited = response;
        break;
      }
    }

    expect(limited).not.toBeNull();
    await expect(limited!.json()).resolves.toEqual({ error: "Too many requests, slow down." });

    // Once tripped, a further request must not reach Supabase at all.
    supabaseMocks.createClient.mockClear();
    const after = await POST(request({ level: "beginner" }, { "x-forwarded-for": ip }));
    expect(after.status).toBe(429);
    expect(supabaseMocks.createClient).not.toHaveBeenCalled();
  });

  it("rejects invalid levels", async () => {
    const response = await POST(request({ level: "30kyu" }));

    expect(response.status).toBe(400);
    expect(supabaseMocks.upsert).not.toHaveBeenCalled();
  });

  it("rejects cross-origin writes", async () => {
    const response = await POST(request({ level: "beginner" }, { origin: "https://evil.test" }));

    expect(response.status).toBe(403);
    expect(supabaseMocks.upsert).not.toHaveBeenCalled();
  });
});

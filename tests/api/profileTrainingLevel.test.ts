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

function request(body: unknown, headers: HeadersInit = {}): Request {
  return new Request("http://localhost/api/profile/training-level", {
    method: "POST",
    headers: {
      origin: "http://localhost",
      "content-type": "application/json",
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

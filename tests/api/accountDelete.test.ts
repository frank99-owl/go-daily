/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  createServiceClient: vi.fn(),
  getUser: vi.fn(),
  deleteUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createServerClient,
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: mocks.createServiceClient,
}));

import { POST } from "@/app/api/account/delete/route";

function makeRequest(headers: HeadersInit = {}) {
  return new Request("https://go-daily.app/api/account/delete", {
    method: "POST",
    headers,
  });
}

describe("/api/account/delete", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createServerClient.mockResolvedValue({
      auth: { getUser: mocks.getUser },
    });
    mocks.createServiceClient.mockReturnValue({
      auth: { admin: { deleteUser: mocks.deleteUser } },
    });
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mocks.deleteUser.mockResolvedValue({ error: null });
  });

  it("rejects cross-origin deletes before reading the session", async () => {
    const response = await POST(makeRequest({ origin: "https://evil.example" }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "forbidden" });
    expect(mocks.createServerClient).not.toHaveBeenCalled();
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it("rejects browser fetch metadata that marks the request cross-site", async () => {
    const response = await POST(makeRequest({ "sec-fetch-site": "cross-site" }));

    expect(response.status).toBe(403);
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });

  it("deletes the signed-in user for same-origin requests", async () => {
    const response = await POST(makeRequest({ origin: "https://go-daily.app" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.deleteUser).toHaveBeenCalledWith("user-1");
  });

  it("returns 401 when there is no signed-in user", async () => {
    mocks.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    const response = await POST(makeRequest({ origin: "https://go-daily.app" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthenticated" });
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });
});

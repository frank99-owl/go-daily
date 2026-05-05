/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  createServiceClient: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createServerClient,
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: mocks.createServiceClient,
}));

import { POST } from "@/app/api/auth/device/route";

type QueryResult = { data?: unknown; error?: { message: string } | null };

function query(result: QueryResult, upsertMock?: ReturnType<typeof vi.fn>) {
  const q: Record<string, unknown> = {
    select: vi.fn(() => q),
    eq: vi.fn(() => q),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    upsert: upsertMock ?? vi.fn(() => Promise.resolve({ error: null })),
    then: (resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return q;
}

function buildAdminClient({
  subscription = null,
  manualGrant = null,
  devices = [],
  devicesError = null,
  upsertError = null,
}: {
  subscription?: { status: string | null } | null;
  manualGrant?: { expires_at: string } | null;
  devices?: Array<{ device_id: string; last_seen: string | null }>;
  devicesError?: { message: string } | null;
  upsertError?: { message: string } | null;
} = {}) {
  const upsertMock = vi.fn(() => Promise.resolve({ error: upsertError }));
  return {
    upsertMock,
    from: vi.fn((table: string) => {
      switch (table) {
        case "subscriptions":
          return query({ data: subscription, error: null });
        case "manual_grants":
          return query({ data: manualGrant, error: null });
        case "user_devices":
          return query({ data: devices, error: devicesError }, upsertMock);
        default:
          return query({ data: null, error: null });
      }
    }),
  };
}

function makeRequest(body: unknown, headers: HeadersInit = {}) {
  return new Request("https://go-daily.app/api/auth/device", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://go-daily.app",
      "user-agent": "Vitest Browser",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("/api/auth/device", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createServerClient.mockResolvedValue({
      auth: { getUser: mocks.getUser },
    });
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "user@example.com" } },
      error: null,
    });
    mocks.createServiceClient.mockReturnValue(buildAdminClient());
  });

  it("rejects cross-origin registration before reading the session", async () => {
    const response = await POST(
      makeRequest({ deviceId: "device-1" }, { origin: "https://evil.example" }),
    );

    expect(response.status).toBe(403);
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });

  it("returns 401 without a signed-in user", async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });

    const response = await POST(makeRequest({ deviceId: "device-1" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthenticated" });
  });

  it("rejects invalid device IDs", async () => {
    const response = await POST(makeRequest({ deviceId: "x".repeat(129) }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid device ID." });
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });

  it("registers a new free device when no seat is used", async () => {
    const admin = buildAdminClient({
      subscription: { status: null },
      devices: [],
    });
    mocks.createServiceClient.mockReturnValue(admin);

    const response = await POST(makeRequest({ deviceId: "device-1" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      access: "allow-new",
      deviceId: "device-1",
      existingDeviceCount: 1,
    });
    expect(admin.upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        device_id: "device-1",
        user_agent: "Vitest Browser",
      }),
      { onConflict: "user_id,device_id" },
    );
  });

  it("blocks a free user when another device is already registered", async () => {
    const admin = buildAdminClient({
      subscription: { status: null },
      devices: [{ device_id: "existing-device", last_seen: "2026-04-20T00:00:00Z" }],
    });
    mocks.createServiceClient.mockReturnValue(admin);

    const response = await POST(makeRequest({ deviceId: "new-device" }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      access: "block-free-device-limit",
      error: "device_limit",
      existingDeviceCount: 1,
    });
    expect(admin.upsertMock).not.toHaveBeenCalled();
  });

  it("allows a manually granted pro user to register the third device", async () => {
    const admin = buildAdminClient({
      subscription: { status: null },
      manualGrant: { expires_at: "2999-01-01T00:00:00.000Z" },
      devices: [
        { device_id: "first-device", last_seen: "2026-04-20T00:00:00Z" },
        { device_id: "second-device", last_seen: "2026-04-21T00:00:00Z" },
      ],
    });
    mocks.createServiceClient.mockReturnValue(admin);

    const response = await POST(makeRequest({ deviceId: "third-device" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      access: "allow-new",
      deviceId: "third-device",
      existingDeviceCount: 3,
    });
    expect(admin.upsertMock).toHaveBeenCalled();
  });
});

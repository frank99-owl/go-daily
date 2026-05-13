/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  createServiceClient: vi.fn(),
  getUser: vi.fn(),
  isLimited: vi.fn(),
  serviceFrom: vi.fn(),
  upsertGrant: vi.fn(),
  deleteEq: vi.fn(),
}));

vi.mock("@/lib/rateLimit", () => ({
  createRateLimiter: () => ({
    isLimited: mocks.isLimited,
  }),
  isRateLimiterConfigurationError: (error: unknown) =>
    error instanceof Error && error.name === "RateLimiterConfigurationError",
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createServerClient,
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: mocks.createServiceClient,
}));

import { DELETE as grantsDELETE, POST as grantsPOST } from "@/app/api/admin/grants/route";
import { POST as verifyPOST } from "@/app/api/admin/verify/route";

const originalEnv = process.env;

function jsonRequest(path: string, body: unknown, headers: HeadersInit = {}) {
  return new Request(`https://go-daily.app${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://go-daily.app",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function deleteRequest(body: unknown, headers: HeadersInit = {}) {
  return new Request("https://go-daily.app/api/admin/grants", {
    method: "DELETE",
    headers: {
      "content-type": "application/json",
      origin: "https://go-daily.app",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function serviceClient() {
  const deleteChain = {
    eq: mocks.deleteEq,
  };
  const table = {
    upsert: mocks.upsertGrant,
    delete: vi.fn(() => deleteChain),
  };
  mocks.serviceFrom.mockReturnValue(table);
  return { from: mocks.serviceFrom };
}

describe("admin routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env = {
      ...originalEnv,
      ADMIN_EMAILS: "admin@example.com",
      ADMIN_USER_IDS: "user-admin",
      ADMIN_PIN: "long-random-admin-code",
    };
    mocks.isLimited.mockResolvedValue(false);
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-admin", email: "admin@example.com" } },
      error: null,
    });
    mocks.createServerClient.mockResolvedValue({
      auth: { getUser: mocks.getUser },
    });
    mocks.createServiceClient.mockReturnValue(serviceClient());
    mocks.upsertGrant.mockResolvedValue({ error: null });
    mocks.deleteEq.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("/api/admin/verify", () => {
    it("rejects cross-origin requests before auth lookup", async () => {
      const response = await verifyPOST(
        jsonRequest(
          "/api/admin/verify",
          { pin: "long-random-admin-code" },
          {
            origin: "https://evil.example",
          },
        ),
      );

      expect(response.status).toBe(403);
      expect(mocks.createServerClient).not.toHaveBeenCalled();
    });

    it("rate limits verification attempts before auth lookup", async () => {
      mocks.isLimited.mockResolvedValueOnce(true);

      const response = await verifyPOST(
        jsonRequest("/api/admin/verify", { pin: "long-random-admin-code" }),
      );

      expect(response.status).toBe(429);
      await expect(response.json()).resolves.toEqual({ error: "too_many_requests" });
      expect(mocks.createServerClient).not.toHaveBeenCalled();
    });

    it("rejects weak server-side admin secrets", async () => {
      process.env.ADMIN_PIN = "123456";

      const response = await verifyPOST(jsonRequest("/api/admin/verify", { pin: "123456" }));

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({ error: "admin not configured" });
    });

    it("verifies the admin code for an allowed admin email", async () => {
      const response = await verifyPOST(
        jsonRequest("/api/admin/verify", { pin: "long-random-admin-code" }),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
      expect(mocks.isLimited).toHaveBeenCalledWith("admin-verify:unknown");
      expect(mocks.isLimited).toHaveBeenCalledWith("admin-verify:user:user-admin");
    });

    it("rejects the wrong admin code", async () => {
      const response = await verifyPOST(
        jsonRequest("/api/admin/verify", { pin: "wrong-random-admin-code" }),
      );

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({ error: "invalid pin" });
    });
  });

  describe("/api/admin/grants", () => {
    it("rejects cross-origin grant writes before auth lookup", async () => {
      const response = await grantsPOST(
        jsonRequest(
          "/api/admin/grants",
          { email: "user@example.com", days: 30 },
          { origin: "https://evil.example" },
        ),
      );

      expect(response.status).toBe(403);
      expect(mocks.createServerClient).not.toHaveBeenCalled();
    });

    it("rejects oversized grant bodies before auth lookup", async () => {
      const response = await grantsPOST(
        jsonRequest("/api/admin/grants", {
          email: "user@example.com",
          days: 30,
          granted_by: "x".repeat(3_000),
        }),
      );

      expect(response.status).toBe(413);
      expect(mocks.createServerClient).not.toHaveBeenCalled();
    });

    it("validates and normalizes grant input before writing", async () => {
      const response = await grantsPOST(
        jsonRequest("/api/admin/grants", {
          email: "  User@Example.COM  ",
          days: 30,
          granted_by: "Frank",
        }),
      );

      expect(response.status).toBe(200);
      expect(mocks.upsertGrant).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "user@example.com",
          granted_by: "Frank",
        }),
        { onConflict: "email" },
      );
    });

    it("rejects invalid grant emails", async () => {
      const response = await grantsPOST(
        jsonRequest("/api/admin/grants", { email: "not-an-email", days: 30 }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "invalid_request" });
      expect(mocks.upsertGrant).not.toHaveBeenCalled();
    });

    it("validates and normalizes revoke input before deleting", async () => {
      const response = await grantsDELETE(deleteRequest({ email: " User@Example.COM " }));

      expect(response.status).toBe(200);
      expect(mocks.deleteEq).toHaveBeenCalledWith("email", "user@example.com");
    });
  });
});

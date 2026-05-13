/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  createServiceClient: vi.fn(),
  getUser: vi.fn(),
  deleteUser: vi.fn(),
  subscriptionQuery: vi.fn(),
  cancelSubscription: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createServerClient,
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: mocks.createServiceClient,
}));

vi.mock("@/lib/stripe/server", () => ({
  getStripeClient: () => ({
    subscriptions: { cancel: mocks.cancelSubscription },
  }),
}));

import { POST } from "@/app/api/account/delete/route";

type QueryResult = { data?: unknown; error?: { message: string } | null };

function makeRequest(headers: HeadersInit = {}) {
  return new Request("https://go-daily.app/api/account/delete", {
    method: "POST",
    headers,
  });
}

function query(result: QueryResult) {
  const q: Record<string, unknown> = {
    select: vi.fn(() => q),
    eq: vi.fn(() => q),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
  };
  return q;
}

describe("/api/account/delete", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createServerClient.mockResolvedValue({
      auth: { getUser: mocks.getUser },
    });
    mocks.createServiceClient.mockReturnValue({
      auth: { admin: { deleteUser: mocks.deleteUser } },
      from: mocks.subscriptionQuery,
    });
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mocks.deleteUser.mockResolvedValue({ error: null });
    mocks.cancelSubscription.mockResolvedValue({ id: "sub_1", status: "canceled" });
    mocks.subscriptionQuery.mockReturnValue(query({ data: null, error: null }));
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

  it("cancels an active Stripe subscription before deleting the user", async () => {
    mocks.subscriptionQuery.mockReturnValue(
      query({
        data: { stripe_subscription_id: "sub_active", status: "active" },
        error: null,
      }),
    );

    const response = await POST(makeRequest({ origin: "https://go-daily.app" }));

    expect(response.status).toBe(200);
    expect(mocks.cancelSubscription).toHaveBeenCalledWith("sub_active");
    expect(mocks.deleteUser).toHaveBeenCalledWith("user-1");
  });

  it("does not delete the user when Stripe cancellation fails", async () => {
    mocks.subscriptionQuery.mockReturnValue(
      query({
        data: { stripe_subscription_id: "sub_active", status: "active" },
        error: null,
      }),
    );
    mocks.cancelSubscription.mockRejectedValueOnce(new Error("stripe unavailable"));

    const response = await POST(makeRequest({ origin: "https://go-daily.app" }));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "subscription_cancel_failed" });
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it("skips Stripe cancellation for terminal subscription statuses", async () => {
    mocks.subscriptionQuery.mockReturnValue(
      query({
        data: { stripe_subscription_id: "sub_canceled", status: "canceled" },
        error: null,
      }),
    );

    const response = await POST(makeRequest({ origin: "https://go-daily.app" }));

    expect(response.status).toBe(200);
    expect(mocks.cancelSubscription).not.toHaveBeenCalled();
    expect(mocks.deleteUser).toHaveBeenCalledWith("user-1");
  });

  it("does not delete the user when subscription lookup fails", async () => {
    mocks.subscriptionQuery.mockReturnValue(
      query({ data: null, error: { message: "database unavailable" } }),
    );

    const response = await POST(makeRequest({ origin: "https://go-daily.app" }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "subscription_lookup_failed" });
    expect(mocks.deleteUser).not.toHaveBeenCalled();
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

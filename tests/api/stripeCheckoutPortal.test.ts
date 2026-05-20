/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkoutSessionCreate: vi.fn(),
  createClient: vi.fn(),
  getUser: vi.fn(),
  portalSessionCreate: vi.fn(),
  subscriptionQuery: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/stripe/server", () => ({
  getStripeClient: () => ({
    checkout: { sessions: { create: mocks.checkoutSessionCreate } },
    billingPortal: { sessions: { create: mocks.portalSessionCreate } },
  }),
  getProPriceId: (interval: "monthly" | "yearly") =>
    interval === "monthly" ? "price_monthly" : "price_yearly",
  getStripeTrialDays: () => 3,
  intervalToPlan: (interval: "monthly" | "yearly") =>
    interval === "monthly" ? "pro_monthly" : "pro_yearly",
}));

import { POST as checkoutPOST } from "@/app/api/stripe/checkout/route";
import { POST as portalPOST } from "@/app/api/stripe/portal/route";

type QueryResult = { data?: unknown; error?: { message: string } | null };

function query(result: QueryResult) {
  const q: Record<string, unknown> = {
    select: vi.fn(() => q),
    eq: vi.fn(() => q),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
  };
  return q;
}

function postRequest({
  path,
  body,
  origin = "https://go-daily.app",
  referer = "https://go-daily.app/zh/pricing",
  contentType = "application/json",
  forwardedFor,
}: {
  path: string;
  body?: unknown;
  origin?: string;
  referer?: string;
  contentType?: string;
  forwardedFor?: string;
}) {
  const headers: Record<string, string> = {
    origin,
    referer,
  };
  if (contentType) headers["content-type"] = contentType;
  if (forwardedFor) headers["x-forwarded-for"] = forwardedFor;

  return new Request(`https://go-daily.app${path}`, {
    method: "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("Stripe subscription API routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user_1", email: "user@example.com" } },
      error: null,
    });
    mocks.createClient.mockResolvedValue({
      auth: { getUser: mocks.getUser },
      from: mocks.subscriptionQuery,
    });
    mocks.checkoutSessionCreate.mockResolvedValue({
      url: "https://checkout.stripe.test/session_1",
    });
    mocks.portalSessionCreate.mockResolvedValue({
      url: "https://billing.stripe.test/session_1",
    });
    mocks.subscriptionQuery.mockReturnValue(query({ data: null, error: null }));
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.STRIPE_PRO_MONTHLY_PRICE_ID = "price_monthly";
    process.env.STRIPE_PRO_YEARLY_PRICE_ID = "price_yearly";
  });

  describe("/api/stripe/checkout", () => {
    it("creates a subscription Checkout session with locale-aware return URLs", async () => {
      const response = await checkoutPOST(
        postRequest({
          path: "/api/stripe/checkout",
          body: { interval: "monthly" },
          referer: "https://go-daily.app/zh/pricing",
        }),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        url: "https://checkout.stripe.test/session_1",
      });
      expect(mocks.checkoutSessionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "subscription",
          line_items: [{ price: "price_monthly", quantity: 1 }],
          success_url: "https://go-daily.app/zh/account?checkout=success",
          cancel_url: "https://go-daily.app/zh/pricing",
          client_reference_id: "user_1",
          customer_email: "user@example.com",
          metadata: { user_id: "user_1", plan: "pro_monthly" },
          subscription_data: {
            trial_period_days: 3,
            metadata: { user_id: "user_1", plan: "pro_monthly" },
          },
        }),
      );
    });

    it("rejects cross-origin checkout attempts before reading the user", async () => {
      const response = await checkoutPOST(
        postRequest({
          path: "/api/stripe/checkout",
          body: { interval: "yearly" },
          origin: "https://evil.example",
        }),
      );

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({ error: "forbidden" });
      expect(mocks.getUser).not.toHaveBeenCalled();
      expect(mocks.checkoutSessionCreate).not.toHaveBeenCalled();
    });

    it("rejects invalid checkout intervals", async () => {
      const response = await checkoutPOST(
        postRequest({
          path: "/api/stripe/checkout",
          body: { interval: "weekly" },
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "invalid_request" });
      expect(mocks.checkoutSessionCreate).not.toHaveBeenCalled();
    });

    it("blocks checkout when the user already has a Pro subscription", async () => {
      mocks.subscriptionQuery.mockReturnValue(
        query({ data: { status: "active", stripe_customer_id: "cus_1" }, error: null }),
      );

      const response = await checkoutPOST(
        postRequest({
          path: "/api/stripe/checkout",
          body: { interval: "monthly" },
        }),
      );

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({ error: "already_subscribed" });
      expect(mocks.checkoutSessionCreate).not.toHaveBeenCalled();
    });

    it("reuses an existing Stripe customer for a lapsed subscription", async () => {
      mocks.subscriptionQuery.mockReturnValue(
        query({ data: { status: "canceled", stripe_customer_id: "cus_existing" }, error: null }),
      );

      const response = await checkoutPOST(
        postRequest({
          path: "/api/stripe/checkout",
          body: { interval: "yearly" },
        }),
      );

      expect(response.status).toBe(200);
      expect(mocks.checkoutSessionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: "cus_existing",
          line_items: [{ price: "price_yearly", quantity: 1 }],
          metadata: { user_id: "user_1", plan: "pro_yearly" },
        }),
      );
      expect(mocks.checkoutSessionCreate.mock.calls[0][0]).not.toHaveProperty("customer_email");
    });

    it("returns 500 when existing subscription lookup fails", async () => {
      mocks.subscriptionQuery.mockReturnValue(
        query({ data: null, error: { message: "database unavailable" } }),
      );

      const response = await checkoutPOST(
        postRequest({
          path: "/api/stripe/checkout",
          body: { interval: "monthly" },
        }),
      );

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({ error: "subscription_lookup_failed" });
      expect(mocks.checkoutSessionCreate).not.toHaveBeenCalled();
    });

    it("rate limits checkout by user even when the IP changes", async () => {
      let status = 200;
      for (let index = 0; index < 15; index++) {
        const response = await checkoutPOST(
          postRequest({
            path: "/api/stripe/checkout",
            body: { interval: "monthly" },
            forwardedFor: `203.0.113.${index + 1}`,
          }),
        );
        status = response.status;
        if (status === 429) break;
      }

      expect(status).toBe(429);
    });
  });

  describe("/api/stripe/portal", () => {
    it("creates a billing portal session for the current user's customer", async () => {
      mocks.subscriptionQuery.mockReturnValue(
        query({ data: { stripe_customer_id: "cus_1" }, error: null }),
      );

      const response = await portalPOST(
        postRequest({
          path: "/api/stripe/portal",
          referer: "https://go-daily.app/ja/pricing",
        }),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        url: "https://billing.stripe.test/session_1",
      });
      expect(mocks.portalSessionCreate).toHaveBeenCalledWith({
        customer: "cus_1",
        return_url: "https://go-daily.app/ja/account",
      });
    });

    it("returns no_subscription when the user has no Stripe customer", async () => {
      mocks.subscriptionQuery.mockReturnValue(query({ data: null, error: null }));

      const response = await portalPOST(
        postRequest({
          path: "/api/stripe/portal",
          referer: "https://go-daily.app/en/account",
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "no_subscription" });
      expect(mocks.portalSessionCreate).not.toHaveBeenCalled();
    });
  });
});

/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
  createPortalSession: vi.fn(),
  constructEvent: vi.fn(),
  retrieveSubscription: vi.fn(),
  sendPaymentFailedEmail: vi.fn(),
  captureServerEvent: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: mocks.createServiceClient,
}));

vi.mock("@/lib/stripe/server", () => ({
  getStripeClient: () => ({
    billingPortal: { sessions: { create: mocks.createPortalSession } },
    webhooks: { constructEvent: mocks.constructEvent },
    subscriptions: { retrieve: mocks.retrieveSubscription },
  }),
  inferPlanFromPriceId: (priceId: string | null | undefined) =>
    priceId === "price_monthly" ? "pro_monthly" : null,
}));

vi.mock("@/lib/email", () => ({
  sendPaymentFailedEmail: mocks.sendPaymentFailedEmail,
}));

vi.mock("@/lib/posthog/server", () => ({
  captureServerEvent: mocks.captureServerEvent,
}));

import { POST } from "@/app/api/stripe/webhook/route";

type QueryResult = { data?: unknown; error?: { code?: string; message: string } | null };

function query(result: QueryResult) {
  const q: Record<string, unknown> = {
    insert: vi.fn(() => Promise.resolve(result)),
    upsert: vi.fn(() => Promise.resolve(result)),
    update: vi.fn(() => q),
    select: vi.fn(() => q),
    eq: vi.fn(() => q),
    is: vi.fn(() => q),
    lt: vi.fn(() => q),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return q;
}

function request() {
  return new Request("https://go-daily.app/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": "sig" },
    body: "{}",
  });
}

function makeSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_1",
    customer: "cus_1",
    metadata: {},
    status: "active",
    cancel_at_period_end: false,
    trial_end: null,
    items: {
      data: [
        {
          price: { id: "price_monthly", recurring: { interval: "month" } },
          current_period_end: 1_777_000_000,
        },
      ],
    },
    ...overrides,
  };
}

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    parent: {
      type: "subscription_details",
      quote_details: null,
      subscription_details: { subscription: "sub_1", metadata: null },
    },
    amount_paid: 999,
    currency: "usd",
    ...overrides,
  };
}

describe("/api/stripe/webhook", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    delete process.env.NEXT_PUBLIC_SITE_URL;
    mocks.createPortalSession.mockResolvedValue({ url: "https://billing.stripe.test/session_1" });
    mocks.sendPaymentFailedEmail.mockResolvedValue({ sent: true, id: "email_1" });
  });

  it("skips already processed duplicate events before running subscription work", async () => {
    mocks.constructEvent.mockReturnValue({
      id: "evt_done",
      type: "checkout.session.completed",
      data: { object: { subscription: "sub_1", client_reference_id: "user_1" } },
    });

    const admin = {
      from: vi
        .fn()
        .mockReturnValueOnce(query({ error: { code: "23505", message: "duplicate" } }))
        .mockReturnValueOnce(
          query({
            data: { processed_at: "2026-04-23T00:00:00.000Z", processing_started_at: null },
            error: null,
          }),
        ),
    };
    mocks.createServiceClient.mockReturnValue(admin);

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, duplicate: true });
    expect(mocks.retrieveSubscription).not.toHaveBeenCalled();
  });

  it("uses checkout session client_reference_id as the user fallback", async () => {
    mocks.constructEvent.mockReturnValue({
      id: "evt_checkout",
      type: "checkout.session.completed",
      data: { object: { subscription: "sub_1", client_reference_id: "user_1" } },
    });
    mocks.retrieveSubscription.mockResolvedValue(makeSubscription());

    const subscriptionQ = query({ error: null });
    const admin = {
      from: vi
        .fn()
        .mockReturnValueOnce(query({ error: null })) // stripe_events insert claim
        .mockReturnValueOnce(subscriptionQ) // subscriptions select existing
        .mockReturnValueOnce(subscriptionQ) // subscriptions upsert
        .mockReturnValueOnce(query({ error: null })), // stripe_events mark processed
    };
    mocks.createServiceClient.mockReturnValue(admin);

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(subscriptionQ.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user_1",
        stripe_customer_id: "cus_1",
        stripe_subscription_id: "sub_1",
        plan: "pro_monthly",
        status: "active",
      }),
      { onConflict: "user_id" },
    );
  });

  it("captures trial_started for Checkout sessions that create a trial subscription", async () => {
    const trialEnd = Math.floor(new Date("2026-05-01T00:00:00.000Z").getTime() / 1000);
    mocks.constructEvent.mockReturnValue({
      id: "evt_checkout_trial",
      type: "checkout.session.completed",
      data: { object: { subscription: "sub_1", client_reference_id: "user_1" } },
    });
    mocks.retrieveSubscription.mockResolvedValue(
      makeSubscription({ status: "trialing", trial_end: trialEnd }),
    );

    const admin = {
      from: vi
        .fn()
        .mockReturnValueOnce(query({ error: null }))
        .mockReturnValueOnce(query({ data: null, error: null }))
        .mockReturnValueOnce(query({ error: null }))
        .mockReturnValueOnce(query({ error: null })),
    };
    mocks.createServiceClient.mockReturnValue(admin);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.captureServerEvent).toHaveBeenCalledWith({
      distinctId: "user_1",
      event: "trial_started",
      properties: expect.objectContaining({
        plan: "pro_monthly",
        interval: "monthly",
        subscriptionId: "sub_1",
        stripeCustomerId: "cus_1",
        trialEnd: "2026-05-01T00:00:00.000Z",
      }),
    });
  });

  describe("invoice.paid", () => {
    const firstPaidIso = "2026-05-12T00:00:00.000Z";
    const firstPaidEpochSeconds = Math.floor(new Date(firstPaidIso).getTime() / 1000);

    it("writes first_paid_at and coach_anchor_day on first real charge", async () => {
      mocks.constructEvent.mockReturnValue({
        id: "evt_invoice_first",
        type: "invoice.paid",
        data: {
          object: makeInvoice({
            status_transitions: { paid_at: firstPaidEpochSeconds },
          }),
        },
      });
      mocks.retrieveSubscription.mockResolvedValue(
        makeSubscription({ metadata: { user_id: "user_1" } }),
      );

      const existingSelect = query({ data: null, error: null });
      const upsert = query({ error: null });
      const admin = {
        from: vi
          .fn()
          .mockReturnValueOnce(query({ error: null })) // stripe_events insert claim
          .mockReturnValueOnce(existingSelect) // subscriptions select existing
          .mockReturnValueOnce(upsert) // subscriptions upsert
          .mockReturnValueOnce(query({ error: null })), // stripe_events mark processed
      };
      mocks.createServiceClient.mockReturnValue(admin);

      const response = await POST(request());

      expect(response.status).toBe(200);
      expect(mocks.retrieveSubscription).toHaveBeenCalledWith("sub_1");
      expect(upsert.upsert).toHaveBeenCalledTimes(1);
      expect(upsert.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "user_1",
          first_paid_at: firstPaidIso,
          coach_anchor_day: 12,
        }),
        { onConflict: "user_id" },
      );
      expect(mocks.captureServerEvent).toHaveBeenCalledWith({
        distinctId: "user_1",
        event: "subscription_activated",
        properties: expect.objectContaining({
          plan: "pro_monthly",
          interval: "monthly",
          subscriptionId: "sub_1",
          stripeCustomerId: "cus_1",
          revenueUsd: 9.99,
          currency: "usd",
        }),
      });
    });

    it("does not overwrite first_paid_at on subsequent invoice.paid events", async () => {
      const originalFirstPaidIso = "2026-05-12T00:00:00.000Z";
      const laterPaidEpochSeconds = Math.floor(
        new Date("2026-06-12T00:00:00.000Z").getTime() / 1000,
      );

      mocks.constructEvent.mockReturnValue({
        id: "evt_invoice_second",
        type: "invoice.paid",
        data: {
          object: makeInvoice({
            status_transitions: { paid_at: laterPaidEpochSeconds },
          }),
        },
      });
      mocks.retrieveSubscription.mockResolvedValue(
        makeSubscription({ metadata: { user_id: "user_1" } }),
      );

      const existingSelect = query({
        data: { first_paid_at: originalFirstPaidIso, coach_anchor_day: 12 },
        error: null,
      });
      const upsert = query({ error: null });
      const admin = {
        from: vi
          .fn()
          .mockReturnValueOnce(query({ error: null }))
          .mockReturnValueOnce(existingSelect)
          .mockReturnValueOnce(upsert)
          .mockReturnValueOnce(query({ error: null })),
      };
      mocks.createServiceClient.mockReturnValue(admin);

      const response = await POST(request());

      expect(response.status).toBe(200);
      expect(upsert.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          first_paid_at: originalFirstPaidIso,
          coach_anchor_day: 12,
        }),
        { onConflict: "user_id" },
      );
    });

    it("ignores trial invoice (amount_paid = 0) without touching subscriptions", async () => {
      mocks.constructEvent.mockReturnValue({
        id: "evt_invoice_trial",
        type: "invoice.paid",
        data: {
          object: makeInvoice({
            amount_paid: 0,
            status_transitions: { paid_at: firstPaidEpochSeconds },
          }),
        },
      });

      const admin = {
        from: vi
          .fn()
          .mockReturnValueOnce(query({ error: null })) // stripe_events insert claim
          .mockReturnValueOnce(query({ error: null })), // stripe_events mark processed
      };
      mocks.createServiceClient.mockReturnValue(admin);

      const response = await POST(request());

      expect(response.status).toBe(200);
      expect(mocks.retrieveSubscription).not.toHaveBeenCalled();
      expect(admin.from).toHaveBeenCalledTimes(2);
      // Only stripe_events table is touched, never subscriptions.
      const tablesTouched = admin.from.mock.calls.map((call) => call[0]);
      expect(tablesTouched).toEqual(["stripe_events", "stripe_events"]);
    });

    it("skips when invoice has no subscription id", async () => {
      mocks.constructEvent.mockReturnValue({
        id: "evt_invoice_orphan",
        type: "invoice.paid",
        data: {
          object: makeInvoice({
            parent: null,
            amount_paid: 999,
            status_transitions: { paid_at: firstPaidEpochSeconds },
          }),
        },
      });

      const admin = {
        from: vi
          .fn()
          .mockReturnValueOnce(query({ error: null }))
          .mockReturnValueOnce(query({ error: null })),
      };
      mocks.createServiceClient.mockReturnValue(admin);

      const response = await POST(request());

      expect(response.status).toBe(200);
      expect(mocks.retrieveSubscription).not.toHaveBeenCalled();
    });
  });

  describe("invoice.payment_failed", () => {
    it("marks the subscription past_due and sends a billing portal email", async () => {
      mocks.constructEvent.mockReturnValue({
        id: "evt_invoice_failed",
        type: "invoice.payment_failed",
        data: { object: makeInvoice() },
      });
      mocks.retrieveSubscription.mockResolvedValue(
        makeSubscription({ metadata: { user_id: "user_1" }, status: "active" }),
      );

      const existingSelect = query({
        data: { first_paid_at: "2026-05-12T00:00:00.000Z", coach_anchor_day: 12 },
        error: null,
      });
      const upsert = query({ error: null });
      const profileSelect = query({
        data: {
          locale: "zh",
          email_opt_out: false,
          email_unsubscribe_token: "tok_1",
        },
        error: null,
      });
      const admin = {
        auth: {
          admin: {
            getUserById: vi.fn().mockResolvedValue({
              data: { user: { email: "user@example.com" } },
              error: null,
            }),
          },
        },
        from: vi
          .fn()
          .mockReturnValueOnce(query({ error: null })) // stripe_events insert claim
          .mockReturnValueOnce(existingSelect) // subscriptions select existing
          .mockReturnValueOnce(upsert) // subscriptions upsert
          .mockReturnValueOnce(profileSelect) // profiles email state
          .mockReturnValueOnce(query({ error: null })), // stripe_events mark processed
      };
      mocks.createServiceClient.mockReturnValue(admin);

      const response = await POST(request());

      expect(response.status).toBe(200);
      expect(mocks.retrieveSubscription).toHaveBeenCalledWith("sub_1");
      expect(upsert.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "user_1",
          status: "past_due",
          first_paid_at: "2026-05-12T00:00:00.000Z",
          coach_anchor_day: 12,
        }),
        { onConflict: "user_id" },
      );
      expect(mocks.createPortalSession).toHaveBeenCalledWith({
        customer: "cus_1",
        return_url: "https://go-daily.app/zh/account",
      });
      expect(mocks.sendPaymentFailedEmail).toHaveBeenCalledWith({
        to: "user@example.com",
        locale: "zh",
        portalUrl: "https://billing.stripe.test/session_1",
        unsubscribeToken: "tok_1",
      });
      expect(mocks.captureServerEvent).toHaveBeenCalledWith({
        distinctId: "user_1",
        event: "subscription_past_due",
        properties: expect.objectContaining({
          plan: "pro_monthly",
          interval: "monthly",
          subscriptionId: "sub_1",
          stripeCustomerId: "cus_1",
        }),
      });
    });

    it("does not send billing email when the profile is opted out", async () => {
      mocks.constructEvent.mockReturnValue({
        id: "evt_invoice_failed_optout",
        type: "invoice.payment_failed",
        data: { object: makeInvoice() },
      });
      mocks.retrieveSubscription.mockResolvedValue(
        makeSubscription({ metadata: { user_id: "user_1" }, status: "active" }),
      );

      const upsert = query({ error: null });
      const admin = {
        auth: { admin: { getUserById: vi.fn() } },
        from: vi
          .fn()
          .mockReturnValueOnce(query({ error: null }))
          .mockReturnValueOnce(query({ data: null, error: null }))
          .mockReturnValueOnce(upsert)
          .mockReturnValueOnce(
            query({
              data: { locale: "en", email_opt_out: true, email_unsubscribe_token: "tok_1" },
              error: null,
            }),
          )
          .mockReturnValueOnce(query({ error: null })),
      };
      mocks.createServiceClient.mockReturnValue(admin);

      const response = await POST(request());

      expect(response.status).toBe(200);
      expect(mocks.sendPaymentFailedEmail).not.toHaveBeenCalled();
      expect(mocks.createPortalSession).not.toHaveBeenCalled();
    });
  });
});

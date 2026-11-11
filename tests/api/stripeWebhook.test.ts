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
  sendSubscriptionStartedEmail: vi.fn(),
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
  sendSubscriptionStartedEmail: mocks.sendSubscriptionStartedEmail,
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

/** When the renewal invoice was created — the start of the period it bills. */
const RENEWAL_FAILED_AT = 1_780_000_000;

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
    mocks.sendSubscriptionStartedEmail.mockResolvedValue({ sent: true, id: "email_2" });
  });

  it("rejects oversized webhook bodies even without Content-Length", async () => {
    const response = await POST(
      new Request("https://go-daily.app/api/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: "x".repeat(1_000_001),
      }),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: "payload_too_large" });
    expect(mocks.constructEvent).not.toHaveBeenCalled();
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
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
    const profileQ = query({
      data: { locale: "zh", email_opt_out: false, email_unsubscribe_token: "tok_started" },
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
        .mockReturnValueOnce(subscriptionQ) // subscriptions select existing
        .mockReturnValueOnce(subscriptionQ) // subscriptions upsert
        .mockReturnValueOnce(query({ error: null })) // stripe_events mark processed
        .mockReturnValueOnce(profileQ), // profiles email state
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
    expect(admin.auth.admin.getUserById).toHaveBeenCalledWith("user_1");
    expect(mocks.sendSubscriptionStartedEmail).toHaveBeenCalledWith({
      to: "user@example.com",
      locale: "zh",
      trialing: false,
      unsubscribeToken: "tok_started",
    });
  });

  it("marks subscription events processed when the linked user has already been deleted", async () => {
    const canceled = makeSubscription({
      metadata: { user_id: "deleted-user" },
      status: "canceled",
    });
    mocks.constructEvent.mockReturnValue({
      id: "evt_deleted_user",
      type: "customer.subscription.deleted",
      data: { object: canceled },
    });
    mocks.retrieveSubscription.mockResolvedValue(canceled);

    const existingSelectQ = query({ data: null, error: null });
    const upsertQ = query({ data: null, error: null });
    upsertQ.upsert = vi.fn(() =>
      Promise.resolve({ error: { code: "23503", message: "foreign key violation" } }),
    );
    const markProcessedQ = query({ error: null });
    const admin = {
      from: vi
        .fn()
        .mockReturnValueOnce(query({ error: null })) // stripe_events insert claim
        .mockReturnValueOnce(existingSelectQ) // subscriptions select existing
        .mockReturnValueOnce(upsertQ) // subscriptions upsert
        .mockReturnValueOnce(markProcessedQ), // stripe_events mark processed
    };
    mocks.createServiceClient.mockReturnValue(admin);

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(upsertQ.upsert).toHaveBeenCalled();
    expect(markProcessedQ.update).toHaveBeenCalledWith(
      expect.objectContaining({
        processed_at: expect.any(String),
        processing_started_at: null,
        last_error: null,
      }),
    );
  });

  it("ignores stale cancellation events from an older subscription when a newer Pro subscription exists", async () => {
    const oldSubscription = makeSubscription({
      id: "sub_old",
      metadata: { user_id: "user_1" },
      status: "canceled",
    });
    mocks.constructEvent.mockReturnValue({
      id: "evt_stale_cancel",
      type: "customer.subscription.deleted",
      data: { object: oldSubscription },
    });
    mocks.retrieveSubscription.mockResolvedValue(oldSubscription);

    const existingSelectQ = query({
      data: {
        stripe_subscription_id: "sub_current",
        status: "active",
        first_paid_at: null,
        coach_anchor_day: null,
      },
      error: null,
    });
    const markProcessedQ = query({ error: null });
    const admin = {
      from: vi
        .fn()
        .mockReturnValueOnce(query({ error: null })) // stripe_events insert claim
        .mockReturnValueOnce(existingSelectQ) // subscriptions select existing
        .mockReturnValueOnce(markProcessedQ), // stripe_events mark processed
    };
    mocks.createServiceClient.mockReturnValue(admin);

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(existingSelectQ.upsert).not.toHaveBeenCalled();
    expect(markProcessedQ.update).toHaveBeenCalled();
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
      auth: {
        admin: {
          getUserById: vi.fn().mockResolvedValue({
            data: { user: { email: "trial@example.com" } },
            error: null,
          }),
        },
      },
      from: vi
        .fn()
        .mockReturnValueOnce(query({ error: null }))
        .mockReturnValueOnce(query({ data: null, error: null }))
        .mockReturnValueOnce(query({ error: null }))
        .mockReturnValueOnce(query({ error: null }))
        .mockReturnValueOnce(
          query({
            data: { locale: "en", email_opt_out: false, email_unsubscribe_token: null },
            error: null,
          }),
        ),
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
        trialEnd: "2026-05-01T00:00:00.000Z",
      }),
    });
    expect(mocks.sendSubscriptionStartedEmail).toHaveBeenCalledWith({
      to: "trial@example.com",
      locale: "en",
      trialing: true,
      unsubscribeToken: null,
    });
  });

  it("does not send subscription-started email when the profile is opted out", async () => {
    mocks.constructEvent.mockReturnValue({
      id: "evt_checkout_optout",
      type: "checkout.session.completed",
      data: { object: { subscription: "sub_1", client_reference_id: "user_1" } },
    });
    mocks.retrieveSubscription.mockResolvedValue(makeSubscription());

    const admin = {
      auth: { admin: { getUserById: vi.fn() } },
      from: vi
        .fn()
        .mockReturnValueOnce(query({ error: null }))
        .mockReturnValueOnce(query({ data: null, error: null }))
        .mockReturnValueOnce(query({ error: null }))
        .mockReturnValueOnce(query({ error: null }))
        .mockReturnValueOnce(
          query({
            data: { locale: "en", email_opt_out: true, email_unsubscribe_token: "tok_started" },
            error: null,
          }),
        ),
    };
    mocks.createServiceClient.mockReturnValue(admin);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.sendSubscriptionStartedEmail).not.toHaveBeenCalled();
    expect(admin.auth.admin.getUserById).not.toHaveBeenCalled();
  });

  // Stripe does not deliver events in order and retries a failed one for days.
  describe("subscription events out of order", () => {
    it.each(["customer.subscription.created", "customer.subscription.updated"])(
      "writes what Stripe says now when a late %s event still says active",
      async (type) => {
        mocks.constructEvent.mockReturnValue({
          id: "evt_late",
          type,
          data: {
            object: makeSubscription({ metadata: { user_id: "user_1" }, status: "active" }),
          },
        });
        // The subscription has been cancelled since the event was generated.
        mocks.retrieveSubscription.mockResolvedValue(
          makeSubscription({ metadata: { user_id: "user_1" }, status: "canceled" }),
        );

        const upsert = query({ error: null });
        const admin = {
          from: vi
            .fn()
            .mockReturnValueOnce(query({ error: null })) // stripe_events insert claim
            .mockReturnValueOnce(
              query({ data: { stripe_subscription_id: "sub_1", status: "canceled" }, error: null }),
            ) // subscriptions select existing
            .mockReturnValueOnce(upsert) // subscriptions upsert
            .mockReturnValueOnce(query({ error: null })), // stripe_events mark processed
        };
        mocks.createServiceClient.mockReturnValue(admin);

        const response = await POST(request());

        expect(response.status).toBe(200);
        expect(mocks.retrieveSubscription).toHaveBeenCalledWith("sub_1");
        expect(upsert.upsert).toHaveBeenCalledWith(
          expect.objectContaining({ user_id: "user_1", status: "canceled" }),
          { onConflict: "user_id" },
        );
      },
    );

    it("answers 500 so Stripe retries when the subscription cannot be fetched", async () => {
      mocks.constructEvent.mockReturnValue({
        id: "evt_fetch_failed",
        type: "customer.subscription.updated",
        data: { object: makeSubscription({ metadata: { user_id: "user_1" } }) },
      });
      mocks.retrieveSubscription.mockRejectedValue(new Error("stripe unavailable"));

      const released = query({ error: null });
      const admin = {
        from: vi
          .fn()
          .mockReturnValueOnce(query({ error: null })) // stripe_events insert claim
          .mockReturnValueOnce(released), // stripe_events release failed claim
      };
      mocks.createServiceClient.mockReturnValue(admin);

      const response = await POST(request());

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({ error: "handler_failed" });
      expect(released.update).toHaveBeenCalledWith(
        expect.objectContaining({ processing_started_at: null, last_error: "stripe unavailable" }),
      );
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
    it("stores the past_due subscription as paid through the failed renewal and sends a billing portal email", async () => {
      mocks.constructEvent.mockReturnValue({
        id: "evt_invoice_failed",
        type: "invoice.payment_failed",
        data: { object: makeInvoice() },
      });
      // Stripe opened the next period when it created the renewal invoice, so
      // the period end is a month away although nothing was collected.
      mocks.retrieveSubscription.mockResolvedValue(
        makeSubscription({
          metadata: { user_id: "user_1" },
          status: "past_due",
          items: {
            data: [
              {
                price: { id: "price_monthly", recurring: { interval: "month" } },
                current_period_start: RENEWAL_FAILED_AT,
                current_period_end: RENEWAL_FAILED_AT + 30 * 86_400,
              },
            ],
          },
        }),
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
          current_period_end: new Date(RENEWAL_FAILED_AT * 1000).toISOString(),
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
        }),
      });
    });

    // The handler used to write `past_due` whatever Stripe said.
    it.each([
      ["a first payment that failed, which was never paid for", "incomplete"],
      ["a subscription that recovered before this event was retried", "active"],
    ])("keeps Stripe's status for %s", async (_label, status) => {
      mocks.constructEvent.mockReturnValue({
        id: "evt_invoice_failed_status",
        type: "invoice.payment_failed",
        data: { object: makeInvoice() },
      });
      mocks.retrieveSubscription.mockResolvedValue(
        makeSubscription({ metadata: { user_id: "user_1" }, status }),
      );

      const upsert = query({ error: null });
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
          .mockReturnValueOnce(query({ data: null, error: null })) // subscriptions select existing
          .mockReturnValueOnce(upsert) // subscriptions upsert
          .mockReturnValueOnce(query({ data: { email_opt_out: true }, error: null })) // profiles
          .mockReturnValueOnce(query({ error: null })), // stripe_events mark processed
      };
      mocks.createServiceClient.mockReturnValue(admin);

      const response = await POST(request());

      expect(response.status).toBe(200);
      expect(upsert.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          status,
          current_period_end: new Date(1_777_000_000 * 1000).toISOString(),
        }),
        { onConflict: "user_id" },
      );
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

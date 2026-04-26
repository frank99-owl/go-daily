import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { POST } from "../../../../../app/api/stripe/webhook/route";
import { getStripeClient } from "../../../../../lib/stripe/server";
import { createServiceClient } from "../../../../../lib/supabase/service";

// Mock dependencies
vi.mock("../../../../../lib/stripe/server", () => ({
  getStripeClient: vi.fn(),
  inferPlanFromPriceId: vi.fn(() => "pro"),
}));

vi.mock("../../../../../lib/supabase/service", () => ({
  createServiceClient: vi.fn(),
}));

vi.mock("../../../../../lib/posthog/server", () => ({
  captureServerEvent: vi.fn(),
}));

vi.mock("../../../../../lib/email", () => ({
  sendPaymentFailedEmail: vi.fn(),
}));

describe("Stripe Webhook Idempotency", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockStripe: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockAdmin: any;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";

    mockStripe = {
      webhooks: {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        constructEvent: vi.fn((_body, _sig, _secret) => ({
          id: "evt_123",
          type: "customer.subscription.updated",
          data: {
            object: {
              id: "sub_123",
              customer: "cus_123",
              metadata: { user_id: "user_1" },
              items: { data: [{ price: { id: "price_pro" } }] },
            },
          },
        })),
      },
      subscriptions: {
        retrieve: vi.fn(),
      },
    };
    vi.mocked(getStripeClient).mockReturnValue(mockStripe);

    const mockChain = {
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    };

    mockAdmin = {
      from: vi.fn(() => mockChain),
    };
    vi.mocked(createServiceClient).mockReturnValue(mockAdmin);
  });

  afterEach(() => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  function createMockRequest() {
    return new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      headers: {
        "stripe-signature": "t=1,v1=test",
      },
      body: JSON.stringify({}),
    });
  }

  it("claims a new event successfully and marks it processed", async () => {
    const req = createMockRequest();
    const res = await POST(req);
    const body = await res.json();

    expect(body).toEqual({ ok: true });
    expect(mockAdmin.from).toHaveBeenCalledWith("stripe_events");
    // Verify it attempted to insert
    expect(mockAdmin.from().insert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "evt_123",
        event_type: "customer.subscription.updated",
      }),
    );
    // Verify it updated subscription
    expect(mockAdmin.from().upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        stripe_subscription_id: "sub_123",
        user_id: "user_1",
      }),
      expect.any(Object),
    );
    // Verify it marked event as processed
    expect(mockAdmin.from().update).toHaveBeenCalledWith(
      expect.objectContaining({
        processed_at: expect.any(String),
        processing_started_at: null,
      }),
    );
  });

  it("handles duplicate event gracefully (already processed)", async () => {
    // Mock insert to fail with unique violation
    mockAdmin.from().insert.mockResolvedValueOnce({ error: { code: "23505" } });

    // Mock lookup to return an already processed event
    mockAdmin.from().maybeSingle.mockResolvedValueOnce({
      data: {
        processed_at: new Date().toISOString(),
        processing_started_at: new Date().toISOString(),
      },
      error: null,
    });

    const req = createMockRequest();
    const res = await POST(req);
    const body = await res.json();

    expect(body).toEqual({ ok: true, duplicate: true });
    // Should NOT have called upsert on subscriptions since it's duplicate
    expect(mockAdmin.from().upsert).not.toHaveBeenCalled();
  });

  it("handles in-progress event gracefully (returns 503)", async () => {
    // Mock insert to fail with unique violation
    mockAdmin.from().insert.mockResolvedValueOnce({ error: { code: "23505" } });

    // Mock lookup to return an event currently processing
    mockAdmin
      .from()
      .maybeSingle.mockResolvedValueOnce({
        // First lookup for existing
        data: { processed_at: null, processing_started_at: new Date().toISOString() },
        error: null,
      })
      .mockResolvedValueOnce({
        // Second lookup for tryClaimExistingStripeEvent
        data: null, // Couldn't claim because it's locked and not stale
        error: null,
      });

    const req = createMockRequest();
    const res = await POST(req);

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ error: "event_in_progress" });

    expect(mockAdmin.from().upsert).not.toHaveBeenCalled();
  });

  it("re-claims a stale in-progress event", async () => {
    const staleDate = new Date(Date.now() - 15 * 60 * 1000).toISOString(); // 15 mins ago (> 10m stale)

    mockAdmin.from().insert.mockResolvedValueOnce({ error: { code: "23505" } });

    mockAdmin
      .from()
      .maybeSingle.mockResolvedValueOnce({
        // lookup existing
        data: { processed_at: null, processing_started_at: staleDate },
        error: null,
      })
      .mockResolvedValueOnce({
        // claim stale
        data: { id: "evt_123" },
        error: null,
      });

    const req = createMockRequest();
    const res = await POST(req);
    const body = await res.json();

    // Successfully reclaimed and processed
    expect(body).toEqual({ ok: true });
    expect(mockAdmin.from().upsert).toHaveBeenCalled(); // Should process the subscription
  });
});

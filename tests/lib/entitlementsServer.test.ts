import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolveViewerPlan } from "@/lib/entitlementsServer";
import { createServiceClient } from "@/lib/supabase/service";

const grantRow = vi.hoisted(() => ({
  value: null as { expires_at: string } | null,
  throws: false,
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => {
    if (grantRow.throws) throw new Error("service unavailable");
    return {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(() => Promise.resolve({ data: grantRow.value })),
      })),
    };
  }),
}));

const user = { id: "user-1" };

describe("resolveViewerPlan", () => {
  beforeEach(() => {
    vi.mocked(createServiceClient).mockClear();
    grantRow.value = null;
    grantRow.throws = false;
  });

  it("keeps guests as guests without querying manual grants", async () => {
    await expect(
      resolveViewerPlan({ user: null, subscriptionStatus: null, email: "demo@example.com" }),
    ).resolves.toBe("guest");

    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("treats active Stripe subscriptions as pro without querying manual grants", async () => {
    await expect(
      resolveViewerPlan({ user, subscriptionStatus: "active", email: "demo@example.com" }),
    ).resolves.toBe("pro");

    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("treats past_due Stripe subscriptions as pro only inside the grace window", async () => {
    await expect(
      resolveViewerPlan({
        user,
        subscriptionStatus: "past_due",
        subscriptionCurrentPeriodEnd: "2026-05-18T00:00:00.000Z",
        email: "demo@example.com",
        now: new Date("2026-05-20T00:00:00.000Z"),
      }),
    ).resolves.toBe("pro");

    expect(createServiceClient).not.toHaveBeenCalled();

    await expect(
      resolveViewerPlan({
        user,
        subscriptionStatus: "past_due",
        subscriptionCurrentPeriodEnd: "2026-05-01T00:00:00.000Z",
        email: "demo@example.com",
        now: new Date("2026-05-20T00:00:00.000Z"),
      }),
    ).resolves.toBe("free");
  });

  it("promotes a signed-in user with an unexpired manual grant to pro", async () => {
    grantRow.value = { expires_at: "2999-01-01T00:00:00.000Z" };

    await expect(
      resolveViewerPlan({ user, subscriptionStatus: null, email: "Demo@Example.com" }),
    ).resolves.toBe("pro");
  });

  it("falls back to free when the manual grant is expired or unavailable", async () => {
    grantRow.value = { expires_at: "2000-01-01T00:00:00.000Z" };
    await expect(
      resolveViewerPlan({ user, subscriptionStatus: null, email: "demo@example.com" }),
    ).resolves.toBe("free");

    grantRow.throws = true;
    await expect(
      resolveViewerPlan({ user, subscriptionStatus: null, email: "demo@example.com" }),
    ).resolves.toBe("free");
  });
});

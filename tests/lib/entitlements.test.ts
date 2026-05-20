import { describe, expect, it } from "vitest";

import {
  getEntitlements,
  getViewerPlan,
  isPastDueWithinGrace,
  isProSubscriptionStatus,
} from "@/lib/entitlements";

const fakeUser = { id: "user_1" };
const fixedNow = new Date("2026-05-20T00:00:00.000Z");

describe("isProSubscriptionStatus", () => {
  it("returns true for active and trialing", () => {
    expect(isProSubscriptionStatus("active")).toBe(true);
    expect(isProSubscriptionStatus("trialing")).toBe(true);
  });

  it("returns true for past_due only inside the grace window", () => {
    expect(
      isProSubscriptionStatus("past_due", {
        currentPeriodEnd: "2026-05-18T00:00:00.000Z",
        now: fixedNow,
      }),
    ).toBe(true);
    expect(
      isProSubscriptionStatus("past_due", {
        currentPeriodEnd: "2026-05-01T00:00:00.000Z",
        now: fixedNow,
      }),
    ).toBe(false);
    expect(isProSubscriptionStatus("past_due", { now: fixedNow })).toBe(false);
  });

  it("returns false for every other known Stripe status", () => {
    for (const status of ["canceled", "incomplete", "incomplete_expired", "unpaid", "paused"]) {
      expect(isProSubscriptionStatus(status)).toBe(false);
    }
  });

  it("returns false for null, undefined, and empty string", () => {
    expect(isProSubscriptionStatus(null)).toBe(false);
    expect(isProSubscriptionStatus(undefined)).toBe(false);
    expect(isProSubscriptionStatus("")).toBe(false);
  });
});

describe("isPastDueWithinGrace", () => {
  it("uses current_period_end plus the configured grace window", () => {
    expect(
      isPastDueWithinGrace({
        currentPeriodEnd: "2026-05-13T00:00:00.000Z",
        now: fixedNow,
      }),
    ).toBe(true);
    expect(
      isPastDueWithinGrace({
        currentPeriodEnd: "2026-05-12T23:59:59.000Z",
        now: fixedNow,
      }),
    ).toBe(false);
  });
});

describe("getViewerPlan", () => {
  it("is guest when user is null", () => {
    expect(getViewerPlan({ user: null, subscriptionStatus: null })).toBe("guest");
    expect(getViewerPlan({ user: null, subscriptionStatus: "active" })).toBe("guest");
  });

  it("is free for a signed-in user without an active/trialing subscription", () => {
    expect(getViewerPlan({ user: fakeUser, subscriptionStatus: null })).toBe("free");
    expect(getViewerPlan({ user: fakeUser, subscriptionStatus: "canceled" })).toBe("free");
  });

  it("is pro for active, trialing, or in-grace past_due subscriptions", () => {
    expect(
      getViewerPlan({
        user: fakeUser,
        subscriptionStatus: "past_due",
        subscriptionCurrentPeriodEnd: "2026-05-18T00:00:00.000Z",
        now: fixedNow,
      }),
    ).toBe("pro");
    expect(getViewerPlan({ user: fakeUser, subscriptionStatus: "active" })).toBe("pro");
    expect(getViewerPlan({ user: fakeUser, subscriptionStatus: "trialing" })).toBe("pro");
  });

  it("is free for expired or missing past_due period end", () => {
    expect(
      getViewerPlan({
        user: fakeUser,
        subscriptionStatus: "past_due",
        subscriptionCurrentPeriodEnd: "2026-05-01T00:00:00.000Z",
        now: fixedNow,
      }),
    ).toBe("free");
    expect(getViewerPlan({ user: fakeUser, subscriptionStatus: "past_due", now: fixedNow })).toBe(
      "free",
    );
  });
});

describe("getEntitlements", () => {
  it("shapes guest entitlements: coach trial, ads on, no sync, no device cap", () => {
    const entitlements = getEntitlements({ user: null, subscriptionStatus: null });
    expect(entitlements).toEqual({
      plan: "guest",
      cloudSync: "none",
      adsEnabled: true,
      coach: {
        available: true,
        requiresLogin: false,
        dailyLimit: 3,
        monthlyLimit: 5,
      },
      deviceLimit: null,
    });
  });

  it("shapes free entitlements: single-device, ads on, 10/day + 30/month", () => {
    const entitlements = getEntitlements({ user: fakeUser, subscriptionStatus: null });
    expect(entitlements).toEqual({
      plan: "free",
      cloudSync: "single-device",
      adsEnabled: true,
      coach: {
        available: true,
        requiresLogin: true,
        dailyLimit: 10,
        monthlyLimit: 30,
      },
      deviceLimit: 1,
    });
  });

  it("shapes pro entitlements: multi-device, no ads, 51/day + 1001/month", () => {
    const entitlements = getEntitlements({ user: fakeUser, subscriptionStatus: "active" });
    expect(entitlements).toEqual({
      plan: "pro",
      cloudSync: "multi-device",
      adsEnabled: false,
      coach: {
        available: true,
        requiresLogin: true,
        dailyLimit: 51,
        monthlyLimit: 1001,
      },
      deviceLimit: 3,
    });
  });

  it("treats trialing users as pro (same entitlements as active)", () => {
    const active = getEntitlements({ user: fakeUser, subscriptionStatus: "active" });
    const trialing = getEntitlements({ user: fakeUser, subscriptionStatus: "trialing" });
    expect(trialing).toEqual(active);
  });
});

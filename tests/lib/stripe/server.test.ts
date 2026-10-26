// @vitest-environment node
/**
 * lib/stripe/server.ts decides which price a checkout charges, which plan a
 * webhook records for a price, and how long a trial lasts. Every route test
 * mocks the module, so until 2026-10 none of its 82 mutants was executed by
 * any test. Prices and the Stripe client are cached at module scope, so each
 * test imports a fresh copy.
 */
import type StripeType from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stripe = vi.hoisted(() => ({ constructed: vi.fn() }));

vi.mock("stripe", () => ({
  default: class {
    constructor(key: string, options: unknown) {
      stripe.constructed(key, options);
    }
  },
}));

async function freshModule() {
  vi.resetModules();
  return import("@/lib/stripe/server");
}

beforeEach(() => {
  stripe.constructed.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("STRIPE_API_VERSION", () => {
  it("matches the API version the installed SDK was generated for", async () => {
    const { default: RealStripe } = await vi.importActual<{ default: typeof StripeType }>("stripe");
    const { STRIPE_API_VERSION } = await freshModule();

    expect(STRIPE_API_VERSION).toBe(RealStripe.API_VERSION);
  });
});

describe("server-only guard", () => {
  it("refuses to load in a browser", async () => {
    vi.stubGlobal("window", {});
    await expect(freshModule()).rejects.toThrow(/must only be imported on the server/);
  });
});

describe("getStripeClient", () => {
  it.each([
    ["unset", undefined],
    ["blank", "   "],
  ])("throws when STRIPE_SECRET_KEY is %s", async (_label, value) => {
    vi.stubEnv("STRIPE_SECRET_KEY", value as string);
    const { getStripeClient } = await freshModule();

    expect(() => getStripeClient()).toThrow(/STRIPE_SECRET_KEY is not set/);
    expect(stripe.constructed).not.toHaveBeenCalled();
  });

  it("creates one client with the trimmed key and the pinned API version", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "  sk_test_123\n");
    const { getStripeClient, STRIPE_API_VERSION } = await freshModule();

    const first = getStripeClient();
    const second = getStripeClient();

    expect(second).toBe(first);
    expect(stripe.constructed).toHaveBeenCalledOnce();
    expect(stripe.constructed).toHaveBeenCalledWith("sk_test_123", {
      apiVersion: STRIPE_API_VERSION,
      typescript: true,
    });
  });
});

describe("prices and plans", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_PRO_MONTHLY_PRICE_ID", " price_monthly ");
    vi.stubEnv("STRIPE_PRO_YEARLY_PRICE_ID", "price_yearly");
  });

  it("maps each interval to its plan", async () => {
    const { intervalToPlan } = await freshModule();
    expect(intervalToPlan("monthly")).toBe("pro_monthly");
    expect(intervalToPlan("yearly")).toBe("pro_yearly");
  });

  it("returns the configured price for each interval, trimmed", async () => {
    const { getProPriceId } = await freshModule();
    expect(getProPriceId("monthly")).toBe("price_monthly");
    expect(getProPriceId("yearly")).toBe("price_yearly");
  });

  it.each([
    ["STRIPE_PRO_MONTHLY_PRICE_ID", "yearly"],
    ["STRIPE_PRO_YEARLY_PRICE_ID", "monthly"],
  ] as const)("refuses to price a checkout when %s is missing", async (name, interval) => {
    vi.stubEnv(name, " ");
    const { getProPriceId } = await freshModule();

    expect(() => getProPriceId(interval)).toThrow(`${name} is not set`);
  });

  it("recognises each configured price as its plan", async () => {
    const { inferPlanFromPriceId } = await freshModule();
    expect(inferPlanFromPriceId("price_monthly")).toBe("pro_monthly");
    expect(inferPlanFromPriceId("price_yearly")).toBe("pro_yearly");
  });

  it.each([
    ["an unknown price", "price_other"],
    ["no price", null],
    ["an empty price", ""],
  ])("returns null for %s", async (_label, priceId) => {
    const { inferPlanFromPriceId } = await freshModule();
    expect(inferPlanFromPriceId(priceId)).toBeNull();
  });

  it("returns null instead of throwing when prices are not configured", async () => {
    vi.stubEnv("STRIPE_PRO_YEARLY_PRICE_ID", "");
    const { inferPlanFromPriceId } = await freshModule();

    expect(inferPlanFromPriceId("price_monthly")).toBeNull();
  });
});

describe("getStripeTrialDays", () => {
  it.each([
    [undefined, 3],
    ["", 3],
    ["7", 7],
    [" 14 ", 14],
    ["0", 0],
    ["365", 365],
    ["366", 3],
    ["-1", 3],
    ["seven", 3],
  ])("reads STRIPE_TRIAL_DAYS=%j as %d days", async (value, days) => {
    vi.stubEnv("STRIPE_TRIAL_DAYS", value as string);
    const { getStripeTrialDays } = await freshModule();

    expect(getStripeTrialDays()).toBe(days);
  });
});

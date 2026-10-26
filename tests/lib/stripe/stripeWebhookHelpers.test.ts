// @vitest-environment node
/**
 * The webhook route turns these into the subscription row: `minItemPeriodEnd`
 * becomes `current_period_end`, the date Pro access runs out. Mutation testing
 * in 2026-10 found that swapping its Math.min for Math.max left the suite
 * green, as did dropping the expanded-object branch of `getStringId`.
 */
import type Stripe from "stripe";
import { describe, expect, it } from "vitest";

import {
  anchorDayFromIso,
  getStringId,
  minItemPeriodEnd,
  toIsoOrNull,
} from "@/lib/stripe/stripeWebhookHelpers";

function subscriptionWithItemEnds(ends: unknown[] | null): Stripe.Subscription {
  return {
    items: ends === null ? undefined : { data: ends.map((end) => ({ current_period_end: end })) },
  } as unknown as Stripe.Subscription;
}

describe("getStringId", () => {
  it("passes an id string through", () => {
    expect(getStringId("cus_123")).toBe("cus_123");
  });

  it("reads the id of an expanded object", () => {
    expect(getStringId({ id: "cus_123", object: "customer" })).toBe("cus_123");
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["an empty string", ""],
    ["an object without an id", { object: "customer" }],
    ["an object whose id is not a string", { id: 42 }],
  ])("returns null for %s", (_label, value) => {
    expect(getStringId(value)).toBeNull();
  });
});

describe("toIsoOrNull", () => {
  it("converts epoch seconds to an ISO timestamp", () => {
    expect(toIsoOrNull(1_793_000_000)).toBe("2026-10-26T07:33:20.000Z");
  });

  it.each([null, undefined, 0])("returns null for %s", (value) => {
    expect(toIsoOrNull(value)).toBeNull();
  });
});

describe("minItemPeriodEnd", () => {
  it("returns the earliest item period end, so access never outlives a lapsed item", () => {
    expect(minItemPeriodEnd(subscriptionWithItemEnds([1_800_000_000, 1_790_000_000]))).toBe(
      1_790_000_000,
    );
  });

  it("ignores item ends that are missing or not finite", () => {
    expect(
      minItemPeriodEnd(
        subscriptionWithItemEnds([undefined, Number.NaN, -Infinity, "1700000000", 1_795_000_000]),
      ),
    ).toBe(1_795_000_000);
  });

  it.each([
    ["no items object", null],
    ["no items", []],
    ["only unusable ends", [undefined, Number.NaN]],
  ])("returns null when the subscription has %s", (_label, ends) => {
    expect(minItemPeriodEnd(subscriptionWithItemEnds(ends))).toBeNull();
  });
});

describe("anchorDayFromIso", () => {
  it("returns the UTC day of the month", () => {
    expect(anchorDayFromIso("2026-03-31T23:30:00.000Z")).toBe(31);
  });

  it("uses the UTC day even when the timestamp carries another offset", () => {
    expect(anchorDayFromIso("2026-04-01T00:30:00+08:00")).toBe(31);
  });

  it.each([
    ["null", null],
    ["an empty string", ""],
    ["an unparseable string", "not a date"],
  ])("returns null for %s", (_label, value) => {
    expect(anchorDayFromIso(value)).toBeNull();
  });
});

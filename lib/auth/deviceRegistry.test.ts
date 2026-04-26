import { describe, expect, it } from "vitest";

import {
  evaluateDeviceAccess,
  FREE_TIER_DEVICE_LIMIT,
  formatDeviceLabel,
  isPaidSubscription,
} from "./deviceRegistry";

describe("evaluateDeviceAccess", () => {
  it("allows a known device unconditionally", () => {
    const access = evaluateDeviceAccess({
      existingDevices: [{ device_id: "d1", last_seen: null }],
      currentDeviceId: "d1",
      isPaid: false,
    });
    expect(access).toBe("allow-existing");
  });

  it("allows a new device when no seats are used", () => {
    const access = evaluateDeviceAccess({
      existingDevices: [],
      currentDeviceId: "d-new",
      isPaid: false,
    });
    expect(access).toBe("allow-new");
  });

  it("blocks a new device for free users at the limit", () => {
    const seats = Array.from({ length: FREE_TIER_DEVICE_LIMIT }, (_, i) => ({
      device_id: `d-${i}`,
      last_seen: null,
    }));
    const access = evaluateDeviceAccess({
      existingDevices: seats,
      currentDeviceId: "d-brand-new",
      isPaid: false,
    });
    expect(access).toBe("block-free-device-limit");
  });

  it("allows unlimited devices for paid users", () => {
    const seats = Array.from({ length: FREE_TIER_DEVICE_LIMIT + 5 }, (_, i) => ({
      device_id: `d-${i}`,
      last_seen: null,
    }));
    const access = evaluateDeviceAccess({
      existingDevices: seats,
      currentDeviceId: "d-brand-new",
      isPaid: true,
    });
    expect(access).toBe("allow-new");
  });
});

describe("isPaidSubscription", () => {
  it.each([
    ["active", true],
    ["trialing", true],
    ["canceled", false],
    ["past_due", false],
    ["incomplete", false],
    [null, false],
    [undefined, false],
  ])("status=%s → isPaid=%s", (status, expected) => {
    expect(isPaidSubscription(status as string | null | undefined)).toBe(expected);
  });
});

describe("formatDeviceLabel", () => {
  it("returns a friendly label from user_agent", () => {
    expect(
      formatDeviceLabel({
        user_agent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      }),
    ).toBe("Chrome on macOS");
  });

  it("handles missing user_agent gracefully", () => {
    expect(formatDeviceLabel({})).toBe("Unknown device");
    expect(formatDeviceLabel({ user_agent: null })).toBe("Unknown device");
  });
});

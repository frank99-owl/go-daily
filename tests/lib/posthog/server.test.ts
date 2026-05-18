// @vitest-environment node

import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

const captureMock = vi.hoisted(() => vi.fn());
const flushMock = vi.hoisted(() => vi.fn(async () => {}));
const posthogConstructorMock = vi.hoisted(() => vi.fn());

vi.mock("posthog-node", () => ({
  PostHog: class {
    constructor(...args: unknown[]) {
      posthogConstructorMock(...args);
    }

    capture = captureMock;
    flush = flushMock;
  },
}));

describe("captureServerEvent", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "ph_test";
    process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://posthog.test";
  });

  it("hashes raw distinct IDs before sending events to PostHog", async () => {
    const { captureServerEvent } = await import("@/lib/posthog/server");
    await captureServerEvent({
      distinctId: "user_123",
      event: "subscription_past_due",
      properties: {
        plan: "pro_monthly",
        interval: "monthly",
      },
    });

    expect(captureMock).toHaveBeenCalledWith({
      distinctId: createHash("sha256")
        .update("go-daily:posthog:v1:user_123")
        .digest("hex")
        .slice(0, 32),
      event: "subscription_past_due",
      properties: {
        plan: "pro_monthly",
        interval: "monthly",
      },
    });
    expect(captureMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ distinctId: "user_123" }),
    );
    expect(flushMock).toHaveBeenCalledTimes(1);
  });
});

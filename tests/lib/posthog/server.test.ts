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

  it("blocks server events with sensitive property keys", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { captureServerEvent } = await import("@/lib/posthog/server");

    await captureServerEvent({
      distinctId: "user_123",
      event: "coach_request_completed",
      properties: {
        locale: "en",
        personaId: "default",
        plan: "free",
        model: "test-model",
        provider: "https://api.deepseek.com",
        durationMs: 1200,
        inputTokens: 50,
        outputTokens: 20,
        totalTokens: 70,
        usageAvailable: true,
        userId: "raw-user-id",
      } as unknown as Parameters<
        typeof captureServerEvent<"coach_request_completed">
      >[0]["properties"],
    });

    expect(captureMock).not.toHaveBeenCalled();
    expect(flushMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith("[PostHog] blocked server event with unsafe property", {
      event: "coach_request_completed",
      property: "userId",
    });
    warnSpy.mockRestore();
  });

  it("blocks server events with sensitive property values", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { captureServerEvent } = await import("@/lib/posthog/server");

    await captureServerEvent({
      distinctId: "user_123",
      event: "coach_request_failed",
      properties: {
        locale: "en",
        personaId: "default",
        plan: "free",
        model: "test-model",
        provider: "https://api.deepseek.com",
        durationMs: 1200,
        errorCode: "failed for frank@example.com",
        httpStatus: 0,
      },
    });

    expect(captureMock).not.toHaveBeenCalled();
    expect(flushMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith("[PostHog] blocked server event with unsafe property", {
      event: "coach_request_failed",
      property: "errorCode",
    });
    warnSpy.mockRestore();
  });
});

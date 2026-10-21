// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { scrubSentryEvent } from "@/lib/sentryScrubber";

const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  replayIntegration: vi.fn(() => ({ name: "Replay" })),
  captureRouterTransitionStart: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => sentry);

describe("client instrumentation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not initialize monitoring or replay without a DSN", async () => {
    await import("@/instrumentation-client");

    expect(sentry.init).not.toHaveBeenCalled();
    expect(sentry.replayIntegration).not.toHaveBeenCalled();
  });

  it("keeps privacy filtering and masked replay when monitoring is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://public@example.invalid/1");

    await import("@/instrumentation-client");

    expect(sentry.init).toHaveBeenCalledOnce();
    const options = sentry.init.mock.calls[0][0];
    expect(options).toMatchObject({
      dsn: "https://public@example.invalid/1",
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 1,
      integrations: [{ name: "Replay" }],
    });
    expect(sentry.replayIntegration).toHaveBeenCalledWith({
      maskAllText: true,
      blockAllMedia: true,
    });
    expect(options.beforeSend({ message: "Failed for tester@example.invalid" })).toEqual(
      scrubSentryEvent({ message: "Failed for tester@example.invalid" }),
    );
    expect(
      options.beforeSend({ message: "Failed for tester@example.invalid" }).message,
    ).not.toContain("tester@example.invalid");
  });

  it("exposes Sentry's navigation hook to Next.js", async () => {
    const { onRouterTransitionStart } = await import("@/instrumentation-client");

    expect(onRouterTransitionStart).toBe(sentry.captureRouterTransitionStart);
  });
});

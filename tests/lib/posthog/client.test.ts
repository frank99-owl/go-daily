// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const posthog = vi.hoisted(() => ({ init: vi.fn() }));
vi.mock("posthog-js", () => ({ default: posthog }));

describe("initPostHog", () => {
  beforeEach(() => {
    vi.resetModules();
    posthog.init.mockClear();
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("captures only explicit events and loads no external PostHog scripts", async () => {
    const { initPostHog, isPostHogReady } = await import("@/lib/posthog/client");

    initPostHog();

    expect(posthog.init).toHaveBeenCalledOnce();
    expect(posthog.init.mock.calls[0][0]).toBe("phc_test");
    expect(posthog.init.mock.calls[0][1]).toMatchObject({
      api_host: "https://us.i.posthog.com",
      person_profiles: "identified_only",
      capture_pageview: false,
      autocapture: false,
      // Replay, surveys and the rest load from us-assets.i.posthog.com, which
      // the CSP blocks; enabling them is a privacy decision, not a default.
      disable_external_dependency_loading: true,
    });
    expect(isPostHogReady()).toBe(true);
  });

  it("does nothing without a project key", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    const { initPostHog, isPostHogReady } = await import("@/lib/posthog/client");

    initPostHog();

    expect(posthog.init).not.toHaveBeenCalled();
    expect(isPostHogReady()).toBe(false);
  });

  it("initializes once", async () => {
    const { initPostHog } = await import("@/lib/posthog/client");

    initPostHog();
    initPostHog();

    expect(posthog.init).toHaveBeenCalledOnce();
  });
});

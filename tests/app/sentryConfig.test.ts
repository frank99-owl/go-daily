// @vitest-environment node
/**
 * Every Sentry.init shares one privacy baseline.
 *
 * Sentry v11 inverted the data-collection default: an init that forgets
 * `dataCollection` collects user info, cookies and request bodies. The three
 * entry points (client, server, edge) are separate files, so one of them
 * silently drifting from the others is the realistic failure. This imports
 * each with a mocked SDK and checks what it actually passes to `init`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SHARED_SENTRY_OPTIONS } from "@/lib/sentryScrubber";

const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  replayIntegration: vi.fn(() => ({ name: "Replay" })),
  captureRouterTransitionStart: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => sentry);

const ENTRY_POINTS = [
  ["client", () => import("@/instrumentation-client")],
  ["server", () => import("@/sentry.server.config")],
  ["edge", () => import("@/sentry.edge.config")],
] as const;

describe("Sentry privacy baseline", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://public@example.invalid/1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(ENTRY_POINTS)("the %s init passes the shared options", async (_name, load) => {
    await load();
    // resetModules gave the entry point a fresh copy of the scrubber module;
    // compare against that copy, not the one imported at the top of this file.
    const shared = await import("@/lib/sentryScrubber");

    expect(sentry.init).toHaveBeenCalledOnce();
    const options = sentry.init.mock.calls[0][0];
    expect(options.dataCollection).toBe(shared.SENTRY_DATA_COLLECTION);
    expect(options.attachStacktrace).toBe(false);
    expect(options.beforeSend).toBe(shared.scrubSentryEvent);
  });

  it.each(ENTRY_POINTS)("the %s init does not initialize without a DSN", async (_name, load) => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");

    await load();

    expect(sentry.init).not.toHaveBeenCalled();
  });

  it("keeps Sentry's v10 baseline: no user info, cookies, bodies or query data", () => {
    // The documented "keep v10 defaults" configuration from Sentry's v10→v11
    // migration guide. Loosening any of these is a privacy decision, not a
    // dependency bump.
    expect(SHARED_SENTRY_OPTIONS.dataCollection).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: {
        request: { deny: ["forwarded", "-ip", "remote-", "via", "-user"] },
        response: { deny: ["forwarded", "-ip", "remote-", "via", "-user"] },
      },
      httpBodies: [],
      urlQueryParams: { deny: ["forwarded", "-ip", "remote-", "via", "-user"] },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      graphQL: { document: false, variables: false },
    });
  });
});

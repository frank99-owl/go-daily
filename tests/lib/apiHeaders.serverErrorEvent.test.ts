/**
 * @vitest-environment node
 *
 * A handled 5xx is also recorded in PostHog as `api_server_error`, deferred
 * with `after` so the serverless function stays alive until it is sent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  captureServerEvent: vi.fn(async () => {}),
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: mocks.after,
}));
vi.mock("@/lib/posthog/server", () => ({ captureServerEvent: mocks.captureServerEvent }));

import { createApiResponse } from "@/lib/apiHeaders";

/** Runs every callback handed to `after`, the way Next does once the response is sent. */
async function runDeferred() {
  for (const [callback] of mocks.after.mock.calls as [() => Promise<void>][]) await callback();
}

describe("createApiResponse server-error event", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.after.mockReset();
    mocks.captureServerEvent.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("records a handled 500 with its status and error code once the response is sent", async () => {
    createApiResponse({ error: "profile_query_failed" }, { status: 500 });

    expect(mocks.after).toHaveBeenCalledOnce();
    expect(mocks.captureServerEvent).not.toHaveBeenCalled();

    await runDeferred();

    expect(mocks.captureServerEvent).toHaveBeenCalledWith({
      distinctId: "api-server",
      event: "api_server_error",
      properties: { httpStatus: 500, errorCode: "profile_query_failed" },
    });
  });

  it("records a 5xx whose body carries no error string as unspecified", async () => {
    createApiResponse({ ok: false }, { status: 503 });
    await runDeferred();

    expect(mocks.captureServerEvent).toHaveBeenCalledWith(
      expect.objectContaining({ properties: { httpStatus: 503, errorCode: "unspecified" } }),
    );
  });

  it("records nothing for success or client errors", () => {
    createApiResponse({ ok: true });
    createApiResponse({ error: "unauthorized" }, { status: 401 });
    createApiResponse({ error: "rate_limited" }, { status: 429 });

    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("still answers when there is no request to defer to", async () => {
    mocks.after.mockImplementation(() => {
      throw new Error("`after` was called outside a request scope");
    });

    const response = createApiResponse({ error: "boom" }, { status: 500 });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "boom" });
  });
});

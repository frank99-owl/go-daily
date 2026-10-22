/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApiResponse, parseMutationBody, readRequestBodyBytes } from "@/lib/apiHeaders";

function jsonRequest(body: string, headers: HeadersInit = {}): Request {
  return new Request("https://go-daily.app/api/test", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://go-daily.app",
      ...headers,
    },
    body,
  });
}

describe("apiHeaders", () => {
  it("rejects oversized JSON bodies even when Content-Length is absent", async () => {
    const request = jsonRequest(JSON.stringify({ value: "x".repeat(64) }));

    const result = await parseMutationBody(request, 16);

    expect(result).toBeInstanceOf(Response);
    const response = result as Response;
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: "Request body too large." });
  });

  it("parses JSON bodies that stay within the byte ceiling", async () => {
    const result = await parseMutationBody(jsonRequest('{"ok":true}'), 64);

    expect(result).toEqual({ ok: true });
  });

  it("supports custom too-large errors for raw body readers", async () => {
    const request = jsonRequest("x".repeat(20));

    const result = await readRequestBodyBytes(request, 4, "payload_too_large");

    expect(result).toBeInstanceOf(Response);
    const response = result as Response;
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: "payload_too_large" });
  });
});

describe("createApiResponse server-error logging", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  const logged = () =>
    (errorSpy.mock.calls as unknown[][])
      .filter(([tag]) => tag === "[api-5xx]")
      .map(([, data]) => data);

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("logs a handled 5xx with its status and error code", async () => {
    const response = createApiResponse({ error: "profile_update_failed" }, { status: 500 });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "profile_update_failed" });
    expect(logged()).toEqual([{ status: 500, error: "profile_update_failed" }]);
  });

  it("logs 502 and 503 too", () => {
    createApiResponse({ error: "checkout_failed" }, { status: 502 });
    createApiResponse({ error: "Rate limiter unavailable." }, { status: 503 });

    expect(logged()).toEqual([
      { status: 502, error: "checkout_failed" },
      { status: 503, error: "Rate limiter unavailable." },
    ]);
  });

  it("still logs a 5xx whose body carries no error string", () => {
    createApiResponse({ status: "unhealthy" }, { status: 503 });
    createApiResponse(null, { status: 500 });

    expect(logged()).toEqual([
      { status: 503, error: "unspecified" },
      { status: 500, error: "unspecified" },
    ]);
  });

  it("truncates a long error message so it cannot flood the log", () => {
    createApiResponse({ error: "x".repeat(500) }, { status: 500 });

    expect(logged()).toEqual([{ status: 500, error: "x".repeat(120) }]);
  });

  it("does not log success or client errors", () => {
    createApiResponse({ ok: true });
    createApiResponse({ error: "unauthenticated" }, { status: 401 });
    createApiResponse({ error: "rate_limited" }, { status: 429 });
    createApiResponse({ error: "not_found" }, { status: 404 });

    expect(logged()).toEqual([]);
  });
});

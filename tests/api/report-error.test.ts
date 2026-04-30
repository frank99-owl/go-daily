/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const sentryMocks = vi.hoisted(() => {
  const scope = {
    setContext: vi.fn(),
    setTag: vi.fn(),
  };
  return {
    captureException: vi.fn(),
    scope,
    withScope: vi.fn((callback: (s: typeof scope) => void) => callback(scope)),
  };
});

vi.mock("@sentry/nextjs", () => ({
  captureException: sentryMocks.captureException,
  withScope: sentryMocks.withScope,
}));

import { POST } from "@/app/api/report-error/route";

function makeRequest(body: unknown, init?: { headers?: HeadersInit }): Request {
  return new Request("http://localhost/api/report-error", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `report-ip-${Math.random()}`,
      ...(init?.headers ?? {}),
    },
    body: JSON.stringify(body),
  });
}

describe("/api/report-error", () => {
  beforeEach(() => {
    sentryMocks.captureException.mockClear();
    sentryMocks.scope.setContext.mockClear();
    sentryMocks.scope.setTag.mockClear();
    sentryMocks.withScope.mockClear();
  });

  it("rejects cross-origin POST with 403", async () => {
    const response = await POST(
      new Request("http://localhost/api/report-error", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://evil.example",
        },
        body: JSON.stringify({
          message: "test",
          url: "https://go-daily.app/page",
          timestamp: Date.now(),
          userAgent: "Vitest",
        }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "forbidden" });
  });

  it("rejects non-JSON content types", async () => {
    const response = await POST(
      new Request("http://localhost/api/report-error", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "oops",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Content-Type must be application/json.",
    });
  });

  it("rejects oversized bodies", async () => {
    const response = await POST(
      new Request("http://localhost/api/report-error", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": "9000",
        },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: "Request body too large." });
  });

  it("rejects invalid payloads", async () => {
    const response = await POST(
      makeRequest({
        message: "",
        url: "not-a-url",
      }),
    );

    expect(response.status).toBe(400);
  });

  it("logs valid error reports", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(
      makeRequest({
        message: "Client exploded",
        stack: "Error: Client exploded",
        url: "https://go-daily.app/result?id=cld-001",
        timestamp: Date.now(),
        userAgent: "Vitest",
        locale: "en",
        puzzleId: "cld-001",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(errorSpy).toHaveBeenCalledWith(
      "[client-error]",
      expect.objectContaining({
        message: "Client exploded",
        locale: "en",
        puzzleId: "cld-001",
      }),
    );
    expect(sentryMocks.withScope).toHaveBeenCalledTimes(1);
    expect(sentryMocks.scope.setTag).toHaveBeenCalledWith("source", "client-error-report");
    expect(sentryMocks.scope.setTag).toHaveBeenCalledWith("client_locale", "en");
    expect(sentryMocks.scope.setTag).toHaveBeenCalledWith("puzzle_id", "cld-001");
    expect(sentryMocks.scope.setContext).toHaveBeenCalledWith(
      "client_error",
      expect.objectContaining({
        url: "https://go-daily.app/result",
        locale: "en",
        puzzleId: "cld-001",
      }),
    );
    expect(sentryMocks.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Client exploded" }),
    );
  });

  it("strips query and hash from URL before reporting to Sentry", async () => {
    const response = await POST(
      makeRequest({
        message: "Broken",
        url: "https://go-daily.app/page?token=secret&utm_source=email#section",
        timestamp: Date.now(),
        userAgent: "Vitest",
      }),
    );

    expect(response.status).toBe(200);
    expect(sentryMocks.scope.setContext).toHaveBeenCalledWith(
      "client_error",
      expect.objectContaining({ url: "https://go-daily.app/page" }),
    );
  });

  it("redacts email addresses from error messages", async () => {
    const response = await POST(
      makeRequest({
        message: "Failed for user alice@example.com",
        url: "https://go-daily.app/page",
        timestamp: Date.now(),
        userAgent: "Vitest",
      }),
    );

    expect(response.status).toBe(200);
    expect(sentryMocks.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Failed for user [redacted-email]" }),
    );
  });

  it("rate limits repeated reports from the same IP", async () => {
    let status = 200;

    for (let index = 0; index < 15; index++) {
      const response = await POST(
        makeRequest(
          {
            message: `Client exploded ${index}`,
            url: "https://go-daily.app/result?id=cld-001",
            timestamp: Date.now(),
            userAgent: "Vitest",
          },
          {
            headers: { "x-forwarded-for": "5.6.7.8" },
          },
        ),
      );

      status = response.status;
      if (status === 429) break;
    }

    expect(status).toBe(429);
  });
});

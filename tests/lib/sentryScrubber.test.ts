// @vitest-environment node
import { describe, expect, it } from "vitest";

import { redactString, stripUrlQueryAndHash, scrubSentryEvent } from "@/lib/sentryScrubber";

describe("redactString", () => {
  it("redacts email addresses", () => {
    expect(redactString("user@example.com sent a message")).toBe("[redacted-email] sent a message");
  });

  it("redacts multiple emails", () => {
    expect(redactString("a@b.com and c@d.com")).toBe("[redacted-email] and [redacted-email]");
  });

  it("redacts token-like strings", () => {
    expect(redactString("token_abc123def456ghi")).toContain("[redacted-token]");
  });

  it("strips query params from URLs", () => {
    const result = redactString("visit https://example.com/page?secret=123");
    expect(result).not.toContain("secret=123");
    expect(result).toContain("https://example.com/page");
  });

  it("strips hash from URLs", () => {
    const result = redactString("see https://example.com/page#section");
    expect(result).not.toContain("#section");
  });

  it("preserves plain text", () => {
    expect(redactString("no sensitive data here")).toBe("no sensitive data here");
  });
});

describe("stripUrlQueryAndHash", () => {
  it("strips query string from absolute URL", () => {
    expect(stripUrlQueryAndHash("https://example.com/path?a=1&b=2")).toBe(
      "https://example.com/path",
    );
  });

  it("strips hash from absolute URL", () => {
    expect(stripUrlQueryAndHash("https://example.com/path#hash")).toBe("https://example.com/path");
  });

  it("preserves URL without query or hash", () => {
    expect(stripUrlQueryAndHash("https://example.com/path")).toBe("https://example.com/path");
  });

  it("handles relative URL starting with /", () => {
    expect(stripUrlQueryAndHash("/path?query=1")).toBe("/path");
  });

  it("handles malformed URL gracefully", () => {
    expect(stripUrlQueryAndHash("not-a-url")).toBe("not-a-url");
  });
});

describe("scrubSentryEvent", () => {
  it("redacts emails in message", () => {
    const event = { message: "Error for user@example.com" };
    const result = scrubSentryEvent(event);
    expect(result.message).not.toContain("user@example.com");
    expect(result.message).toContain("[redacted-email]");
  });

  it("redacts emails in exception values", () => {
    const event = {
      exception: {
        values: [{ value: "Failed for admin@test.org" }],
      },
    };
    const result = scrubSentryEvent(event);
    expect(result.exception!.values![0].value).not.toContain("admin@test.org");
  });

  it("scrubs sensitive keys in request", () => {
    const event = {
      request: {
        headers: { authorization: "Bearer secret123", cookie: "session=abc" },
      },
    };
    const result = scrubSentryEvent(event);
    const req = result.request as Record<string, Record<string, string>>;
    expect(req.headers.authorization).toBe("[redacted-token]");
    expect(req.headers.cookie).toBe("[redacted-token]");
  });

  it("scrubs URLs in request", () => {
    const event = {
      request: { url: "https://example.com/api?token=secret" },
    };
    const result = scrubSentryEvent(event);
    expect((result.request as { url: string }).url).not.toContain("token=secret");
  });

  it("redacts emails in breadcrumbs", () => {
    const event = {
      breadcrumbs: [{ message: "User user@site.com clicked" }],
    };
    const result = scrubSentryEvent(event);
    expect(result.breadcrumbs![0].message).not.toContain("user@site.com");
  });

  it("handles null/undefined fields gracefully", () => {
    const event = { message: null, exception: null, request: null };
    expect(() => scrubSentryEvent(event)).not.toThrow();
  });

  it("scrubs user object", () => {
    const event = {
      user: { email: "user@example.com", id: "123" },
    };
    const result = scrubSentryEvent(event);
    expect((result.user as { email: string }).email).not.toContain("user@example.com");
  });
});

// ---- Merged from the former co-located lib/sentryScrubber.test.ts (2026-09-16) ----

describe("scrubSentryEvent", () => {
  it("redacts email addresses from exception values", () => {
    const event = {
      exception: {
        values: [{ value: "Error for alice@example.com" }],
      },
    };
    const result = scrubSentryEvent(event);
    expect(result!.exception!.values[0].value).toBe("Error for [redacted-email]");
  });

  it("strips query parameters from request URLs", () => {
    const event = {
      request: { url: "https://go-daily.app/page?token=abc123&foo=bar" },
    };
    const result = scrubSentryEvent(event);
    expect(result!.request!.url).toBe("https://go-daily.app/page");
  });

  it("redacts emails in breadcrumbs", () => {
    const event = {
      breadcrumbs: [
        { message: "User alice@example.com logged in", data: { email: "bob@test.org" } },
      ],
    };
    const result = scrubSentryEvent(event);
    expect(result!.breadcrumbs![0].message).toBe("User [redacted-email] logged in");
    expect(result!.breadcrumbs![0].data!.email).toBe("[redacted-email]");
  });

  it("scrubs sensitive context values", () => {
    const event = {
      contexts: {
        user: { email: "user@example.com", name: "Alice" },
      },
    };
    const result = scrubSentryEvent(event);
    expect(result!.contexts!.user).toEqual({ email: "[redacted-email]", name: "Alice" });
  });

  it("redacts emails in event message", () => {
    const event = { message: "Alert for admin@example.com" };
    const result = scrubSentryEvent(event);
    expect(result!.message).toBe("Alert for [redacted-email]");
  });

  it("passes through events with no sensitive data unchanged", () => {
    const event = {
      message: "Normal error",
      exception: { values: [{ value: "TypeError: x is undefined" }] },
    };
    const result = scrubSentryEvent(event);
    expect(result!.message).toBe("Normal error");
    expect(result!.exception!.values[0].value).toBe("TypeError: x is undefined");
  });

  it("scrubs email from event.user", () => {
    const event = {
      user: { email: "alice@example.com", id: "user-123" },
    };
    const result = scrubSentryEvent(event);
    expect(result!.user!.email).toBe("[redacted-email]");
    expect(result!.user!.id).toBe("user-123");
  });

  it("strips query and hash from URLs in event.extra", () => {
    const event = {
      extra: { url: "https://go-daily.app/page?token=secret#section" },
    };
    const result = scrubSentryEvent(event);
    expect(result!.extra!.url).toBe("https://go-daily.app/page");
  });

  it("scrubs sensitive values in event.tags", () => {
    const event = {
      tags: { user_email: "bob@test.org", env: "production" },
    };
    const result = scrubSentryEvent(event);
    expect(result!.tags!.user_email).toBe("[redacted-email]");
    expect(result!.tags!.env).toBe("production");
  });

  it("scrubs URLs, emails, and tokens in nested objects and arrays", () => {
    const event = {
      extra: {
        links: ["https://app.com/callback?code=abc", "http://other.org/path#frag"],
        users: [{ email: "nested@user.com", note: "token_abcdefghij" }],
      },
    };
    const result = scrubSentryEvent(event);
    expect(result!.extra!.links).toEqual(["https://app.com/callback", "http://other.org/path"]);
    expect(result!.extra!.users[0].email).toBe("[redacted-email]");
  });

  it("redacts sensitive values based on object keys", () => {
    const event = {
      request: {
        headers: {
          authorization: "Bearer live-token",
          cookie: "session=secret",
          accept: "application/json",
        },
      },
      extra: {
        apiKey: "sk-live-secret",
        sessionToken: "session-token",
      },
    };

    const result = scrubSentryEvent(event);
    expect(result!.request!.headers.authorization).toBe("[redacted-token]");
    expect(result!.request!.headers.cookie).toBe("[redacted-token]");
    expect(result!.request!.headers.accept).toBe("application/json");
    expect(result!.extra!.apiKey).toBe("[redacted-token]");
    expect(result!.extra!.sessionToken).toBe("[redacted-token]");
  });

  it("scrubs stack frame string fields", () => {
    const event = {
      exception: {
        values: [
          {
            value: "Failed for alice@example.com",
            stacktrace: {
              frames: [
                {
                  filename: "https://go-daily.app/page?token=abc123456789abcdef#frag",
                  abs_path: "https://go-daily.app/source?email=alice@example.com",
                  function: "load alice@example.com",
                  module: "/callback?token=secret#frag",
                  vars: { redirect: "https://go-daily.app/next?code=abc#section" },
                },
              ],
            },
          },
        ],
      },
    };

    const result = scrubSentryEvent(event);
    const frame = result!.exception!.values[0].stacktrace.frames[0];
    expect(frame.filename).toBe("https://go-daily.app/page");
    expect(frame.abs_path).toBe("https://go-daily.app/source");
    expect(frame.function).toBe("load [redacted-email]");
    expect(frame.module).toBe("/callback");
    expect(frame.vars.redirect).toBe("https://go-daily.app/next");
  });

  it("strips query and hash from relative and embedded URLs", () => {
    const event = {
      extra: {
        relative: "/callback?token=secret#frag",
        embedded: "see https://go-daily.app/a?token=secret#x.",
        safePath: "/plain/path",
      },
    };

    const result = scrubSentryEvent(event);
    expect(result!.extra!.relative).toBe("/callback");
    expect(result!.extra!.embedded).toBe("see https://go-daily.app/a.");
    expect(result!.extra!.safePath).toBe("/plain/path");
  });
});

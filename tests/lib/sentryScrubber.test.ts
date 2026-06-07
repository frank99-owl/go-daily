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

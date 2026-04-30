// @vitest-environment node
import { describe, expect, it } from "vitest";

import { scrubSentryEvent } from "./sentryScrubber";

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

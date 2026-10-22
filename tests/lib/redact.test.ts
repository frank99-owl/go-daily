// @vitest-environment node
import { describe, expect, it } from "vitest";

import { redactString, stripUrlQueryAndHash } from "@/lib/redact";

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

describe("redactString with URLs inside text", () => {
  it("strips query and hash from relative and embedded URLs", () => {
    expect(redactString("/callback?token=secret#frag")).toBe("/callback");
    expect(redactString("see https://go-daily.app/a?token=secret#x.")).toBe(
      "see https://go-daily.app/a.",
    );
    expect(redactString("/plain/path")).toBe("/plain/path");
  });

  it("does not leave a bracket from a [Filtered] query value on the path", () => {
    expect(
      redactString(
        "http://127.0.0.1:3201/api/puzzle/random?email=probe@example.com&token=[Filtered]",
      ),
    ).toBe("http://127.0.0.1:3201/api/puzzle/random");
  });

  it("keeps brackets the URL itself opened, and text punctuation that follows it", () => {
    expect(redactString("(see https://go-daily.app/a?token=secret).")).toBe(
      "(see https://go-daily.app/a).",
    );
    expect(redactString("[https://go-daily.app/b?x=1]")).toBe("[https://go-daily.app/b]");
    expect(redactString("docs at https://en.wikipedia.org/wiki/Go_(game) today")).toBe(
      "docs at https://en.wikipedia.org/wiki/Go_(game) today",
    );
  });
});

// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  AUTH_REDIRECT_COOKIE,
  normalizeAuthNext,
  parsePendingAuthRedirect,
  readCookieValue,
  serializePendingAuthRedirect,
} from "./authRedirect";

describe("normalizeAuthNext — same-origin guard", () => {
  it("falls back to the locale home for null / undefined / empty values", () => {
    expect(normalizeAuthNext("en", null)).toBe("/en");
    expect(normalizeAuthNext("en", undefined)).toBe("/en");
    expect(normalizeAuthNext("en", "")).toBe("/en");
  });

  it("rejects protocol-relative URLs (//evil.com) — classic open-redirect bait", () => {
    expect(normalizeAuthNext("en", "//evil.example/phish")).toBe("/en");
  });

  it("rejects absolute URLs on other origins", () => {
    expect(normalizeAuthNext("en", "https://evil.example/")).toBe("/en");
    expect(normalizeAuthNext("en", "http://localhost:3000/")).toBe("/en");
  });

  it("rejects values that don't begin with a single '/'", () => {
    expect(normalizeAuthNext("en", "puzzles/today")).toBe("/en");
    expect(normalizeAuthNext("en", "javascript:alert(1)")).toBe("/en");
  });

  it("normalizes a same-origin relative path with no locale prefix", () => {
    expect(normalizeAuthNext("en", "/puzzles/today")).toBe("/en/puzzles/today");
  });
});

describe("normalizeAuthNext — locale stripping", () => {
  it("strips a pre-existing (possibly stale) locale and re-prefixes with the active one", () => {
    // User was on /ja/profile, then switched language to zh on the login page.
    expect(normalizeAuthNext("zh", "/ja/profile")).toBe("/zh/profile");
  });

  it("handles root paths idempotently", () => {
    expect(normalizeAuthNext("ko", "/")).toBe("/ko");
    expect(normalizeAuthNext("ko", "/ko")).toBe("/ko");
    expect(normalizeAuthNext("ko", "/en")).toBe("/ko");
  });

  it("preserves query string and hash", () => {
    expect(normalizeAuthNext("en", "/puzzles/today?foo=bar#section")).toBe(
      "/en/puzzles/today?foo=bar#section",
    );
  });

  it("preserves query when switching locale", () => {
    expect(normalizeAuthNext("zh", "/ja/puzzles?id=abc")).toBe("/zh/puzzles?id=abc");
  });
});

describe("serializePendingAuthRedirect / parsePendingAuthRedirect", () => {
  it("round-trips a typical locale+next pair", () => {
    const serialized = serializePendingAuthRedirect("en", "/puzzles/today");
    const parsed = parsePendingAuthRedirect(serialized);
    expect(parsed).toEqual({ locale: "en", next: "/en/puzzles/today" });
  });

  it("survives a stale locale in the next value", () => {
    const serialized = serializePendingAuthRedirect("zh", "/ja/profile");
    // serialization normalizes first, so the encoded next is already /zh/profile
    expect(decodeURIComponent(serialized)).toContain("next=/zh/profile");

    const parsed = parsePendingAuthRedirect(serialized);
    expect(parsed).toEqual({ locale: "zh", next: "/zh/profile" });
  });

  it("returns null for empty / missing payload", () => {
    expect(parsePendingAuthRedirect(null)).toBeNull();
    expect(parsePendingAuthRedirect(undefined)).toBeNull();
    expect(parsePendingAuthRedirect("")).toBeNull();
  });

  it("returns null when locale param is invalid", () => {
    const bad = new URLSearchParams({ locale: "xx", next: "/foo" }).toString();
    expect(parsePendingAuthRedirect(bad)).toBeNull();
  });

  it("returns null when locale param is missing", () => {
    const bad = new URLSearchParams({ next: "/foo" }).toString();
    expect(parsePendingAuthRedirect(bad)).toBeNull();
  });

  it("re-normalizes a hostile 'next' even if it was smuggled past serialization", () => {
    // Simulate an attacker-crafted cookie payload.
    const crafted = `locale=en&next=${encodeURIComponent("//evil.example/phish")}`;
    const parsed = parsePendingAuthRedirect(crafted);
    expect(parsed).toEqual({ locale: "en", next: "/en" });
  });
});

describe("readCookieValue", () => {
  it("returns null for missing / empty cookie header", () => {
    expect(readCookieValue(null, "foo")).toBeNull();
    expect(readCookieValue(undefined, "foo")).toBeNull();
    expect(readCookieValue("", "foo")).toBeNull();
  });

  it("finds the target cookie among many", () => {
    const header = "session=abc; foo=bar; other=baz";
    expect(readCookieValue(header, "foo")).toBe("bar");
  });

  it("decodes percent-encoded values", () => {
    const header = `${AUTH_REDIRECT_COOKIE}=${encodeURIComponent("locale=en&next=/en/p")}`;
    expect(readCookieValue(header, AUTH_REDIRECT_COOKIE)).toBe("locale=en&next=/en/p");
  });

  it("returns null when the named cookie is absent", () => {
    expect(readCookieValue("a=1; b=2", "c")).toBeNull();
  });

  it("does not match a cookie whose name is a prefix of another", () => {
    // "foo" should not match "foobar=..."
    expect(readCookieValue("foobar=boom", "foo")).toBeNull();
  });

  it("returns empty string for a present-but-empty cookie", () => {
    expect(readCookieValue("foo=; bar=1", "foo")).toBe("");
  });
});

import { describe, expect, it } from "vitest";

import { isLikelyEmail, nextForLocale } from "./auth";
import {
  parsePendingAuthRedirect,
  readCookieValue,
  serializePendingAuthRedirect,
} from "./authRedirect";

describe("isLikelyEmail", () => {
  it("accepts typical addresses", () => {
    expect(isLikelyEmail("you@example.com")).toBe(true);
    expect(isLikelyEmail("a.b+tag@sub.co.uk")).toBe(true);
  });

  it("rejects obvious typos", () => {
    expect(isLikelyEmail("")).toBe(false);
    expect(isLikelyEmail("no-at-sign")).toBe(false);
    expect(isLikelyEmail("a@b")).toBe(false);
    expect(isLikelyEmail("with space@example.com")).toBe(false);
  });

  it("trims leading/trailing whitespace", () => {
    expect(isLikelyEmail("  you@example.com  ")).toBe(true);
  });
});

describe("nextForLocale", () => {
  it("prefixes unprefixed paths with the active locale", () => {
    expect(nextForLocale("zh", "/today")).toBe("/zh/today");
    expect(nextForLocale("ja", "/puzzles/abc")).toBe("/ja/puzzles/abc");
  });

  it("rewrites already-prefixed paths to the active locale", () => {
    expect(nextForLocale("zh", "/en/today")).toBe("/zh/today");
    expect(nextForLocale("ko", "/ja/account")).toBe("/ko/account");
  });

  it("coerces garbage back to the locale root", () => {
    expect(nextForLocale("zh", "")).toBe("/zh");
    expect(nextForLocale("en", "not-a-path")).toBe("/en");
    expect(nextForLocale("ja", "//evil.com/pwn")).toBe("/ja");
  });

  it("root path becomes locale root", () => {
    expect(nextForLocale("en", "/")).toBe("/en");
  });

  it("preserves search params while rewriting locale roots", () => {
    expect(nextForLocale("zh", "/en?from=login")).toBe("/zh?from=login");
    expect(nextForLocale("ja", "/en/today?x=1")).toBe("/ja/today?x=1");
  });
});

describe("pending auth redirect cookie helpers", () => {
  it("round-trips a locale-prefixed next path", () => {
    const serialized = serializePendingAuthRedirect("ja", "/en/today?x=1");

    expect(parsePendingAuthRedirect(serialized)).toEqual({
      locale: "ja",
      next: "/ja/today?x=1",
    });
  });

  it("rejects malformed pending redirect values", () => {
    expect(parsePendingAuthRedirect("locale=fr&next=/fr")).toBeNull();
    expect(parsePendingAuthRedirect("not url params")).toBeNull();
  });

  it("reads encoded cookie values", () => {
    const value = encodeURIComponent("locale=ko&next=%2Fko");

    expect(
      readCookieValue(
        `foo=bar; go-daily.auth-redirect=${value}; theme=dark`,
        "go-daily.auth-redirect",
      ),
    ).toBe("locale=ko&next=%2Fko");
  });
});

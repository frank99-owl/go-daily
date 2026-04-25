import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOCALE,
  isLocale,
  localePath,
  negotiateLocaleFromHeader,
  stripLocalePrefix,
} from "./localePath";

describe("isLocale", () => {
  it.each(["zh", "en", "ja", "ko"])("accepts %s", (l) => {
    expect(isLocale(l)).toBe(true);
  });
  it.each(["", "fr", null, undefined, "EN"])("rejects %s", (l) => {
    expect(isLocale(l as string | null | undefined)).toBe(false);
  });
});

describe("localePath", () => {
  it("prefixes root as /{locale}", () => {
    expect(localePath("en", "/")).toBe("/en");
  });
  it("prefixes nested paths", () => {
    expect(localePath("zh", "/puzzles/cld-001")).toBe("/zh/puzzles/cld-001");
  });
  it("normalises missing leading slash", () => {
    expect(localePath("ja", "today")).toBe("/ja/today");
  });
  it("is idempotent for already-prefixed paths", () => {
    expect(localePath("ko", "/ko/stats")).toBe("/ko/stats");
    expect(localePath("en", "/zh/puzzles")).toBe("/en/puzzles");
  });
});

describe("stripLocalePrefix", () => {
  it("returns locale + trailing path for prefixed URLs", () => {
    expect(stripLocalePrefix("/en/today")).toEqual({ locale: "en", path: "/today" });
    expect(stripLocalePrefix("/zh")).toEqual({ locale: "zh", path: "/" });
  });
  it("returns null locale for unprefixed URLs", () => {
    expect(stripLocalePrefix("/today")).toEqual({ locale: null, path: "/today" });
  });
  it("ignores unsupported 2-letter prefixes", () => {
    expect(stripLocalePrefix("/fr/today")).toEqual({ locale: null, path: "/fr/today" });
  });
});

describe("negotiateLocaleFromHeader", () => {
  it("falls back to DEFAULT_LOCALE for empty headers", () => {
    expect(negotiateLocaleFromHeader(null)).toBe(DEFAULT_LOCALE);
    expect(negotiateLocaleFromHeader("")).toBe(DEFAULT_LOCALE);
  });
  it("picks the highest-q supported language", () => {
    expect(negotiateLocaleFromHeader("fr;q=0.9,ja;q=0.8,en;q=0.7")).toBe("ja");
  });
  it("maps zh-CN and zh-TW to zh", () => {
    expect(negotiateLocaleFromHeader("zh-CN,zh;q=0.9,en;q=0.8")).toBe("zh");
    expect(negotiateLocaleFromHeader("zh-TW")).toBe("zh");
  });
  it("is case-insensitive", () => {
    expect(negotiateLocaleFromHeader("JA-JP,EN;q=0.9")).toBe("ja");
  });
});

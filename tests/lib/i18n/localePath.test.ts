import { describe, expect, it } from "vitest";

import {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  isLocale,
  localePath,
  stripLocalePrefix,
  negotiateLocaleFromHeader,
  inferLocaleFromReferer,
} from "@/lib/i18n/localePath";

describe("isLocale", () => {
  it("accepts supported locales", () => {
    expect(isLocale("zh")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("ja")).toBe(true);
    expect(isLocale("ko")).toBe(true);
  });

  it("rejects unsupported locale", () => {
    expect(isLocale("fr")).toBe(false);
    expect(isLocale("de")).toBe(false);
  });

  it("rejects null/undefined", () => {
    expect(isLocale(null)).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});

describe("localePath", () => {
  it("prefixes path with locale", () => {
    expect(localePath("en", "/today")).toBe("/en/today");
  });

  it("handles root path", () => {
    expect(localePath("zh", "/")).toBe("/zh");
  });

  it("adds leading slash if missing", () => {
    expect(localePath("ja", "today")).toBe("/ja/today");
  });

  it("does not double-prefix", () => {
    expect(localePath("en", "/ko/today")).toBe("/en/today");
  });
});

describe("stripLocalePrefix", () => {
  it("extracts locale from path", () => {
    expect(stripLocalePrefix("/en/today")).toEqual({ locale: "en", path: "/today" });
  });

  it("returns null locale for no locale prefix", () => {
    expect(stripLocalePrefix("/today")).toEqual({ locale: null, path: "/today" });
  });

  it("handles root with locale", () => {
    expect(stripLocalePrefix("/zh")).toEqual({ locale: "zh", path: "/" });
  });

  it("handles root with trailing slash", () => {
    expect(stripLocalePrefix("/zh/")).toEqual({ locale: "zh", path: "/" });
  });

  it("rejects unsupported locale prefix", () => {
    expect(stripLocalePrefix("/fr/today")).toEqual({ locale: null, path: "/fr/today" });
  });
});

describe("negotiateLocaleFromHeader", () => {
  it("returns matching locale", () => {
    expect(negotiateLocaleFromHeader("ja")).toBe("ja");
  });

  it("respects q-value ranking", () => {
    expect(negotiateLocaleFromHeader("fr;q=0.9,ja;q=1.0")).toBe("ja");
  });

  it("matches primary subtag", () => {
    expect(negotiateLocaleFromHeader("zh-CN")).toBe("zh");
  });

  it("returns default for null", () => {
    expect(negotiateLocaleFromHeader(null)).toBe(DEFAULT_LOCALE);
  });

  it("returns default for empty string", () => {
    expect(negotiateLocaleFromHeader("")).toBe(DEFAULT_LOCALE);
  });

  it("returns default when no supported locale found", () => {
    expect(negotiateLocaleFromHeader("fr,de")).toBe(DEFAULT_LOCALE);
  });

  it("handles complex header", () => {
    expect(negotiateLocaleFromHeader("en-US,en;q=0.9,ja;q=0.8")).toBe("en");
  });
});

describe("inferLocaleFromReferer", () => {
  it("extracts locale from referer URL", () => {
    expect(inferLocaleFromReferer("https://example.com/zh/today")).toBe("zh");
  });

  it("returns default for null", () => {
    expect(inferLocaleFromReferer(null)).toBe(DEFAULT_LOCALE);
  });

  it("returns default for invalid URL", () => {
    expect(inferLocaleFromReferer("not-a-url")).toBe(DEFAULT_LOCALE);
  });

  it("returns default when no locale in path", () => {
    expect(inferLocaleFromReferer("https://example.com/today")).toBe(DEFAULT_LOCALE);
  });
});

describe("constants", () => {
  it("SUPPORTED_LOCALES has 4 entries", () => {
    expect(SUPPORTED_LOCALES).toEqual(["zh", "en", "ja", "ko"]);
  });

  it("DEFAULT_LOCALE is 'en'", () => {
    expect(DEFAULT_LOCALE).toBe("en");
  });
});

// ---- Merged from the former co-located lib/i18n/localePath.test.ts (2026-09-16) ----

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

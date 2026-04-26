/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";

import { localized } from "@/lib/i18n/localized";

describe("localized", () => {
  const text = {
    en: "Hello",
    zh: "你好",
    ja: "こんにちは",
    ko: "안녕하세요",
  };

  it("returns exact locale match if available", () => {
    expect(localized(text, "ja")).toBe("こんにちは");
  });

  it("falls back to 'en' if requested locale is missing", () => {
    const partialText = {
      zh: "你好",
      en: "Hello",
      ja: "",
      ko: "",
    };
    expect(localized(partialText, "ja" as any)).toBe("Hello");
  });

  it("falls back to 'zh' if 'en' is missing", () => {
    const partialText = {
      zh: "你好",
      en: "",
      ja: "こんにちは",
      ko: "",
    };
    expect(localized(partialText, "ko" as any)).toBe("你好");
  });

  it("returns empty string if nothing matches and no fallbacks available", () => {
    expect(localized({} as any, "en")).toBe("");
  });
});

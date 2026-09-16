import fs from "fs";
import path from "path";

import { describe, expect, it } from "vitest";

import { PERSONAS, DEFAULT_PERSONA, getPersona } from "@/lib/coach/personas";
import { CoachRequestSchema, PersonaIdSchema } from "@/types/schemas";

describe("PERSONAS", () => {
  it("has 5 personas", () => {
    expect(PERSONAS).toHaveLength(5);
  });

  // PersonaId is derived from PersonaIdSchema, so the accepted API values and
  // the implemented personas are the same list by construction. This guards
  // the other direction: a schema value with no persona behind it would fall
  // back to the default silently, which is how "custom" went unnoticed.
  it("implements exactly the ids the request schema accepts", () => {
    expect([...PERSONAS.map((p) => p.id)].sort()).toEqual([...PersonaIdSchema.options].sort());
  });

  it("rejects ids that no persona implements", () => {
    expect(PersonaIdSchema.safeParse("custom").success).toBe(false);
    expect(PersonaIdSchema.safeParse("tempest").success).toBe(true);
  });

  it("each persona has required fields", () => {
    for (const p of PERSONAS) {
      expect(p.id).toBeTruthy();
      expect(p.name.en).toBeTruthy();
      expect(p.name.zh).toBeTruthy();
      expect(p.emblem).toBeTruthy();
      expect(p.stats.aggression).toBeGreaterThanOrEqual(1);
      expect(p.stats.patience).toBeGreaterThanOrEqual(1);
      expect(p.stats.logic).toBeGreaterThanOrEqual(1);
    }
  });

  it("each persona has all 4 locales for every localized field", () => {
    const locales = ["zh", "en", "ja", "ko"] as const;
    for (const p of PERSONAS) {
      for (const locale of locales) {
        expect(p.name[locale], `${p.id}.name.${locale}`).toBeTruthy();
        expect(p.title[locale], `${p.id}.title.${locale}`).toBeTruthy();
        expect(p.description[locale], `${p.id}.description.${locale}`).toBeTruthy();
        expect(p.bio[locale], `${p.id}.bio.${locale}`).toBeTruthy();
        expect(p.systemInstructions[locale], `${p.id}.systemInstructions.${locale}`).toBeTruthy();
        expect(p.tags[locale]?.length, `${p.id}.tags.${locale}`).toBeGreaterThan(0);
      }
    }
  });
});

/**
 * Compliance regression guard.
 *
 * The personas are original fictional characters — see the note at the top of
 * lib/coach/personas.ts for why this is a legal boundary, not a style choice.
 * A one-time rewrite does not hold that boundary: the next "let's add a famous
 * player as a mentor" change would quietly reopen it. These tests do.
 *
 * If a test here fails, do not edit the denylist to make it pass. Remove the
 * real person from the persona instead.
 */
describe("persona compliance", () => {
  // Full names only, in every script they are commonly written in. Surnames
  // alone are deliberately excluded — they collide with ordinary words and
  // would make the guard flaky. The first five are the transliterations that
  // actually shipped before 2026-09; the rest are prominent professionals and
  // historical players, so that swapping in a *different* real player fails too.
  // Grouped one person per line on purpose, so a reviewer can see every
  // transliteration of a name together; prettier would flatten that.
  // prettier-ignore
  const REAL_PLAYER_NAMES = [
    // Shipped before 2026-09 — every transliteration that was in the file.
    "柯洁", "柯潔", "커제", "Ke Jie",
    "李世石", "李世ドル", "李世乭", "이세돌", "Lee Sedol", "Lee Se-dol",
    "吴清源", "吳清源", "呉清源", "오청원", "Go Seigen", "Wu Qingyuan",
    "井山裕太", "이야마 유타", "Iyama Yuta",
    "申真谞", "申眞諝", "신진서", "Shin Jinseo", "Shin Jin-seo",
    // China
    "聂卫平", "Nie Weiping", "马晓春", "Ma Xiaochun", "常昊", "Chang Hao",
    "古力", "Gu Li", "陈耀烨", "Chen Yaoye", "芈昱廷", "Mi Yuting",
    "唐韦星", "Tang Weixing", "辜梓豪", "Gu Zihao", "於之莹", "Yu Zhiying",
    // Korea
    "이창호", "李昌鎬", "Lee Chang-ho", "Lee Changho", "조훈현", "曺薰鉉", "Cho Hunhyun",
    "박정환", "朴廷桓", "Park Junghwan", "최정", "Choi Jeong", "유창혁", "Yoo Changhyuk",
    // Japan
    "一力遼", "Ichiriki Ryo", "芝野虎丸", "Shibano Toramaru", "張栩", "Cho U",
    "趙治勲", "Cho Chikun", "小林光一", "Kobayashi Koichi", "武宮正樹", "Takemiya Masaki",
    "藤沢秀行", "Fujisawa Shuko", "仲邑菫", "Nakamura Sumire",
    // Historical
    "本因坊秀策", "Honinbo Shusaku", "本因坊道策", "Honinbo Dosaku",
  ];

  // Every file that renders or defines a persona. A name in any of them is a
  // name in front of a user, in an API payload, or in an analytics property.
  const PERSONA_SURFACE = [
    "lib/coach/personas.ts",
    "types/schemas.ts",
    "app/[locale]/mentors/page.tsx",
    "components/CoachPersonaSelector.tsx",
  ];

  // Romanized names match on word boundaries: a plain substring test would
  // flag "Cho U" inside "echo using". CJK has no word boundaries, so those
  // names match as substrings — which is also how they would appear in prose.
  function mentions(source: string, name: string): boolean {
    if (/^[A-Za-z\s-]+$/.test(name)) {
      const escaped = name.replace(/[-\s]/g, (c) => (c === "-" ? "-" : "\\s+"));
      return new RegExp(`\\b${escaped}\\b`, "i").test(source);
    }
    return source.includes(name);
  }

  it("names no real player anywhere on the persona surface", () => {
    const hits: string[] = [];
    for (const file of PERSONA_SURFACE) {
      const source = fs.readFileSync(path.join(process.cwd(), file), "utf-8");
      for (const name of REAL_PLAYER_NAMES) {
        if (mentions(source, name)) hits.push(`${file}: "${name}"`);
      }
    }
    expect(hits, "real player names found on the persona surface").toEqual([]);
  });

  it("the name guard actually detects a real name", () => {
    // Guards the guard: a matcher bug that never fires would report green.
    expect(mentions('name: { en: "Ke Jie" }', "Ke Jie")).toBe(true);
    expect(mentions('name: { zh: "柯洁" }', "柯洁")).toBe(true);
    expect(mentions("run echo using bash", "Cho U")).toBe(false);
  });

  it("uses no national flag as an emblem", () => {
    // Every flag emoji is a pair of Regional Indicator Symbols (U+1F1E6–U+1F1FF).
    const regionalIndicator = /[\u{1F1E6}-\u{1F1FF}]/u;
    for (const p of PERSONAS) {
      expect(regionalIndicator.test(p.emblem), `${p.id} emblem is a flag`).toBe(false);
    }
  });

  it("describes a teaching register rather than assuming an identity", () => {
    // The old instructions opened "You are <player>" / "你是<player>". A
    // register ("teach in a sharp, direct tone") is adoptable without claiming
    // to be anyone; an identity is exactly what the rewrite removed.
    const identityClaims: Record<"zh" | "en" | "ja" | "ko", RegExp> = {
      zh: /你是/,
      en: /\byou are\b/i,
      ja: /あなたは/,
      ko: /당신은/,
    };
    for (const p of PERSONAS) {
      for (const [locale, pattern] of Object.entries(identityClaims) as [
        keyof typeof identityClaims,
        RegExp,
      ][]) {
        expect(
          pattern.test(p.systemInstructions[locale]),
          `${p.id}.systemInstructions.${locale} assumes an identity`,
        ).toBe(false);
      }
    }
  });
});

describe("DEFAULT_PERSONA", () => {
  it("is Still Water", () => {
    expect(DEFAULT_PERSONA.id).toBe("still-water");
  });

  it("is a member of PERSONAS", () => {
    expect(PERSONAS).toContain(DEFAULT_PERSONA);
  });
});

describe("getPersona", () => {
  it("returns each persona by id", () => {
    for (const p of PERSONAS) {
      expect(getPersona(p.id)).toBe(p);
    }
  });

  it("returns default for undefined", () => {
    expect(getPersona(undefined)).toBe(DEFAULT_PERSONA);
  });

  it("returns default for unknown id", () => {
    expect(getPersona("unknown" as never)).toBe(DEFAULT_PERSONA);
  });
});

describe("CoachRequestSchema.personaId", () => {
  const base = {
    puzzleId: "p1",
    locale: "en",
    userMove: { x: 1, y: 1 },
    history: [{ role: "user", content: "Why?", ts: 1 }],
  };

  it("accepts a current persona id", () => {
    const parsed = CoachRequestSchema.safeParse({ ...base, personaId: "bedrock" });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.personaId).toBe("bedrock");
  });

  it("degrades a stale pre-rename id to no preference instead of failing", () => {
    // A tab left open across the 2026-09 rename still sends the old id. The
    // request must succeed and fall back to the default persona — failing it
    // would 400 the paid coach for that user until they reload.
    const parsed = CoachRequestSchema.safeParse({ ...base, personaId: "ke-jie" });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.personaId).toBeUndefined();
  });

  it("still validates the rest of the request", () => {
    const parsed = CoachRequestSchema.safeParse({ ...base, personaId: "ke-jie", puzzleId: "" });
    expect(parsed.success).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { PERSONAS, DEFAULT_PERSONA, getPersona } from "@/lib/coach/personas";

describe("PERSONAS", () => {
  it("has 5 personas", () => {
    expect(PERSONAS).toHaveLength(5);
  });

  it("each persona has required fields", () => {
    for (const p of PERSONAS) {
      expect(p.id).toBeTruthy();
      expect(p.name.en).toBeTruthy();
      expect(p.name.zh).toBeTruthy();
      expect(p.flag).toBeTruthy();
      expect(p.avatar).toBeTruthy();
      expect(p.stats.aggression).toBeGreaterThanOrEqual(1);
      expect(p.stats.patience).toBeGreaterThanOrEqual(1);
      expect(p.stats.logic).toBeGreaterThanOrEqual(1);
    }
  });

  it("each persona has all 4 locale names", () => {
    for (const p of PERSONAS) {
      expect(p.name.en).toBeTruthy();
      expect(p.name.zh).toBeTruthy();
      expect(p.name.ja).toBeTruthy();
      expect(p.name.ko).toBeTruthy();
    }
  });
});

describe("DEFAULT_PERSONA", () => {
  it("is Go Seigen", () => {
    expect(DEFAULT_PERSONA.id).toBe("go-seigen");
  });
});

describe("getPersona", () => {
  it("returns matching persona by id", () => {
    const p = getPersona("ke-jie");
    expect(p.id).toBe("ke-jie");
    expect(p.name.en).toBe("Ke Jie");
  });

  it("returns Lee Sedol", () => {
    expect(getPersona("lee-sedol").id).toBe("lee-sedol");
  });

  it("returns Go Seigen", () => {
    expect(getPersona("go-seigen").id).toBe("go-seigen");
  });

  it("returns Iyama Yuta", () => {
    expect(getPersona("iyama-yuta").id).toBe("iyama-yuta");
  });

  it("returns Shin Jinseo", () => {
    expect(getPersona("shin-jinseo").id).toBe("shin-jinseo");
  });

  it("returns default for undefined", () => {
    expect(getPersona(undefined)).toBe(DEFAULT_PERSONA);
  });

  it("returns default for unknown id", () => {
    expect(getPersona("unknown" as never)).toBe(DEFAULT_PERSONA);
  });
});

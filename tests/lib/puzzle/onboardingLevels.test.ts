import { describe, expect, it } from "vitest";

import {
  ONBOARDING_LEVELS,
  ONBOARDING_LEVEL_DIFFICULTIES,
  isOnboardingLevel,
  parseOnboardingLevel,
  normalizeOnboardingLevel,
  getDifficultiesForOnboardingLevel,
} from "@/lib/puzzle/onboardingLevels";

describe("isOnboardingLevel", () => {
  it("accepts 'beginner'", () => {
    expect(isOnboardingLevel("beginner")).toBe(true);
  });

  it("accepts 'intermediate'", () => {
    expect(isOnboardingLevel("intermediate")).toBe(true);
  });

  it("accepts 'advanced'", () => {
    expect(isOnboardingLevel("advanced")).toBe(true);
  });

  it("rejects undefined", () => {
    expect(isOnboardingLevel(undefined)).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isOnboardingLevel("")).toBe(false);
  });

  it("rejects unknown value", () => {
    expect(isOnboardingLevel("expert")).toBe(false);
  });
});

describe("parseOnboardingLevel", () => {
  it("parses valid level", () => {
    expect(parseOnboardingLevel("beginner")).toBe("beginner");
  });

  it("returns null for null", () => {
    expect(parseOnboardingLevel(null)).toBe(null);
  });

  it("returns null for undefined", () => {
    expect(parseOnboardingLevel(undefined)).toBe(null);
  });

  it("returns null for invalid string", () => {
    expect(parseOnboardingLevel("expert")).toBe(null);
  });

  it("maps legacy 'kyu' to 'intermediate'", () => {
    expect(parseOnboardingLevel("kyu")).toBe("intermediate");
  });

  it("maps legacy 'dan' to 'advanced'", () => {
    expect(parseOnboardingLevel("dan")).toBe("advanced");
  });
});

describe("normalizeOnboardingLevel", () => {
  it("returns valid level as-is", () => {
    expect(normalizeOnboardingLevel("advanced")).toBe("advanced");
  });

  it("defaults to 'beginner' for undefined", () => {
    expect(normalizeOnboardingLevel(undefined)).toBe("beginner");
  });

  it("defaults to 'beginner' for invalid value", () => {
    expect(normalizeOnboardingLevel("expert")).toBe("beginner");
  });

  it("maps legacy 'kyu'", () => {
    expect(normalizeOnboardingLevel("kyu")).toBe("intermediate");
  });
});

describe("getDifficultiesForOnboardingLevel", () => {
  it("beginner maps to difficulty [1]", () => {
    expect(getDifficultiesForOnboardingLevel("beginner")).toEqual([1]);
  });

  it("intermediate maps to difficulties [2, 3]", () => {
    expect(getDifficultiesForOnboardingLevel("intermediate")).toEqual([2, 3]);
  });

  it("advanced maps to difficulties [4, 5]", () => {
    expect(getDifficultiesForOnboardingLevel("advanced")).toEqual([4, 5]);
  });
});

describe("constants", () => {
  it("ONBOARDING_LEVELS has 3 entries", () => {
    expect(ONBOARDING_LEVELS).toEqual(["beginner", "intermediate", "advanced"]);
  });

  it("ONBOARDING_LEVEL_DIFFICULTIES covers all levels", () => {
    for (const level of ONBOARDING_LEVELS) {
      expect(ONBOARDING_LEVEL_DIFFICULTIES[level]).toBeDefined();
      expect(ONBOARDING_LEVEL_DIFFICULTIES[level].length).toBeGreaterThan(0);
    }
  });
});

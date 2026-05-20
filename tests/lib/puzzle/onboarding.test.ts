import { describe, expect, it } from "vitest";

import {
  getOnboardingPuzzle,
  getOnboardingSummaries,
  normalizeOnboardingLevel,
  parseOnboardingLevel,
} from "@/lib/puzzle/onboarding";

describe("onboarding puzzle selection", () => {
  it("normalizes unsupported levels to beginner", () => {
    expect(normalizeOnboardingLevel(undefined)).toBe("beginner");
    expect(normalizeOnboardingLevel("strong")).toBe("beginner");
    expect(normalizeOnboardingLevel("advanced")).toBe("advanced");
    expect(normalizeOnboardingLevel("kyu")).toBe("intermediate");
    expect(normalizeOnboardingLevel("dan")).toBe("advanced");
  });

  it("parses stored training levels without turning invalid values into beginner", () => {
    expect(parseOnboardingLevel("beginner")).toBe("beginner");
    expect(parseOnboardingLevel("kyu")).toBe("intermediate");
    expect(parseOnboardingLevel("30kyu")).toBeNull();
    expect(parseOnboardingLevel(null)).toBeNull();
  });

  it("returns coach-eligible starter pools by level", () => {
    expect(getOnboardingSummaries("beginner")[0]?.difficulty).toBe(1);
    expect(getOnboardingSummaries("intermediate").every((p) => [2, 3].includes(p.difficulty))).toBe(
      true,
    );
    expect(getOnboardingSummaries("advanced").every((p) => [4, 5].includes(p.difficulty))).toBe(
      true,
    );
  });

  it("returns stable fallback puzzles for the first session", () => {
    expect(getOnboardingPuzzle("beginner").id).toBe("p-00001");
    expect(getOnboardingPuzzle("intermediate").id).toBe("p-00107");
    expect(getOnboardingPuzzle("advanced").id).toBe("p-00416");
  });
});

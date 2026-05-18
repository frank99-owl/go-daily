import { describe, expect, it } from "vitest";

import { getNextRecommendation } from "@/lib/puzzle/nextRecommendation";
import type { AttemptRecord } from "@/types";

const baseAttempt: AttemptRecord = {
  puzzleId: "p-001",
  date: "2026-05-18",
  userMove: { x: 3, y: 3 },
  correct: true,
  solvedAtMs: 100,
  revealToken: "token",
};

describe("getNextRecommendation", () => {
  it("keeps onboarding practice on the selected level", () => {
    const recommendation = getNextRecommendation({
      puzzle: { id: "p-001", difficulty: 3, tag: "life-death" },
      correct: true,
      attempts: [baseAttempt],
      onboardingLevel: "intermediate",
    });

    expect(recommendation).toMatchObject({
      primaryAction: "continue-practice",
      targetLevel: "intermediate",
      targetDifficulty: 3,
      difficultyHint: "same-level",
      reasonId: "onboarding-path",
    });
  });

  it("continues practice and steps up conservatively after a clean correct answer", () => {
    const recommendation = getNextRecommendation({
      puzzle: { id: "p-001", difficulty: 1, tag: "life-death" },
      correct: true,
      attempts: [baseAttempt],
    });

    expect(recommendation).toMatchObject({
      primaryAction: "continue-practice",
      targetLevel: "intermediate",
      targetDifficulty: 2,
      difficultyHint: "step-up",
      reasonId: "correct-step-up",
    });
  });

  it("keeps the same topic and mistake reason after a wrong answer", () => {
    const recommendation = getNextRecommendation({
      puzzle: { id: "p-001", difficulty: 2, tag: "tesuji" },
      correct: false,
      mistakeReasonId: "shape-reading",
      attempts: [{ ...baseAttempt, correct: false }],
    });

    expect(recommendation).toMatchObject({
      primaryAction: "continue-practice",
      targetLevel: "intermediate",
      targetDifficulty: 2,
      difficultyHint: "same-level",
      targetTag: "tesuji",
      mistakeReasonId: "shape-reading",
      reasonId: "wrong-same-mistake",
    });
  });

  it("prompts review when unresolved mistakes are in the attempt history", () => {
    const recommendation = getNextRecommendation({
      puzzle: { id: "p-003", difficulty: 4, tag: "opening" },
      correct: true,
      attempts: [
        baseAttempt,
        { ...baseAttempt, puzzleId: "p-002", correct: false, solvedAtMs: 200 },
      ],
    });

    expect(recommendation.includeReviewPrompt).toBe(true);
    expect(recommendation.reviewBacklogCount).toBe(1);
    expect(recommendation.primaryAction).toBe("continue-practice");
  });

  it("falls back to the current level when there are no attempts yet", () => {
    const recommendation = getNextRecommendation({
      puzzle: { id: "p-001", difficulty: 5, tag: "endgame" },
      correct: false,
      attempts: [],
    });

    expect(recommendation).toMatchObject({
      targetLevel: "advanced",
      targetDifficulty: 5,
      difficultyHint: "same-level",
      reasonId: "fallback-practice",
      includeReviewPrompt: false,
    });
  });
});

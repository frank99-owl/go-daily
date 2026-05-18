import type { MistakeReasonId } from "@/lib/puzzle/mistakeReason";
import type { OnboardingLevel, PuzzleDifficulty } from "@/lib/puzzle/onboardingLevels";
import type { AttemptRecord, PuzzleTag } from "@/types";

export type NextRecommendationPrimaryAction = "continue-practice" | "review-mistakes";
export type NextRecommendationDifficultyHint = "same-level" | "step-up";
export type NextRecommendationReasonId =
  | "onboarding-path"
  | "correct-same-level"
  | "correct-step-up"
  | "wrong-same-mistake"
  | "wrong-same-topic"
  | "fallback-practice";

export type NextRecommendationPuzzle = {
  id: string;
  difficulty: PuzzleDifficulty;
  tag: PuzzleTag;
};

export type NextRecommendationInput = {
  puzzle: NextRecommendationPuzzle;
  correct: boolean;
  mistakeReasonId?: MistakeReasonId | null;
  attempts: AttemptRecord[];
  onboardingLevel?: OnboardingLevel | null;
};

export type NextRecommendation = {
  primaryAction: NextRecommendationPrimaryAction;
  targetLevel: OnboardingLevel;
  targetDifficulty: PuzzleDifficulty;
  difficultyHint: NextRecommendationDifficultyHint;
  targetTag?: PuzzleTag;
  mistakeReasonId?: MistakeReasonId;
  reasonId: NextRecommendationReasonId;
  includeReviewPrompt: boolean;
  reviewBacklogCount: number;
};

function levelForDifficulty(difficulty: PuzzleDifficulty): OnboardingLevel {
  if (difficulty <= 1) return "beginner";
  if (difficulty <= 3) return "intermediate";
  return "advanced";
}

function clampDifficulty(value: number): PuzzleDifficulty {
  return Math.min(5, Math.max(1, value)) as PuzzleDifficulty;
}

function latestAttemptByPuzzle(attempts: AttemptRecord[]): Map<string, AttemptRecord> {
  const latest = new Map<string, AttemptRecord>();
  for (const attempt of attempts) {
    const existing = latest.get(attempt.puzzleId);
    if (!existing || attempt.solvedAtMs > existing.solvedAtMs) {
      latest.set(attempt.puzzleId, attempt);
    }
  }
  return latest;
}

function countReviewBacklog(attempts: AttemptRecord[]): number {
  let count = 0;
  for (const attempt of latestAttemptByPuzzle(attempts).values()) {
    if (!attempt.correct) count += 1;
  }
  return count;
}

function hasPriorWrongAttemptForPuzzle(attempts: AttemptRecord[], puzzleId: string): boolean {
  return attempts.some((attempt) => attempt.puzzleId === puzzleId && !attempt.correct);
}

export function getNextRecommendation(input: NextRecommendationInput): NextRecommendation {
  const reviewBacklogCount = countReviewBacklog(input.attempts);
  const includeReviewPrompt = reviewBacklogCount > 0;
  const currentLevel = levelForDifficulty(input.puzzle.difficulty);

  if (input.onboardingLevel) {
    return {
      primaryAction: "continue-practice",
      targetLevel: input.onboardingLevel,
      targetDifficulty: input.puzzle.difficulty,
      difficultyHint: "same-level",
      reasonId: "onboarding-path",
      includeReviewPrompt,
      reviewBacklogCount,
    };
  }

  if (input.attempts.length === 0) {
    return {
      primaryAction: "continue-practice",
      targetLevel: currentLevel,
      targetDifficulty: input.puzzle.difficulty,
      difficultyHint: "same-level",
      reasonId: "fallback-practice",
      includeReviewPrompt,
      reviewBacklogCount,
    };
  }

  if (!input.correct) {
    return {
      primaryAction: "continue-practice",
      targetLevel: currentLevel,
      targetDifficulty: input.puzzle.difficulty,
      difficultyHint: "same-level",
      targetTag: input.puzzle.tag,
      ...(input.mistakeReasonId ? { mistakeReasonId: input.mistakeReasonId } : {}),
      reasonId: input.mistakeReasonId ? "wrong-same-mistake" : "wrong-same-topic",
      includeReviewPrompt,
      reviewBacklogCount,
    };
  }

  const shouldStepUp =
    input.puzzle.difficulty < 5 && !hasPriorWrongAttemptForPuzzle(input.attempts, input.puzzle.id);
  const targetDifficulty = shouldStepUp
    ? clampDifficulty(input.puzzle.difficulty + 1)
    : input.puzzle.difficulty;

  return {
    primaryAction: "continue-practice",
    targetLevel: levelForDifficulty(targetDifficulty),
    targetDifficulty,
    difficultyHint: shouldStepUp ? "step-up" : "same-level",
    reasonId: shouldStepUp ? "correct-step-up" : "correct-same-level",
    includeReviewPrompt,
    reviewBacklogCount,
  };
}

import type { MistakeReasonId } from "@/lib/puzzle/mistakeReason";
import type { OnboardingLevel, PuzzleDifficulty } from "@/lib/puzzle/onboardingLevels";
import type { AttemptRecord, PuzzleSummary, PuzzleTag } from "@/types";

export type NextRecommendationPrimaryAction = "continue-practice" | "review-mistakes";
export type NextRecommendationDifficultyHint = "same-level" | "step-up" | "step-down";
export type NextRecommendationReasonId =
  | "onboarding-path"
  | "correct-same-level"
  | "correct-step-up"
  | "correct-step-down"
  | "wrong-same-mistake"
  | "wrong-same-topic"
  | "target-weak-area"
  | "review-backlog"
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
  summaries?: PuzzleSummary[];
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

const REVIEW_BACKLOG_THRESHOLD = 5;
const RECENT_ATTEMPTS_WINDOW = 20;
const ADAPTIVE_DIFFICULTY_WINDOW = 10;
const STEP_UP_THRESHOLD = 0.8;
const STEP_DOWN_THRESHOLD = 0.4;

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

/**
 * Infer mistake reason from a puzzle summary (tag + difficulty).
 * Mirrors the logic in trainingInsights.ts for consistency.
 */
function inferMistakeReasonFromSummary(summary: PuzzleSummary): MistakeReasonId {
  switch (summary.tag) {
    case "endgame":
      return "endgame-value";
    case "opening":
      return "opening-direction";
    case "tesuji":
      return "shape-reading";
    case "life-death":
      return summary.difficulty <= 2 ? "liberty-counting" : "shape-reading";
  }
}

/**
 * Analyze the user's recent attempt history to find weak mistake areas.
 * Returns mistake reason IDs sorted by frequency (most frequent first).
 */
export function analyzeWeakAreas(
  attempts: AttemptRecord[],
  summaries?: PuzzleSummary[],
): MistakeReasonId[] {
  if (attempts.length === 0 || !summaries?.length) return [];

  const summaryById = new Map(summaries.map((s) => [s.id, s]));
  const sorted = [...attempts].sort((a, b) => b.solvedAtMs - a.solvedAtMs);
  const recent = sorted.slice(0, RECENT_ATTEMPTS_WINDOW);

  const counts = new Map<MistakeReasonId, number>();
  for (const attempt of recent) {
    if (attempt.correct) continue;
    const summary = summaryById.get(attempt.puzzleId);
    if (!summary) continue;
    const reason = inferMistakeReasonFromSummary(summary);
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)
    .slice(0, 3);
}

/**
 * Compute adaptive difficulty based on recent accuracy.
 * Returns a difficulty adjustment: +1 (step up), 0 (same), or -1 (step down).
 */
export function computeAdaptiveDifficulty(attempts: AttemptRecord[]): -1 | 0 | 1 {
  if (attempts.length < ADAPTIVE_DIFFICULTY_WINDOW) return 0;

  const sorted = [...attempts].sort((a, b) => b.solvedAtMs - a.solvedAtMs);
  const recent = sorted.slice(0, ADAPTIVE_DIFFICULTY_WINDOW);
  const correctCount = recent.filter((a) => a.correct).length;
  const accuracy = correctCount / recent.length;

  if (accuracy >= STEP_UP_THRESHOLD) return 1;
  if (accuracy <= STEP_DOWN_THRESHOLD) return -1;
  return 0;
}

/**
 * Map a mistake reason to the most relevant puzzle tag for targeted practice.
 */
function tagForWeakReason(reason: MistakeReasonId): PuzzleTag {
  switch (reason) {
    case "endgame-value":
      return "endgame";
    case "opening-direction":
      return "opening";
    case "shape-reading":
      return "tesuji";
    case "liberty-counting":
    case "missed-vital-point":
      return "life-death";
  }
}

export function getNextRecommendation(input: NextRecommendationInput): NextRecommendation {
  const reviewBacklogCount = countReviewBacklog(input.attempts);
  const includeReviewPrompt = reviewBacklogCount > 0;
  const currentLevel = levelForDifficulty(input.puzzle.difficulty);

  // Onboarding: stay on the selected level.
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

  // No attempts yet: fall back to current level.
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

  // Large review backlog: prioritize review over new practice.
  if (reviewBacklogCount >= REVIEW_BACKLOG_THRESHOLD && input.correct) {
    return {
      primaryAction: "review-mistakes",
      targetLevel: currentLevel,
      targetDifficulty: input.puzzle.difficulty,
      difficultyHint: "same-level",
      reasonId: "review-backlog",
      includeReviewPrompt: true,
      reviewBacklogCount,
    };
  }

  // Wrong answer: target the same topic/mistake reason.
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

  // Correct answer: check for weak-area targeting first.
  const weakAreas = analyzeWeakAreas(input.attempts, input.summaries);
  if (weakAreas.length > 0) {
    const weakestReason = weakAreas[0];
    const targetTag = tagForWeakReason(weakestReason);
    // Only target weak area if it's different from the current puzzle's tag
    // (avoid repeating the same type immediately).
    if (targetTag !== input.puzzle.tag) {
      return {
        primaryAction: "continue-practice",
        targetLevel: currentLevel,
        targetDifficulty: input.puzzle.difficulty,
        difficultyHint: "same-level",
        targetTag,
        mistakeReasonId: weakestReason,
        reasonId: "target-weak-area",
        includeReviewPrompt,
        reviewBacklogCount,
      };
    }
  }

  // Adaptive difficulty: adjust based on recent accuracy.
  const adaptiveDelta = computeAdaptiveDifficulty(input.attempts);
  if (adaptiveDelta !== 0) {
    const targetDifficulty = clampDifficulty(input.puzzle.difficulty + adaptiveDelta);
    return {
      primaryAction: "continue-practice",
      targetLevel: levelForDifficulty(targetDifficulty),
      targetDifficulty,
      difficultyHint: adaptiveDelta > 0 ? "step-up" : "step-down",
      reasonId: adaptiveDelta > 0 ? "correct-step-up" : "correct-step-down",
      includeReviewPrompt,
      reviewBacklogCount,
    };
  }

  // Default: conservative step-up (original behavior).
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

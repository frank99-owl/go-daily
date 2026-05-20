import { COACH_BASIC_ELIGIBLE_ID_SET } from "@/content/coachContent";
import { getPuzzleById } from "@/content/puzzles.server";
import { getAllSummaries } from "@/content/puzzleSummaries.server";
import type { Puzzle, PuzzleSummary } from "@/types";

import { getDifficultiesForOnboardingLevel, type OnboardingLevel } from "./onboardingLevels";

export {
  isOnboardingLevel,
  normalizeOnboardingLevel,
  ONBOARDING_LEVELS,
  parseOnboardingLevel,
  type OnboardingLevel,
} from "./onboardingLevels";

type OnboardingLevelConfig = {
  fallbackId: string;
};

const LEVEL_CONFIG: Record<OnboardingLevel, OnboardingLevelConfig> = {
  beginner: { fallbackId: "p-00001" },
  intermediate: { fallbackId: "p-00107" },
  advanced: { fallbackId: "p-00416" },
};

export function getOnboardingSummaries(level: OnboardingLevel): PuzzleSummary[] {
  const difficulties = getDifficultiesForOnboardingLevel(level);
  return getAllSummaries().filter(
    (summary) =>
      difficulties.includes(summary.difficulty) && COACH_BASIC_ELIGIBLE_ID_SET.has(summary.id),
  );
}

export function getOnboardingPuzzle(level: OnboardingLevel): Puzzle {
  const config = LEVEL_CONFIG[level];
  const difficulties = getDifficultiesForOnboardingLevel(level);
  const fallback = getPuzzleById(config.fallbackId);
  if (
    fallback &&
    difficulties.includes(fallback.difficulty) &&
    COACH_BASIC_ELIGIBLE_ID_SET.has(fallback.id)
  ) {
    return fallback;
  }

  const firstSummary = getOnboardingSummaries(level)[0];
  const puzzle = firstSummary ? getPuzzleById(firstSummary.id) : undefined;
  if (!puzzle) {
    throw new Error(`No onboarding puzzle available for level "${level}".`);
  }
  return puzzle;
}

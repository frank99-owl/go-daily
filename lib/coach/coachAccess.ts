import {
  COACH_BASIC_ELIGIBLE_ID_SET,
  COACH_READY_ID_SET,
  COACH_VARIATION_READY_ID_SET,
} from "@/content/coachContent";
import { checkCoachEligibility } from "@/lib/coach/coachEligibility";
import type { CoachContentTier, PublicCoachAccess, Puzzle } from "@/types";

const LOCALES = ["zh", "en", "ja", "ko"] as const;

function hasStaticExplanation(puzzle: Puzzle): boolean {
  return (
    (puzzle.correct?.length ?? 0) > 0 &&
    LOCALES.every((locale) => (puzzle.solutionNote?.[locale] ?? "").trim().length > 0)
  );
}

function getContentTier({
  basicEligible,
  coachReady,
  variationReady,
  eligible,
  qualityTier,
}: {
  basicEligible: boolean;
  coachReady: boolean;
  variationReady: boolean;
  eligible: boolean;
  qualityTier: PublicCoachAccess["qualityTier"];
}): CoachContentTier {
  if (variationReady && qualityTier === "coach-ready") return "variation-ready";
  if (coachReady && qualityTier === "coach-ready") return "coach-ready";
  if (basicEligible && eligible) return "coach-eligible";
  return "basic-explained";
}

export function getCoachAccess(puzzle: Puzzle): PublicCoachAccess {
  const eligibility = checkCoachEligibility(puzzle);
  const basicEligible = COACH_BASIC_ELIGIBLE_ID_SET.has(puzzle.id);
  const coachReady = COACH_READY_ID_SET.has(puzzle.id);
  const variationReady = COACH_VARIATION_READY_ID_SET.has(puzzle.id);
  const contentTier = getContentTier({
    basicEligible,
    coachReady,
    variationReady,
    eligible: eligibility.eligible,
    qualityTier: eligibility.qualityTier,
  });
  const fullCoach = contentTier === "coach-ready" || contentTier === "variation-ready";

  return {
    available: fullCoach,
    reason: fullCoach ? "approved" : "restricted",
    contentTier,
    qualityTier: eligibility.qualityTier,
    hasVariationSupport: eligibility.hasVariationSupport,
    capabilities: {
      staticExplanation: hasStaticExplanation(puzzle),
      basicCoach: basicEligible && eligibility.eligible,
      fullCoach,
      variationQuestions: contentTier === "variation-ready",
    },
  };
}

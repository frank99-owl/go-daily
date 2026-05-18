import coachEligibleIds from "@/content/data/coachEligibleIds.json";
import { checkCoachEligibility } from "@/lib/coach/coachEligibility";
import type { CoachContentTier, PublicCoachAccess, Puzzle } from "@/types";

const APPROVED_IDS = new Set<string>(coachEligibleIds as string[]);
const LOCALES = ["zh", "en", "ja", "ko"] as const;

function isApprovedCoachId(id: string): boolean {
  return APPROVED_IDS.has(id);
}

function hasStaticExplanation(puzzle: Puzzle): boolean {
  return (
    (puzzle.correct?.length ?? 0) > 0 &&
    LOCALES.every((locale) => (puzzle.solutionNote?.[locale] ?? "").trim().length > 0)
  );
}

function getContentTier({
  approved,
  qualityTier,
}: {
  approved: boolean;
  qualityTier: PublicCoachAccess["qualityTier"];
}): CoachContentTier {
  if (approved && qualityTier === "coach-ready") return "coach-ready";
  if (approved && qualityTier === "explained") return "coach-eligible";
  return "basic-explained";
}

export function getCoachAccess(puzzle: Puzzle): PublicCoachAccess {
  const eligibility = checkCoachEligibility(puzzle);
  const approved = isApprovedCoachId(puzzle.id);
  const contentTier = getContentTier({
    approved,
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
      basicCoach: approved && eligibility.eligible,
      fullCoach,
      variationQuestions: contentTier === "variation-ready",
    },
  };
}

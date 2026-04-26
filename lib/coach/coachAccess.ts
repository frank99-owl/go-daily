import coachEligibleIds from "@/content/data/coachEligibleIds.json";
import { checkCoachEligibility } from "@/lib/coach/coachEligibility";
import type { Puzzle } from "@/types";

export type CoachAccessReason = "curated" | "approved" | "restricted";

const APPROVED_IDS = new Set<string>(coachEligibleIds as string[]);

export function getApprovedCoachIds(): string[] {
  return [...APPROVED_IDS];
}

export function isApprovedCoachId(id: string): boolean {
  return APPROVED_IDS.has(id);
}

export function getCoachAccess(puzzle: Puzzle): {
  available: boolean;
  reason: CoachAccessReason;
} {
  if (puzzle.isCurated) {
    return { available: true, reason: "curated" };
  }

  if (isApprovedCoachId(puzzle.id) && checkCoachEligibility(puzzle).eligible) {
    return { available: true, reason: "approved" };
  }

  return { available: false, reason: "restricted" };
}

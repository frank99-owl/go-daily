import type { Puzzle } from "@/types";

import coachEligibleIds from "./data/coachEligibleIds.json";
import { buildEditorialPrompt } from "./editorialTemplates";

const EDITORIAL_OVERRIDE_IDS = new Set<string>(coachEligibleIds as string[]);

export function hasEditorialOverride(id: string): boolean {
  return EDITORIAL_OVERRIDE_IDS.has(id);
}

export function applyEditorialOverride(puzzle: Puzzle): Puzzle {
  if (!hasEditorialOverride(puzzle.id)) {
    return puzzle;
  }

  return {
    ...puzzle,
    prompt: buildEditorialPrompt(puzzle),
  };
}

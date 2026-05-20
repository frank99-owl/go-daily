import type { Puzzle } from "@/types";

import { COACH_BASIC_ELIGIBLE_IDS } from "./coachContent";
import { buildEditorialPrompt } from "./editorialTemplates";

const EDITORIAL_OVERRIDE_IDS = new Set<string>(COACH_BASIC_ELIGIBLE_IDS);

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

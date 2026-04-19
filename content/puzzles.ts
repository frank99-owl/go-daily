// Puzzle aggregator — currently backed entirely by the classical tsumego corpus
// (sanderland/tsumego, MIT) imported via scripts/importTsumego.ts.
//
// Conventions we keep in place for future curated content:
//   - `isCurated !== false` → full AI-coach treatment + hand-authored solutionNote
//   - `isCurated === false` → library-only, coach gated off (prevents hallucination)
//
// Right now every puzzle is `isCurated: false`; `getCuratedPuzzles()` returns [].
// When Frank hand-writes 19×19 problems later, they'll carry `isCurated: true`
// and automatically flow back into the daily rotation + coach.

import type { Puzzle } from "@/types";
import { IMPORTED_PUZZLES } from "@/lib/importedPuzzles";

export const PUZZLES: Puzzle[] = [...IMPORTED_PUZZLES];

export function getPuzzleById(id: string): Puzzle | undefined {
  return PUZZLES.find((p) => p.id === id);
}

/** Puzzles that back the daily rotation and get full AI-coach treatment. */
export function getCuratedPuzzles(): Puzzle[] {
  return PUZZLES.filter((p) => p.isCurated !== false);
}

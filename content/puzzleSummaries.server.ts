import type { PuzzleSummary } from "@/types";

import puzzleIndex from "./data/puzzleIndex.json";

let summaries: PuzzleSummary[] | null = null;

export function getAllSummaries(): PuzzleSummary[] {
  if (!summaries) {
    summaries = puzzleIndex as PuzzleSummary[];
  }
  return summaries;
}

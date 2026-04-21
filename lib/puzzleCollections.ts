import type { PuzzleSummary, PuzzleTag } from "@/types";

export function getAvailableTags(summaries: PuzzleSummary[]): PuzzleTag[] {
  return [...new Set(summaries.map((summary) => summary.tag))].sort();
}

export function getAvailableDifficulties(summaries: PuzzleSummary[]): number[] {
  return [...new Set(summaries.map((summary) => summary.difficulty))].sort((a, b) => a - b);
}

export function isValidPuzzleTag(value: string): value is PuzzleTag {
  return ["life-death", "tesuji", "endgame", "opening"].includes(value);
}

export function isValidPuzzleDifficulty(value: string | number): value is 1 | 2 | 3 | 4 | 5 {
  const numeric = typeof value === "string" ? Number(value) : value;
  return Number.isInteger(numeric) && numeric >= 1 && numeric <= 5;
}

export function filterSummariesByTag(summaries: PuzzleSummary[], tag: PuzzleTag): PuzzleSummary[] {
  return summaries.filter((summary) => summary.tag === tag);
}

export function filterSummariesByDifficulty(
  summaries: PuzzleSummary[],
  difficulty: number,
): PuzzleSummary[] {
  return summaries.filter((summary) => summary.difficulty === difficulty);
}

export function getTagCollectionPath(tag: PuzzleTag): string {
  return `/puzzles/tags/${tag}`;
}

export function getDifficultyCollectionPath(difficulty: number): string {
  return `/puzzles/difficulty/${difficulty}`;
}

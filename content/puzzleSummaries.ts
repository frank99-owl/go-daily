import type { PuzzleSummary } from "@/types";

/**
 * Get all puzzle summaries without importing the full puzzle corpus.
 * Safe for summary-only routes and client code.
 */
export async function getAllSummaries(): Promise<PuzzleSummary[]> {
  if (typeof window === "undefined") {
    const { getAllSummaries: getServerSummaries } = await import("./puzzleSummaries.server");
    return getServerSummaries();
  }

  const index = await import("./data/puzzleIndex.json");
  return (index.default || index) as PuzzleSummary[];
}

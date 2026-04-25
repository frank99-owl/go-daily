import type { Puzzle, PuzzleSummary } from "@/types";

// This file serves as the main entry point for puzzles.
// It will branch between server-side full data and client-side summary data.

/**
 * Get a puzzle by its ID.
 * On the server, this returns the full puzzle.
 * On the client, this should generally be avoided if the full data is needed;
 * the page should fetch the data and pass it as props.
 */
export async function getPuzzle(id: string): Promise<Puzzle | undefined> {
  if (typeof window === "undefined") {
    const { getPuzzleById } = await import("./puzzles.server");
    return getPuzzleById(id);
  }
  // Client-side fallback or error
  console.warn("getPuzzle() called on client. Ensure data is passed via props.");
  return undefined;
}

/**
 * Get all puzzle summaries.
 * Safe to call on both server and client.
 */
export async function getAllSummaries(): Promise<PuzzleSummary[]> {
  if (typeof window === "undefined") {
    const { getAllSummaries: getServerSummaries } = await import("./puzzles.server");
    return getServerSummaries();
  } else {
    // On the client, we'll import the pre-generated index
    const index = await import("./data/puzzleIndex.json");
    return (index.default || index) as PuzzleSummary[];
  }
}

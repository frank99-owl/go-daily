import type { AttemptRecord, Puzzle } from "@/types";
import { getStatusFor } from "./puzzleStatus";

export type RandomPool = "all" | "unattempted" | "wrong";

/**
 * Pick a random puzzle from the pool, filtered by the user's attempt state.
 * Returns `null` only when the filter produces an empty pool (e.g. "wrong"
 * when the user has no mistakes yet) — the caller decides what to do (toast,
 * fallback, etc.).
 */
export function pickRandomPuzzle(
  puzzles: Puzzle[],
  attempts: AttemptRecord[],
  pool: RandomPool = "all",
): Puzzle | null {
  let candidates = puzzles;
  if (pool === "unattempted") {
    candidates = puzzles.filter(
      (p) => getStatusFor(p.id, attempts) === "unattempted",
    );
  } else if (pool === "wrong") {
    candidates = puzzles.filter(
      (p) => getStatusFor(p.id, attempts) === "attempted",
    );
  }
  if (candidates.length === 0) return null;
  const idx = Math.floor(Math.random() * candidates.length);
  return candidates[idx];
}

import type { AttemptRecord, PuzzleStatus } from "@/types";

/**
 * Pure functions over an `AttemptRecord[]` snapshot (typically produced by
 * `loadAttempts()`). Keeping these separate from `lib/storage.ts` means they
 * can be unit-tested without touching `window`.
 */

/** Derive the three-state status for a single puzzle. */
export function getStatusFor(
  puzzleId: string,
  attempts: AttemptRecord[],
): PuzzleStatus {
  let hasAny = false;
  for (const a of attempts) {
    if (a.puzzleId !== puzzleId) continue;
    if (a.correct) return "solved";
    hasAny = true;
  }
  return hasAny ? "attempted" : "unattempted";
}

/** History for one puzzle, newest first, with a convenient tally. */
export function getHistoryFor(
  puzzleId: string,
  attempts: AttemptRecord[],
): { history: AttemptRecord[]; total: number; correct: number; wrong: number } {
  const history = attempts
    .filter((a) => a.puzzleId === puzzleId)
    .sort((a, b) => b.solvedAtMs - a.solvedAtMs);
  const correct = history.filter((a) => a.correct).length;
  return {
    history,
    total: history.length,
    correct,
    wrong: history.length - correct,
  };
}

/** Count puzzles in each status bucket across the full library. */
export function computeStatusTallies(
  puzzleIds: string[],
  attempts: AttemptRecord[],
): { solved: number; attempted: number; unattempted: number } {
  // Single pass over attempts → per-id best-status map, then count.
  const status = new Map<string, "solved" | "attempted">();
  for (const a of attempts) {
    const existing = status.get(a.puzzleId);
    if (existing === "solved") continue;
    status.set(a.puzzleId, a.correct ? "solved" : "attempted");
  }
  let solved = 0;
  let attempted = 0;
  for (const id of puzzleIds) {
    const s = status.get(id);
    if (s === "solved") solved++;
    else if (s === "attempted") attempted++;
  }
  return { solved, attempted, unattempted: puzzleIds.length - solved - attempted };
}

/** Latest attempt ms per puzzle (for "recent" sorting). Missing keys stay undefined. */
export function lastAttemptMsMap(
  attempts: AttemptRecord[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of attempts) {
    const prev = m.get(a.puzzleId) ?? 0;
    if (a.solvedAtMs > prev) m.set(a.puzzleId, a.solvedAtMs);
  }
  return m;
}

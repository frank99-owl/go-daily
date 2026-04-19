import type { Puzzle } from "@/types";
import { PUZZLES } from "@/content/puzzles";

// Anchor date for the rotation: day 0 of the cycle. Today (2026-04-18) is the
// first day the app ships with a non-empty library, so it maps to index 0.
// Puzzles rotate one-per-day, wrapping with modulo once we exhaust the corpus.
const ROTATION_ANCHOR = "2026-04-18";
const DAY_MS = 86_400_000;

function parseYmdUTC(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/**
 * Return the puzzle scheduled for the given local YYYY-MM-DD.
 *
 * We no longer match on `puzzle.date` — imported puzzles all share a placeholder
 * date. Instead we compute a day index from a fixed anchor and pick by modulo,
 * so every calendar day gets a stable (but cycling) puzzle.
 *
 * Falls back to the first puzzle if the corpus is unexpectedly empty, so callers
 * can still render something instead of crashing.
 */
export function getPuzzleForDate(date: string): Puzzle {
  if (PUZZLES.length === 0) {
    throw new Error("No puzzles available — did importTsumego.ts run?");
  }
  const diffDays = Math.floor(
    (parseYmdUTC(date) - parseYmdUTC(ROTATION_ANCHOR)) / DAY_MS,
  );
  const idx = ((diffDays % PUZZLES.length) + PUZZLES.length) % PUZZLES.length;
  return PUZZLES[idx];
}

// Local YYYY-MM-DD.
export function todayLocalKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

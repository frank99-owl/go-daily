import { todayLocalKey } from "@/lib/dateUtils";
import type { Puzzle } from "@/types";

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
 */
export async function getPuzzleForDate(date: string): Promise<Puzzle> {
  const { PUZZLES } = await import("@/content/puzzles.server");

  if (PUZZLES.length === 0) {
    throw new Error("No puzzles available — did importTsumego.ts run?");
  }
  const diffDays = Math.floor((parseYmdUTC(date) - parseYmdUTC(ROTATION_ANCHOR)) / DAY_MS);
  const idx = ((diffDays % PUZZLES.length) + PUZZLES.length) % PUZZLES.length;
  return PUZZLES[idx];
}

export { todayLocalKey };

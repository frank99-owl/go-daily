import type { Puzzle } from "@/types";
import { PUZZLES } from "@/content/puzzles";

// Return the puzzle whose `date` matches today's local YYYY-MM-DD.
// Falls back to the first puzzle if nothing matches (useful pre-launch).
export function getPuzzleForDate(date: string): Puzzle {
  const hit = PUZZLES.find((p) => p.date === date);
  if (hit) return hit;
  return PUZZLES[0];
}

// Local YYYY-MM-DD.
export function todayLocalKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

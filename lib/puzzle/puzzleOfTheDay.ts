import { todayLocalKey } from "@/lib/dateUtils";
import type { Puzzle } from "@/types";

import { getDifficultiesForOnboardingLevel, type OnboardingLevel } from "./onboardingLevels";

// Anchor date for the rotation: day 0 of the cycle. Today (2026-04-18) is the
// first day the app ships with a non-empty library, so it maps to index 0.
// Puzzles rotate one-per-day, wrapping with modulo once we exhaust the corpus.
const ROTATION_ANCHOR = "2026-04-18";
const DAY_MS = 86_400_000;

function parseYmdUTC(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Return the puzzle scheduled for the given local YYYY-MM-DD.
 */
export async function getPuzzleForDate(
  date: string,
  options: { level?: OnboardingLevel; viewerKey?: string } = {},
): Promise<Puzzle> {
  const { PUZZLES } = await import("@/content/puzzles.server");

  if (PUZZLES.length === 0) {
    throw new Error("No puzzles available — did importTsumego.ts run?");
  }

  const pool = options.level
    ? PUZZLES.filter((puzzle) =>
        getDifficultiesForOnboardingLevel(options.level as OnboardingLevel).includes(
          puzzle.difficulty,
        ),
      )
    : PUZZLES;

  if (pool.length === 0) {
    throw new Error(`No puzzles available for daily level "${options.level}".`);
  }

  const diffDays = Math.floor((parseYmdUTC(date) - parseYmdUTC(ROTATION_ANCHOR)) / DAY_MS);
  const viewerOffset =
    options.level || options.viewerKey
      ? stableHash(`${options.level ?? "all"}:${options.viewerKey ?? "global"}`)
      : 0;
  const idx = (((diffDays + viewerOffset) % pool.length) + pool.length) % pool.length;
  return pool[idx];
}

export { todayLocalKey };

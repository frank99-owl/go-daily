import type { AttemptRecord } from "@/types";
import { todayLocalKey } from "./puzzleOfTheDay";

const KEY = "go-daily.attempts";

export function loadAttempts(): AttemptRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AttemptRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Append an attempt record. We intentionally keep every attempt (including
 * repeats for the same puzzleId) so we can show per-puzzle history,
 * AC rate, and an honest per-day heatmap count.
 */
export function saveAttempt(record: AttemptRecord): void {
  if (typeof window === "undefined") return;
  const all = loadAttempts();
  all.push(record);
  window.localStorage.setItem(KEY, JSON.stringify(all));
}

/** Latest attempt for a puzzle (most recent `solvedAtMs`), or null if none. */
export function getAttemptFor(puzzleId: string): AttemptRecord | null {
  const list = loadAttempts().filter((a) => a.puzzleId === puzzleId);
  if (list.length === 0) return null;
  return list.reduce((latest, a) => (a.solvedAtMs > latest.solvedAtMs ? a : latest));
}

/** Full attempt history for a puzzle, newest first. */
export function getAttemptsFor(puzzleId: string): AttemptRecord[] {
  return loadAttempts()
    .filter((a) => a.puzzleId === puzzleId)
    .sort((a, b) => b.solvedAtMs - a.solvedAtMs);
}

// Current streak: consecutive days up to today (inclusive) with at least one
// correct attempt. Breaks on any gap.
export function computeStreak(attempts: AttemptRecord[]): number {
  const correctByDate = new Set(attempts.filter((a) => a.correct).map((a) => a.date));
  let streak = 0;
  const cursor = new Date();
  // Allow today to be empty without breaking the streak — only count if yesterday and earlier line up.
  // But a simple rule: start counting from today; stop when we hit a missing day.
  for (let i = 0; i < 365; i++) {
    const key = todayLocalKey(cursor);
    if (correctByDate.has(key)) {
      streak++;
    } else if (i === 0) {
      // Today not yet solved — check from yesterday.
      cursor.setDate(cursor.getDate() - 1);
      continue;
    } else {
      break;
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function computeAccuracy(attempts: AttemptRecord[]): number {
  if (attempts.length === 0) return 0;
  const correct = attempts.filter((a) => a.correct).length;
  return Math.round((correct / attempts.length) * 100);
}

import { todayLocalKey } from "@/lib/dateUtils";
import type { AttemptRecord, Coord } from "@/types";

import { loadWithIntegrity, migratePlainData, saveWithIntegrity } from "./storageIntegrity";

export const ATTEMPTS_STORAGE_KEY = "go-daily.attempts";

type CreateAttemptRecordInput = {
  puzzleId: string;
  userMove: Coord | null;
  correct: boolean;
  date?: string;
  solvedAtMs?: number;
};

export function loadAttempts(): AttemptRecord[] {
  if (typeof window === "undefined") return [];

  // Try integrity-protected load first
  const protectedData = loadWithIntegrity<AttemptRecord>(ATTEMPTS_STORAGE_KEY);
  if (protectedData !== null) return protectedData;

  // Fall back to plain data (migration path for existing users)
  const plain = migratePlainData<AttemptRecord>(ATTEMPTS_STORAGE_KEY);
  if (plain !== null) {
    // Migrate to new format
    saveWithIntegrity(ATTEMPTS_STORAGE_KEY, plain);
    return plain;
  }

  return [];
}

export function replaceAttempts(records: AttemptRecord[]): void {
  if (typeof window === "undefined") return;
  saveWithIntegrity(ATTEMPTS_STORAGE_KEY, records);
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
  replaceAttempts(all);
}

export function createAttemptRecord({
  puzzleId,
  userMove,
  correct,
  date = todayLocalKey(),
  solvedAtMs = Date.now(),
}: CreateAttemptRecordInput): AttemptRecord {
  return {
    puzzleId,
    date,
    userMove,
    correct,
    solvedAtMs,
  };
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

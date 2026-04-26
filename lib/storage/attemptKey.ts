import type { AttemptRecord } from "@/types";

/**
 * Canonical dedup key for an attempt record. Shared by:
 * - lib/exportData.ts (local backup merge)
 * - lib/syncStorage.ts (localStorage ↔ Supabase merge-on-login)
 * - Any future cross-device reconciliation path.
 *
 * The format mirrors the original exportData.ts implementation so that
 * users who already have backups exported with the old key continue to
 * dedupe correctly during import.
 */
export function attemptKey(a: Pick<AttemptRecord, "puzzleId" | "solvedAtMs">): string {
  return `${a.puzzleId}-${a.solvedAtMs}`;
}

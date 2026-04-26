/**
 * mergeOnLogin — pure planning + application for the anon→authed data hand-off.
 *
 * When an anonymous user logs in, they may already have local attempt history
 * on this device AND existing cloud history from a previous session on another
 * device. We offer them an explicit choice in those cases instead of silently
 * overwriting either side.
 *
 * Decision matrix:
 *   - no local, no remote → nothing to do
 *   - local only          → upload local to cloud (auto, no prompt)
 *   - remote only         → pull remote to local  (auto, no prompt)
 *   - both overlap only   → upload local (deduped by upsert), pull remote (same)
 *   - local-only rows exist AND remote has rows → prompt user
 *
 * This module deals only in pure functions over AttemptRecord arrays so it is
 * fully unit-testable without touching Supabase. The IO layer (`syncStorage`)
 * consumes the plan and performs the actual reads/writes.
 */
import { attemptKey } from "@/lib/storage/attemptKey";
import type { AttemptRecord } from "@/types";

export type MergeDecision =
  /** Keep every unique record from both sides (default safe path). */
  | "merge"
  /** Drop local-only rows; keep only what the cloud has. */
  | "keep-remote"
  /** Drop cloud-only rows; push local and overwrite remote (rare, power-user). */
  | "keep-local";

export interface MergePlan {
  localCount: number;
  remoteCount: number;
  localOnlyCount: number;
  remoteOnlyCount: number;
  overlapCount: number;
  /** True when we need a user decision because both sides have unique rows. */
  requiresUserDecision: boolean;
  /** Recommended default if we need to auto-act without prompting. */
  autoDecision: MergeDecision;
}

export function planMerge(local: AttemptRecord[], remote: AttemptRecord[]): MergePlan {
  const localKeys = new Set(local.map(attemptKey));
  const remoteKeys = new Set(remote.map(attemptKey));

  let overlap = 0;
  for (const key of localKeys) {
    if (remoteKeys.has(key)) overlap += 1;
  }
  const localOnly = localKeys.size - overlap;
  const remoteOnly = remoteKeys.size - overlap;

  // We only ask the user when both sides have diverged — i.e. local has
  // unique rows AND remote has unique rows. Pure subset cases merge cleanly.
  const requiresUserDecision = localOnly > 0 && remoteOnly > 0;

  return {
    localCount: local.length,
    remoteCount: remote.length,
    localOnlyCount: localOnly,
    remoteOnlyCount: remoteOnly,
    overlapCount: overlap,
    requiresUserDecision,
    autoDecision: "merge",
  };
}

export interface MergeResult {
  merged: AttemptRecord[];
  toUpload: AttemptRecord[];
  /** Local rows to discard because the user chose keep-remote. */
  dropped: AttemptRecord[];
}

export function applyMergeDecision(
  local: AttemptRecord[],
  remote: AttemptRecord[],
  decision: MergeDecision,
): MergeResult {
  const localByKey = new Map(local.map((a) => [attemptKey(a), a]));
  const remoteByKey = new Map(remote.map((a) => [attemptKey(a), a]));

  switch (decision) {
    case "merge": {
      const merged = [...remote];
      const toUpload: AttemptRecord[] = [];
      for (const [key, attempt] of localByKey) {
        if (!remoteByKey.has(key)) {
          merged.push(attempt);
          toUpload.push(attempt);
        }
      }
      return { merged, toUpload, dropped: [] };
    }
    case "keep-remote": {
      const dropped: AttemptRecord[] = [];
      for (const [key, attempt] of localByKey) {
        if (!remoteByKey.has(key)) dropped.push(attempt);
      }
      return { merged: [...remote], toUpload: [], dropped };
    }
    case "keep-local": {
      // Keep remote rows that also exist locally (overlap) plus every local
      // row. We do NOT re-upload remote-only rows — we simply drop them from
      // the local view. Actual remote deletion is intentionally out of scope
      // here; "keep-local" only affects what this device displays.
      const merged = [...local];
      const toUpload: AttemptRecord[] = [];
      for (const [key, attempt] of localByKey) {
        if (!remoteByKey.has(key)) toUpload.push(attempt);
      }
      return { merged, toUpload, dropped: [] };
    }
  }
}

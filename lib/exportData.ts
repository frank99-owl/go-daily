/**
 * User data export/import utilities.
 *
 * Allows users to backup and restore their attempt history.
 */

import type { AttemptRecord } from "@/types";

import { attemptKey } from "./attemptKey";
import { loadAttempts, replaceAttempts } from "./storage";

export interface ExportPayload {
  version: number;
  exportedAt: string;
  app: string;
  data: {
    attempts: ReturnType<typeof loadAttempts>;
  };
}

export function exportUserData(): ExportPayload | null {
  if (typeof window === "undefined") return null;

  const attempts = loadAttempts();

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    app: "go-daily",
    data: {
      attempts,
    },
  };
}

export function downloadExport(): void {
  if (typeof window === "undefined") return;

  const payload = exportUserData();
  if (!payload) return;

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `go-daily-backup-${new Date().toISOString().split("T")[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function validateImport(data: unknown): { ok: boolean; error?: string } {
  if (!data || typeof data !== "object") {
    return { ok: false, error: "Invalid data format." };
  }

  const payload = data as Record<string, unknown>;

  if (payload.app !== "go-daily") {
    return { ok: false, error: "Invalid app identifier." };
  }

  if (typeof payload.version !== "number" || payload.version !== 1) {
    return { ok: false, error: "Unsupported backup version." };
  }

  const innerData = payload.data as Record<string, unknown> | undefined;
  if (!innerData || !Array.isArray(innerData.attempts)) {
    return { ok: false, error: "Missing or invalid attempt data." };
  }

  // Validate attempt structure
  for (const attempt of innerData.attempts) {
    if (!isAttemptRecord(attempt)) {
      return { ok: false, error: "Invalid attempt record structure." };
    }
  }

  return { ok: true };
}

export function importUserData(jsonString: string): {
  ok: boolean;
  error?: string;
  count?: number;
  total?: number;
} {
  if (typeof window === "undefined") return { ok: false, error: "Not in browser." };

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    return { ok: false, error: "Invalid JSON." };
  }

  const validation = validateImport(parsed);
  if (!validation.ok) {
    return validation;
  }

  const payload = parsed as ExportPayload;
  const attempts = payload.data.attempts;

  try {
    // Merge with existing data (deduplicate by shared attemptKey)
    const existing = loadAttempts();
    const seen = new Set(existing.map(attemptKey));
    const newAttempts = attempts.filter((a) => !seen.has(attemptKey(a)));

    const merged = [...existing, ...newAttempts];
    replaceAttempts(merged);

    return { ok: true, count: newAttempts.length, total: merged.length };
  } catch {
    return { ok: false, error: "Failed to save imported data." };
  }
}

function isCoord(value: unknown): boolean {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as Record<string, unknown>).x === "number" &&
    Number.isInteger((value as Record<string, unknown>).x) &&
    typeof (value as Record<string, unknown>).y === "number" &&
    Number.isInteger((value as Record<string, unknown>).y)
  );
}

function isAttemptRecord(value: unknown): value is AttemptRecord {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as Record<string, unknown>).puzzleId === "string" &&
    typeof (value as Record<string, unknown>).date === "string" &&
    ((value as Record<string, unknown>).userMove === null ||
      isCoord((value as Record<string, unknown>).userMove)) &&
    typeof (value as Record<string, unknown>).correct === "boolean" &&
    typeof (value as Record<string, unknown>).solvedAtMs === "number"
  );
}

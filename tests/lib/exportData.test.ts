import { beforeEach, describe, expect, it } from "vitest";

import { exportUserData, importUserData, validateImport } from "@/lib/exportData";
import { ATTEMPTS_STORAGE_KEY, loadAttempts, replaceAttempts } from "@/lib/storage";
import { getRecoveryKey } from "@/lib/storageIntegrity";

function createStorage() {
  return {
    store: {} as Record<string, string>,
    getItem(key: string) {
      return this.store[key] ?? null;
    },
    setItem(key: string, value: string) {
      this.store[key] = value;
    },
    removeItem(key: string) {
      delete this.store[key];
    },
    clear() {
      this.store = {};
    },
    get length() {
      return Object.keys(this.store).length;
    },
    key(index: number) {
      return Object.keys(this.store)[index] ?? null;
    },
  };
}

describe("exportData", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      value: createStorage(),
      writable: true,
    });
  });

  it("exports the current attempt history", () => {
    replaceAttempts([
      {
        puzzleId: "cld-001",
        date: "2026-04-21",
        userMove: { x: 18, y: 0 },
        correct: true,
        solvedAtMs: 123,
      },
    ]);

    const payload = exportUserData();
    expect(payload).toMatchObject({
      version: 1,
      app: "go-daily",
      data: {
        attempts: [
          expect.objectContaining({
            puzzleId: "cld-001",
          }),
        ],
      },
    });
  });

  describe("validateImport", () => {
    it("accepts valid payload", () => {
      const payload = {
        version: 1,
        app: "go-daily",
        exportedAt: "2026-04-21",
        data: {
          attempts: [
            {
              puzzleId: "test",
              date: "2026-04-21",
              userMove: null,
              correct: true,
              solvedAtMs: 12345,
            },
          ],
        },
      };
      const result = validateImport(payload);
      expect(result.ok).toBe(true);
    });

    it("rejects invalid app", () => {
      const result = validateImport({
        version: 1,
        app: "other-app",
        data: { attempts: [] },
      });
      expect(result.ok).toBe(false);
    });

    it("rejects wrong version", () => {
      const result = validateImport({
        version: 2,
        app: "go-daily",
        data: { attempts: [] },
      });
      expect(result.ok).toBe(false);
    });

    it("rejects missing data", () => {
      const result = validateImport({
        version: 1,
        app: "go-daily",
      });
      expect(result.ok).toBe(false);
    });

    it("rejects invalid attempt records", () => {
      const result = validateImport({
        version: 1,
        app: "go-daily",
        data: {
          attempts: [{ invalid: true }],
        },
      });
      expect(result.ok).toBe(false);
    });
  });

  it("imports records, deduplicates them, and writes integrity-wrapped storage", () => {
    replaceAttempts([
      {
        puzzleId: "cld-001",
        date: "2026-04-21",
        userMove: { x: 18, y: 0 },
        correct: true,
        solvedAtMs: 123,
      },
    ]);

    const result = importUserData(
      JSON.stringify({
        version: 1,
        app: "go-daily",
        exportedAt: "2026-04-21T00:00:00.000Z",
        data: {
          attempts: [
            {
              puzzleId: "cld-001",
              date: "2026-04-21",
              userMove: { x: 18, y: 0 },
              correct: true,
              solvedAtMs: 123,
            },
            {
              puzzleId: "cld-002",
              date: "2026-04-22",
              userMove: { x: 17, y: 0 },
              correct: false,
              solvedAtMs: 456,
            },
          ],
        },
      }),
    );

    expect(result).toEqual({ ok: true, count: 1, total: 2 });
    expect(loadAttempts()).toHaveLength(2);
    expect(window.localStorage.getItem(ATTEMPTS_STORAGE_KEY)).toContain('"checksum"');
    expect(window.localStorage.getItem(getRecoveryKey(ATTEMPTS_STORAGE_KEY))).toBeNull();
  });

  it("rejects invalid JSON during import", () => {
    expect(importUserData("{")).toEqual({ ok: false, error: "Invalid JSON." });
  });
});

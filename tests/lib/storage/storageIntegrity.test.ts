import { beforeEach, describe, expect, it } from "vitest";

import {
  getRecoveryKey,
  loadWithIntegrity,
  migratePlainData,
  saveWithIntegrity,
} from "@/lib/storage/storageIntegrity";

function createStorage(): Storage {
  let store: Record<string, string> = {};

  return {
    getItem(key: string) {
      return store[key] ?? null;
    },
    setItem(key: string, value: string) {
      store[key] = value;
    },
    removeItem(key: string) {
      delete store[key];
    },
    clear() {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key(index: number) {
      return Object.keys(store)[index] ?? null;
    },
  };
}

describe("storageIntegrity", () => {
  const KEY = "test.storage";

  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      value: createStorage(),
      writable: true,
    });
  });

  describe("saveWithIntegrity / loadWithIntegrity", () => {
    it("round-trips data correctly", () => {
      const data = [{ id: "1" }, { id: "2" }];
      saveWithIntegrity(KEY, data);
      const loaded = loadWithIntegrity(KEY);
      expect(loaded).toEqual(data);
    });

    it("returns null for missing data", () => {
      const loaded = loadWithIntegrity(KEY);
      expect(loaded).toBeNull();
    });

    it("returns null when checksum is tampered", () => {
      const data = [{ id: "1" }];
      saveWithIntegrity(KEY, data);

      // Tamper with the stored data
      const stored = JSON.parse(localStorage.getItem(KEY)!);
      stored.data[0].id = "tampered";
      localStorage.setItem(KEY, JSON.stringify(stored));

      const loaded = loadWithIntegrity(KEY);
      expect(loaded).toBeNull();
      expect(localStorage.getItem(KEY)).toBeNull();
      expect(localStorage.getItem(getRecoveryKey(KEY))).toContain("checksum-mismatch");
    });

    it("returns null for corrupt JSON", () => {
      localStorage.setItem(KEY, "not-json");
      const loaded = loadWithIntegrity(KEY);
      expect(loaded).toBeNull();
      expect(localStorage.getItem(KEY)).toBeNull();
      expect(localStorage.getItem(getRecoveryKey(KEY))).toContain("invalid-json");
    });

    it("returns null for non-array data", () => {
      localStorage.setItem(KEY, JSON.stringify({ v: 1, data: "not-array", checksum: "x" }));
      const loaded = loadWithIntegrity(KEY);
      expect(loaded).toBeNull();
      expect(localStorage.getItem(KEY)).toBeNull();
      expect(localStorage.getItem(getRecoveryKey(KEY))).toContain("invalid-structure");
    });

    it("handles empty arrays", () => {
      saveWithIntegrity(KEY, []);
      const loaded = loadWithIntegrity(KEY);
      expect(loaded).toEqual([]);
    });
  });

  describe("migratePlainData", () => {
    it("migrates plain array data", () => {
      const data = [{ id: "1" }, { id: "2" }];
      localStorage.setItem(KEY, JSON.stringify(data));

      const migrated = migratePlainData(KEY);
      expect(migrated).toEqual(data);
    });

    it("returns null for already-migrated data", () => {
      const data = [{ id: "1" }];
      saveWithIntegrity(KEY, data);
      const migrated = migratePlainData(KEY);
      expect(migrated).toBeNull();
    });

    it("returns null for missing data", () => {
      const migrated = migratePlainData(KEY);
      expect(migrated).toBeNull();
    });

    it("quarantines invalid legacy payloads", () => {
      localStorage.setItem(KEY, JSON.stringify({ unexpected: true }));

      const migrated = migratePlainData(KEY);
      expect(migrated).toBeNull();
      expect(localStorage.getItem(KEY)).toBeNull();
      expect(localStorage.getItem(getRecoveryKey(KEY))).toContain("legacy-non-array");
    });
  });
});

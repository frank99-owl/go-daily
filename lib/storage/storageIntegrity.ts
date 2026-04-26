/**
 * localStorage integrity utilities.
 *
 * This is corruption detection and recovery, not cryptographic protection.
 * When malformed or mismatched payloads are found we move the raw value aside,
 * clear the main key, and let the app recover with a clean state.
 */

const INTEGRITY_KEY = "go-daily.integrity";
const RECOVERY_SUFFIX = ".recovered";

type IntegrityPayload<T> = {
  v: number;
  data: T[];
  checksum: string;
  savedAt: number;
};

function simpleHash(data: string): string {
  let h = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    h = (h << 5) - h + char;
    h |= 0;
  }
  return h.toString(36);
}

function computeChecksum(records: unknown[]): string {
  const serialized = JSON.stringify(records);
  return simpleHash(serialized + INTEGRITY_KEY);
}

export function getRecoveryKey(key: string): string {
  return `${key}${RECOVERY_SUFFIX}`;
}

function quarantineCorruptPayload(key: string, raw: string, reason: string): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      getRecoveryKey(key),
      JSON.stringify({
        reason,
        recoveredAt: Date.now(),
        raw,
      }),
    );
  } catch {
    // Best-effort diagnostics only.
  }

  try {
    window.localStorage.removeItem(key);
  } catch {
    // Best-effort cleanup only.
  }

  console.warn(`[storage] Recovered corrupt payload for ${key}: ${reason}`);
}

export function saveWithIntegrity<T>(key: string, records: T[]): void {
  if (typeof window === "undefined") return;

  const payload: IntegrityPayload<T> = {
    v: 1,
    data: records,
    checksum: computeChecksum(records),
    savedAt: Date.now(),
  };

  try {
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch (error) {
    console.error("[storage] Failed to save integrity-wrapped payload:", error);
  }
}

export function loadWithIntegrity<T>(key: string): T[] | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(key);
  if (!raw) return null;

  let parsed: IntegrityPayload<T>;
  try {
    parsed = JSON.parse(raw) as IntegrityPayload<T>;
  } catch {
    quarantineCorruptPayload(key, raw, "invalid-json");
    return null;
  }

  if (parsed.v !== 1 || !Array.isArray(parsed.data) || typeof parsed.checksum !== "string") {
    quarantineCorruptPayload(key, raw, "invalid-structure");
    return null;
  }

  if (parsed.checksum !== computeChecksum(parsed.data)) {
    quarantineCorruptPayload(key, raw, "checksum-mismatch");
    return null;
  }

  return parsed.data;
}

/** Reads legacy plain-array data so callers can migrate it into the wrapped format. */
export function migratePlainData<T>(key: string): T[] | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(key);
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    quarantineCorruptPayload(key, raw, "invalid-json");
    return null;
  }

  if (
    parsed &&
    typeof parsed === "object" &&
    "v" in parsed &&
    "data" in parsed &&
    Array.isArray((parsed as { data?: unknown }).data)
  ) {
    return null;
  }

  if (Array.isArray(parsed)) {
    return parsed as T[];
  }

  quarantineCorruptPayload(key, raw, "legacy-non-array");
  return null;
}

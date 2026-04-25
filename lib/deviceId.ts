/**
 * Device identity — stable per-browser UUID + best-effort friendly label.
 *
 * The device id is generated once per browser and persisted to localStorage.
 * We treat "device" loosely: incognito windows, different browsers on the
 * same machine, and cleared storage all produce fresh IDs. That matches the
 * Free-plan single-device intent — we are gating "places I use the product"
 * rather than physical hardware.
 */
export const DEVICE_ID_STORAGE_KEY = "go-daily.device-id";

let memoryDeviceId: string | null = null;

export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") {
    throw new Error("getOrCreateDeviceId() must run in the browser");
  }

  try {
    const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing && existing.length > 0) return existing;
  } catch {
    // Some privacy modes block localStorage. Fall back to a tab-local id so
    // login/device flows can continue instead of crashing the app shell.
    if (memoryDeviceId) return memoryDeviceId;
  }

  const fresh = generateUuid();
  try {
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, fresh);
  } catch {
    memoryDeviceId = fresh;
  }
  return fresh;
}

export function resetDeviceId(): string {
  if (typeof window === "undefined") return "";
  const fresh = generateUuid();
  memoryDeviceId = fresh;
  try {
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, fresh);
  } catch {
    // Keep the in-memory fallback assigned above.
  }
  return fresh;
}

function generateUuid(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  // RFC 4122 v4 fallback — sufficient for anonymous client identifiers.
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

/**
 * Short human-readable label for the Settings → Devices table. Parses a
 * user-agent string into e.g. "Chrome on macOS" or "Safari on iPhone". Falls
 * back to the raw UA if we can't confidently recognise the browser + OS.
 */
export function describeUserAgent(ua: string): string {
  if (!ua) return "Unknown device";

  const browser = (() => {
    if (/Edg\//.test(ua)) return "Edge";
    if (/OPR\//.test(ua)) return "Opera";
    if (/Firefox\//.test(ua)) return "Firefox";
    if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) return "Chrome";
    if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return "Safari";
    return null;
  })();

  const os = (() => {
    if (/iPhone|iPad|iPod/.test(ua)) return /iPad/.test(ua) ? "iPad" : "iPhone";
    if (/Android/.test(ua)) return "Android";
    if (/Mac OS X|Macintosh/.test(ua)) return "macOS";
    if (/Windows NT/.test(ua)) return "Windows";
    if (/Linux/.test(ua)) return "Linux";
    return null;
  })();

  if (browser && os) return `${browser} on ${os}`;
  if (browser) return browser;
  if (os) return os;
  return ua.length > 60 ? `${ua.slice(0, 60)}…` : ua;
}

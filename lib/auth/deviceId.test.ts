import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEVICE_ID_STORAGE_KEY,
  describeUserAgent,
  getOrCreateDeviceId,
  resetDeviceId,
} from "./deviceId";

function installLocalStorageShim() {
  const store = new Map<string, string>();
  const shim = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  };
  Object.defineProperty(window, "localStorage", { value: shim, writable: true });
  return store;
}

describe("deviceId", () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = installLocalStorageShim();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("generates a v4-shaped UUID on first call and persists it", () => {
    const id = getOrCreateDeviceId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(store.get(DEVICE_ID_STORAGE_KEY)).toBe(id);
  });

  it("returns the existing id on subsequent calls", () => {
    store.set(DEVICE_ID_STORAGE_KEY, "pre-existing-id");
    expect(getOrCreateDeviceId()).toBe("pre-existing-id");
  });

  it("resetDeviceId replaces the stored id with a new uuid", () => {
    const first = getOrCreateDeviceId();
    const second = resetDeviceId();
    expect(second).not.toBe(first);
    expect(store.get(DEVICE_ID_STORAGE_KEY)).toBe(second);
  });

  it("falls back to an in-memory id when localStorage is blocked", () => {
    Object.defineProperty(window, "localStorage", {
      value: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
      writable: true,
    });

    const first = getOrCreateDeviceId();
    const second = getOrCreateDeviceId();

    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(second).toBe(first);
  });
});

describe("describeUserAgent", () => {
  it.each([
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Chrome on macOS",
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      "Safari on iPhone",
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
      "Edge on Windows",
    ],
    [
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Firefox/120.0",
      "Firefox on Linux",
    ],
  ])("labels %s as %s", (ua, expected) => {
    expect(describeUserAgent(ua)).toBe(expected);
  });

  it("falls back to Unknown device for empty UA", () => {
    expect(describeUserAgent("")).toBe("Unknown device");
  });
});

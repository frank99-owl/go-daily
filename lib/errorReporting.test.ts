// errorReporting has module-level singletons (handlersInitialized,
// flushInFlight). Each test uses vi.resetModules() + dynamic import so state
// doesn't leak between cases.
//
// NOTE: tests/setup.ts stubs window.localStorage with no-op vi.fn() calls, so
// we install a real in-memory backing store here before each test.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENDPOINT = "/api/report-error";
const BUFFER_KEY = "go-daily.errorBuffer";

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) ?? null) : null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

async function importFresh() {
  vi.resetModules();
  return await import("./errorReporting");
}

function seedBuffer(entries: unknown[]): void {
  window.localStorage.setItem(BUFFER_KEY, JSON.stringify(entries));
}

function readBuffer(): unknown[] {
  const raw = window.localStorage.getItem(BUFFER_KEY);
  return raw ? (JSON.parse(raw) as unknown[]) : [];
}

beforeEach(() => {
  Object.defineProperty(window, "localStorage", {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  Object.defineProperty(document.documentElement, "lang", { value: "en", configurable: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("reportError — normalization", () => {
  it("trims long message and stack to the configured maximums", async () => {
    const { reportError } = await importFresh();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));

    const longMessage = "x".repeat(2000);
    const longStack = "s".repeat(10_000);
    const err = new Error(longMessage);
    err.stack = longStack;

    reportError(err);

    const buf = readBuffer() as Array<{ message: string; stack?: string }>;
    expect(buf).toHaveLength(1);
    expect(buf[0].message.length).toBe(500);
    expect(buf[0].stack?.length).toBe(4000);
  });

  it("falls back to 'Unknown client error' when message is empty", async () => {
    const { reportError } = await importFresh();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));

    reportError(new Error(""));
    const buf = readBuffer() as Array<{ message: string }>;
    expect(buf[0].message).toBe("Unknown client error");
  });

  it("captures url, userAgent, locale, and puzzleId context", async () => {
    const { reportError } = await importFresh();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));

    reportError(new Error("boom"), { puzzleId: "cld-001" });

    const buf = readBuffer() as Array<{
      url: string;
      userAgent: string;
      locale?: string;
      puzzleId?: string;
    }>;
    expect(buf[0].url).toMatch(/^http/);
    expect(buf[0].userAgent).toBeTypeOf("string");
    expect(buf[0].locale).toBe("en");
    expect(buf[0].puzzleId).toBe("cld-001");
  });

  it("trims an over-long puzzleId to its max length", async () => {
    const { reportError } = await importFresh();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));

    reportError(new Error("boom"), { puzzleId: "p".repeat(500) });
    const buf = readBuffer() as Array<{ puzzleId?: string }>;
    expect(buf[0].puzzleId?.length).toBe(120);
  });
});

describe("reportError — buffering", () => {
  it("appends the new report to the existing buffer", async () => {
    const { reportError } = await importFresh();
    // Fail fetch so entries stay in the buffer for inspection.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    reportError(new Error("first"));
    reportError(new Error("second"));
    reportError(new Error("third"));

    const buf = readBuffer() as Array<{ message: string }>;
    expect(buf.map((r) => r.message)).toEqual(["first", "second", "third"]);
  });

  it("caps the persisted buffer at 25 entries (keeps most recent)", async () => {
    const { reportError } = await importFresh();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    for (let i = 0; i < 30; i++) {
      reportError(new Error(`err-${i}`));
    }

    const buf = readBuffer() as Array<{ message: string }>;
    expect(buf.length).toBeLessThanOrEqual(25);
    expect(buf.at(-1)?.message).toBe("err-29");
    expect(buf[0]?.message).not.toBe("err-0");
  });

  it("recovers gracefully when localStorage contains malformed JSON", async () => {
    window.localStorage.setItem(BUFFER_KEY, "{not valid json");
    const { reportError } = await importFresh();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    expect(() => reportError(new Error("boom"))).not.toThrow();
    const buf = readBuffer() as Array<{ message: string }>;
    expect(buf).toHaveLength(1);
    expect(buf[0].message).toBe("boom");
  });

  it("recovers when the persisted value is a non-array JSON value", async () => {
    window.localStorage.setItem(BUFFER_KEY, JSON.stringify({ oops: true }));
    const { reportError } = await importFresh();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    reportError(new Error("boom"));
    const buf = readBuffer() as Array<{ message: string }>;
    expect(buf).toHaveLength(1);
  });
});

describe("flushBufferedErrors — upload behavior", () => {
  it("POSTs each buffered report to /api/report-error and clears delivered ones", async () => {
    const { flushBufferedErrors } = await importFresh();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    seedBuffer([
      { message: "a", url: "http://x", timestamp: 1, userAgent: "ua" },
      { message: "b", url: "http://x", timestamp: 2, userAgent: "ua" },
    ]);

    await flushBufferedErrors();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(ENDPOINT);
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.keepalive).toBe(true);
    expect(readBuffer()).toHaveLength(0);
  });

  it("keeps failed reports in the buffer, removes delivered ones", async () => {
    const { flushBufferedErrors } = await importFresh();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockRejectedValueOnce(new Error("net"));
    vi.stubGlobal("fetch", fetchMock);

    seedBuffer([
      { message: "ok", url: "http://x", timestamp: 1, userAgent: "ua" },
      { message: "bad-status", url: "http://x", timestamp: 2, userAgent: "ua" },
      { message: "thrown", url: "http://x", timestamp: 3, userAgent: "ua" },
    ]);

    await flushBufferedErrors();

    const remaining = readBuffer() as Array<{ message: string }>;
    expect(remaining.map((r) => r.message).sort()).toEqual(["bad-status", "thrown"]);
  });

  it("does not attempt fetch when the browser is offline", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    const { flushBufferedErrors } = await importFresh();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    seedBuffer([{ message: "a", url: "http://x", timestamp: 1, userAgent: "ua" }]);
    await flushBufferedErrors();

    expect(fetchMock).not.toHaveBeenCalled();
    // Undelivered reports are preserved.
    expect(readBuffer()).toHaveLength(1);
  });

  it("is a no-op when the buffer is empty", async () => {
    const { flushBufferedErrors } = await importFresh();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await flushBufferedErrors();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("coalesces concurrent flush calls into a single in-flight operation", async () => {
    const { flushBufferedErrors } = await importFresh();
    let resolveFetch: ((v: Response) => void) | null = null;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    seedBuffer([{ message: "a", url: "http://x", timestamp: 1, userAgent: "ua" }]);

    const p1 = flushBufferedErrors();
    const p2 = flushBufferedErrors();
    const p3 = flushBufferedErrors();

    // Give microtasks a few turns to propagate through the inner async IIFE
    // before the fetch promise is pending.
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFetch!(new Response(null, { status: 200 }));
    await Promise.all([p1, p2, p3]);

    expect(readBuffer()).toHaveLength(0);
  });
});

describe("initGlobalErrorHandlers", () => {
  it("registers error + unhandledrejection + online listeners once", async () => {
    const { initGlobalErrorHandlers } = await importFresh();
    const addSpy = vi.spyOn(window, "addEventListener");

    initGlobalErrorHandlers();
    const firstCount = addSpy.mock.calls.filter(([t]) =>
      ["error", "unhandledrejection", "online"].includes(t as string),
    ).length;
    expect(firstCount).toBe(3);

    // Second call is a no-op (handlersInitialized guard)
    initGlobalErrorHandlers();
    const secondCount = addSpy.mock.calls.filter(([t]) =>
      ["error", "unhandledrejection", "online"].includes(t as string),
    ).length;
    expect(secondCount).toBe(3);
  });

  it("captures window.error events and buffers them", async () => {
    const { initGlobalErrorHandlers } = await importFresh();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    initGlobalErrorHandlers();
    window.dispatchEvent(new ErrorEvent("error", { error: new Error("global boom") }));

    const buf = readBuffer() as Array<{ message: string }>;
    expect(buf.at(-1)?.message).toBe("global boom");
  });

  it("wraps non-Error values in the error event into a real Error", async () => {
    const { initGlobalErrorHandlers } = await importFresh();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    initGlobalErrorHandlers();
    window.dispatchEvent(new ErrorEvent("error", { error: "raw string crash" }));

    const buf = readBuffer() as Array<{ message: string }>;
    expect(buf.at(-1)?.message).toBe("raw string crash");
  });

  it("captures unhandledrejection events", async () => {
    const { initGlobalErrorHandlers } = await importFresh();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    initGlobalErrorHandlers();
    // PromiseRejectionEvent isn't constructible in jsdom — dispatch a plain
    // Event with a shimmed `reason` instead.
    const event = new Event("unhandledrejection");
    Object.defineProperty(event, "reason", { value: new Error("rejected!") });
    window.dispatchEvent(event);

    const buf = readBuffer() as Array<{ message: string }>;
    expect(buf.at(-1)?.message).toBe("rejected!");
  });
});

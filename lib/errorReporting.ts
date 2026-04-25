/**
 * Client-side error buffering and upload.
 *
 * Reports are buffered locally first, then flushed to the internal
 * `/api/report-error` endpoint when possible.
 */

const ERROR_BUFFER_KEY = "go-daily.errorBuffer";
const ERROR_REPORT_ENDPOINT = "/api/report-error";
const MAX_BUFFER_SIZE = 25;
const MAX_MESSAGE_LENGTH = 500;
const MAX_STACK_LENGTH = 4_000;
const MAX_URL_LENGTH = 2_000;
const MAX_USER_AGENT_LENGTH = 500;
const MAX_PUZZLE_ID_LENGTH = 120;

let handlersInitialized = false;
let flushInFlight: Promise<void> | null = null;

export interface ErrorReport {
  message: string;
  stack?: string;
  url: string;
  timestamp: number;
  userAgent: string;
  locale?: string;
  puzzleId?: string;
}

function reportKey(report: ErrorReport): string {
  return `${report.timestamp}:${report.url}:${report.message}`;
}

function trimString(value: string | undefined, maxLength: number): string | undefined {
  if (!value) return undefined;
  return value.slice(0, maxLength);
}

function normalizeReport(report: ErrorReport): ErrorReport {
  return {
    message: trimString(report.message, MAX_MESSAGE_LENGTH) ?? "Unknown client error",
    stack: trimString(report.stack, MAX_STACK_LENGTH),
    url: trimString(report.url, MAX_URL_LENGTH) ?? window.location.href,
    timestamp: report.timestamp,
    userAgent: trimString(report.userAgent, MAX_USER_AGENT_LENGTH) ?? "unknown",
    locale: trimString(report.locale, 16),
    puzzleId: trimString(report.puzzleId, MAX_PUZZLE_ID_LENGTH),
  };
}

function loadErrorBuffer(): ErrorReport[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(ERROR_BUFFER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ErrorReport[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveErrorBuffer(buffer: ErrorReport[]): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(ERROR_BUFFER_KEY, JSON.stringify(buffer.slice(-MAX_BUFFER_SIZE)));
  } catch {
    // Error buffering is best-effort only.
  }
}

async function sendErrorReport(report: ErrorReport): Promise<boolean> {
  if (typeof window !== "undefined" && navigator.onLine === false) {
    return false;
  }

  try {
    const response = await fetch(ERROR_REPORT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report),
      keepalive: true,
    });

    return response.ok;
  } catch {
    return false;
  }
}

export function reportError(error: Error, context?: { puzzleId?: string }): void {
  if (typeof window === "undefined") return;

  const report = normalizeReport({
    message: error.message,
    stack: error.stack,
    url: window.location.href,
    timestamp: Date.now(),
    userAgent: navigator.userAgent,
    locale: document.documentElement.lang,
    puzzleId: context?.puzzleId,
  });

  const buffer = loadErrorBuffer();
  buffer.push(report);
  saveErrorBuffer(buffer);

  if (process.env.NODE_ENV === "development") {
    console.error("[client-error]", report);
  }

  void flushBufferedErrors();
}

export async function flushBufferedErrors(): Promise<void> {
  if (typeof window === "undefined") return;

  if (flushInFlight) {
    await flushInFlight;
    return;
  }

  flushInFlight = (async () => {
    const buffered = loadErrorBuffer();
    if (buffered.length === 0) return;

    const failedKeys = new Set<string>();
    const processedKeys = new Set<string>();
    for (const report of buffered) {
      const key = reportKey(report);
      processedKeys.add(key);
      const delivered = await sendErrorReport(report);
      if (!delivered) {
        failedKeys.add(key);
      }
    }

    const latestBuffer = loadErrorBuffer();
    const remaining = latestBuffer.filter((report) => {
      const key = reportKey(report);
      if (!processedKeys.has(key)) {
        return true;
      }

      return failedKeys.has(key);
    });

    saveErrorBuffer(remaining);
  })().finally(() => {
    flushInFlight = null;
  });

  await flushInFlight;
}

/**
 * Global error handler — call this once at app initialization.
 */
export function initGlobalErrorHandlers(): void {
  if (typeof window === "undefined" || handlersInitialized) return;

  handlersInitialized = true;

  window.addEventListener("error", (event) => {
    reportError(event.error instanceof Error ? event.error : new Error(String(event.error)));
  });

  window.addEventListener("unhandledrejection", (event) => {
    const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    reportError(error);
  });

  window.addEventListener("online", () => {
    void flushBufferedErrors();
  });

  void flushBufferedErrors();
}

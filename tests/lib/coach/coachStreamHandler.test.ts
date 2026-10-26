// @vitest-environment node
/**
 * The coach SSE stream must not close before its analytics event is sent.
 *
 * Until 2026-10 the event was fired after `controller.close()`. Once the
 * response ended the serverless function could be frozen with the capture
 * still in flight, and 2 of 15 completed coach calls never reached PostHog.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captureServerEvent: vi.fn(),
  refundUsage: vi.fn(async () => {}),
  replyStream: vi.fn(),
}));

vi.mock("@/lib/posthog/server", () => ({ captureServerEvent: mocks.captureServerEvent }));
vi.mock("@/lib/coach/coachRouteHelpers", () => ({
  classifySseError: () => "upstream_error",
  refundUsage: mocks.refundUsage,
  getCoachModelInfo: () => ({ model: "test-model", provider: "test" }),
}));
vi.mock("@/lib/coach/coachProvider", () => ({
  createManagedCoachProvider: () => ({ createReplyStream: mocks.replyStream }),
}));

import { ANALYTICS_FLUSH_BUDGET_MS } from "@/lib/coach/coachAnalytics";
import { createCoachSseStream, type StreamContext } from "@/lib/coach/coachStreamHandler";

const ctx: StreamContext = {
  apiKey: "test",
  upstreamTimeoutMs: 1000,
  openaiMessages: [{ role: "user", content: "hi" }],
  locale: "en",
  personaId: "still-water",
  plan: "free",
  distinctId: "user-1",
  isGuest: false,
  refundParams: { guestDeviceId: "", countryCode: null, userId: "user-1", usageDay: "2026-10-26" },
  updatedUsage: { dailyUsed: 1 },
};

async function* reply() {
  yield { delta: "Take the vital point.", usage: null, model: "test-model", done: false };
  yield {
    delta: "",
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, usageAvailable: true },
    model: "test-model",
    done: true,
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

/** Reads until the `done` or `error` SSE event, returning what was received. */
async function readUntilTerminalEvent(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const decoder = new TextDecoder();
  let text = "";
  while (!/"done":true|"error":/.test(text)) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value);
  }
  return text;
}

/** Resolves to "closed" if the stream ends within `ms`, otherwise "open". */
async function closedWithin(reader: ReadableStreamDefaultReader<Uint8Array>, ms: number) {
  return Promise.race([
    reader.read().then(({ done }) => (done ? "closed" : "data")),
    new Promise<string>((resolve) => setTimeout(() => resolve("open"), ms)),
  ]);
}

describe("createCoachSseStream analytics", () => {
  beforeEach(() => {
    mocks.captureServerEvent.mockReset();
    mocks.refundUsage.mockClear();
    mocks.replyStream.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("delivers done, then keeps the stream open until the completed event is sent", async () => {
    const capture = deferred();
    mocks.captureServerEvent.mockReturnValue(capture.promise);
    mocks.replyStream.mockImplementation(reply);

    const reader = createCoachSseStream(ctx).getReader();
    const received = await readUntilTerminalEvent(reader);

    expect(received).toContain("Take the vital point.");
    expect(received).toContain('"done":true');
    expect(mocks.captureServerEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "coach_request_completed", distinctId: "user-1" }),
    );
    expect(await closedWithin(reader, 50)).toBe("open");

    capture.resolve();
    expect(await closedWithin(reader, 50)).toBe("closed");
  });

  it("closes after the flush budget even if PostHog never answers", async () => {
    vi.useFakeTimers();
    mocks.captureServerEvent.mockReturnValue(new Promise(() => {}));
    mocks.replyStream.mockImplementation(reply);

    const reader = createCoachSseStream(ctx).getReader();
    await readUntilTerminalEvent(reader);
    const next = reader.read();

    await vi.advanceTimersByTimeAsync(ANALYTICS_FLUSH_BUDGET_MS - 1);
    let settled = false;
    void next.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect((await next).done).toBe(true);
  });

  it("refunds an undelivered call and sends the failed event before closing", async () => {
    const capture = deferred();
    mocks.captureServerEvent.mockReturnValue(capture.promise);
    mocks.replyStream.mockImplementation(async function* () {
      throw new Error("upstream down");
    });

    const reader = createCoachSseStream(ctx).getReader();
    const received = await readUntilTerminalEvent(reader);

    expect(received).toContain('"error":"upstream_error"');
    expect(mocks.refundUsage).toHaveBeenCalledOnce();
    expect(mocks.captureServerEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "coach_request_failed" }),
    );
    expect(await closedWithin(reader, 50)).toBe("open");

    capture.resolve();
    expect(await closedWithin(reader, 50)).toBe("closed");
  });
});

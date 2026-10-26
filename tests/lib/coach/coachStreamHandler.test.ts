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
import {
  buildSseResponse,
  createCoachSseStream,
  trimHistory,
  type StreamContext,
} from "@/lib/coach/coachStreamHandler";

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

/** Reads the whole stream and returns the concatenated `delta` text. */
async function replyText(stream: ReadableStream<Uint8Array>) {
  const text = await new Response(stream).text();
  return text
    .split("\n\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice("data: ".length)))
    .map((event: { delta?: string }) => event.delta ?? "")
    .join("");
}

function chunks(...deltas: string[]) {
  return async function* () {
    for (const delta of deltas) yield { delta, usage: null, model: null, done: false };
    yield { delta: "", usage: null, model: null, done: true };
  };
}

describe("createCoachSseStream reply text", () => {
  beforeEach(() => {
    mocks.captureServerEvent.mockReset();
    mocks.captureServerEvent.mockResolvedValue(undefined);
    mocks.replyStream.mockReset();
  });

  it("drops a role label the model put at the start of its reply", async () => {
    mocks.replyStream.mockImplementation(chunks("SYSTEM :  Take", " the vital point."));
    expect(await replyText(createCoachSseStream(ctx))).toBe("Take the vital point.");
  });

  it("drops a role label written with a full-width colon", async () => {
    mocks.replyStream.mockImplementation(chunks("System：先看要点。"));
    expect(await replyText(createCoachSseStream(ctx))).toBe("先看要点。");
  });

  it("leaves the label alone anywhere but the start of the first chunk", async () => {
    mocks.replyStream.mockImplementation(
      chunks("Note the ", "system: of shape", " — system: again"),
    );
    expect(await replyText(createCoachSseStream(ctx))).toBe(
      "Note the system: of shape — system: again",
    );
  });

  it("does not treat a word that merely starts like the label as one", async () => {
    mocks.replyStream.mockImplementation(chunks("Systematic reading wins."));
    expect(await replyText(createCoachSseStream(ctx))).toBe("Systematic reading wins.");
  });
});

describe("createCoachSseStream completed event", () => {
  beforeEach(() => {
    mocks.captureServerEvent.mockReset();
    mocks.captureServerEvent.mockResolvedValue(undefined);
    mocks.replyStream.mockReset();
  });

  const completedProperties = () =>
    mocks.captureServerEvent.mock.calls.find(
      ([arg]) => (arg as { event: string }).event === "coach_request_completed",
    )![0].properties;

  it("reports the model and token usage the provider returned", async () => {
    mocks.replyStream.mockImplementation(reply);
    await new Response(createCoachSseStream(ctx)).text();

    const properties = completedProperties();
    expect(properties).toMatchObject({
      personaId: "still-water",
      model: "test-model",
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      usageAvailable: true,
    });
    expect(properties.durationMs).toBeGreaterThanOrEqual(0);
    expect(properties.durationMs).toBeLessThan(60_000);
  });

  it("reports missing usage as unknown and an unset persona as default", async () => {
    mocks.replyStream.mockImplementation(chunks("Take the vital point."));
    await new Response(createCoachSseStream({ ...ctx, personaId: "" })).text();

    expect(completedProperties()).toMatchObject({
      personaId: "default",
      model: "test-model",
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      usageAvailable: false,
    });
  });
});

describe("trimHistory", () => {
  const message = (content: string, role = "user") => ({ role, content });

  it("keeps only the most recent messages, oldest first", () => {
    const history = ["one", "two", "three", "four", "five"].map((c) => message(c));
    expect(trimHistory(history, 3, 10_000).map((m) => m.content)).toEqual([
      "three",
      "four",
      "five",
    ]);
  });

  it("keeps each message's role", () => {
    const history = [message("question", "user"), message("answer", "assistant")];
    expect(trimHistory(history, 10, 10_000).map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("cuts a message to 2000 characters, counting code points rather than UTF-16 units", () => {
    const [plain] = trimHistory([message("a".repeat(2500))], 10, 100_000);
    expect(plain.content).toHaveLength(2000);

    const [emoji] = trimHistory([message("⚫".repeat(1500) + "🀄".repeat(1000))], 10, 100_000);
    expect([...emoji.content]).toHaveLength(2000);
  });

  it("normalizes full-width text before counting it", () => {
    const [m] = trimHistory([message("ｈｅｌｌｏ")], 10, 100);
    expect(m.content).toBe("hello");
  });

  it("keeps the newest messages that fit the character budget, including an exact fit", () => {
    const history = [message("x".repeat(40)), message("y".repeat(30)), message("z".repeat(20))];
    expect(trimHistory(history, 10, 50).map((m) => m.content.length)).toEqual([30, 20]);
  });

  it("stops at the first message that does not fit instead of skipping past it", () => {
    const history = [message("a".repeat(5)), message("b".repeat(40)), message("c".repeat(10))];
    expect(trimHistory(history, 10, 30).map((m) => m.content.length)).toEqual([10]);
  });

  it("keeps the newest message even when it alone is over budget", () => {
    const history = [message("old"), message("n".repeat(100))];
    expect(trimHistory(history, 10, 50).map((m) => m.content.length)).toEqual([100]);
  });

  it("returns nothing for an empty history", () => {
    expect(trimHistory([], 10, 100)).toEqual([]);
  });
});

describe("buildSseResponse", () => {
  it("sends the headers a proxy needs to stream instead of buffer", () => {
    const response = buildSseResponse(new ReadableStream());

    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(response.headers.get("Cache-Control")).toBe("no-cache, no-transform");
    expect(response.headers.get("Connection")).toBe("keep-alive");
    expect(response.headers.get("X-Accel-Buffering")).toBe("no");
  });
});

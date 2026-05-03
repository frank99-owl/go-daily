// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  createManagedCoachProvider,
  FallbackCoachProvider,
  type CoachProviderMessage,
  type CoachStreamChunk,
} from "../../../lib/coach/coachProvider";

// We'll capture the mock implementations dynamically
const primaryMock = vi.fn();
const secondaryMock = vi.fn();

vi.mock("@/lib/env", () => ({
  getCoachEnv: () => ({
    DEEPSEEK_API_KEY: "test-key",
    COACH_MODEL: process.env.COACH_MODEL || "deepseek-chat",
    COACH_API_URL: process.env.COACH_API_URL || "https://api.deepseek.com",
  }),
}));

vi.mock("openai", () => {
  return {
    default: vi.fn().mockImplementation(function (config: { baseURL?: string }) {
      const isFallback = config.baseURL?.includes("fallback");
      return {
        chat: {
          completions: {
            create: isFallback ? secondaryMock : primaryMock,
          },
        },
      };
    }),
  };
});

function mockStream(chunks: Partial<CoachStreamChunk>[]) {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        async next() {
          if (i >= chunks.length) return { done: true, value: undefined };
          const chunk = chunks[i++];
          return {
            done: false,
            value: {
              model: chunk.model ?? "deepseek-chat",
              choices: chunk.done
                ? []
                : [{ delta: { content: chunk.delta ?? "" }, finish_reason: null }],
              usage: chunk.done
                ? { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
                : null,
            },
          };
        },
      };
    },
  };
}

function mockStreamError(error: Error) {
  return {
    [Symbol.asyncIterator]() {
      return {
        async next() {
          throw error;
        },
      };
    },
  };
}

async function collectStream(iter: AsyncIterable<CoachStreamChunk>): Promise<CoachStreamChunk[]> {
  const chunks: CoachStreamChunk[] = [];
  for await (const chunk of iter) {
    chunks.push(chunk);
  }
  return chunks;
}

describe("CoachProvider Fallback Mechanism", () => {
  const dummyMessages: CoachProviderMessage[] = [{ role: "user", content: "hello" }];

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DEEPSEEK_API_KEY = "test-key";
    delete process.env.COACH_API_URL;
    delete process.env.COACH_FALLBACK_API_URL;
    delete process.env.COACH_FALLBACK_API_KEY;
  });

  it("should use single provider if fallback is not configured", async () => {
    primaryMock.mockResolvedValue(
      mockStream([{ delta: "Hello" }, { delta: " world" }, { done: true }]),
    );

    const provider = createManagedCoachProvider({ apiKey: "test-key", timeout: 1000 });

    expect(provider).not.toBeInstanceOf(FallbackCoachProvider);

    const chunks = await collectStream(provider.createReplyStream(dummyMessages));
    const deltas = chunks.filter((c) => c.delta).map((c) => c.delta);
    expect(deltas.join("")).toBe("Hello world");

    const lastChunk = chunks[chunks.length - 1];
    expect(lastChunk.done).toBe(true);
    expect(lastChunk.usage?.usageAvailable).toBe(true);
    expect(lastChunk.usage?.inputTokens).toBe(100);

    expect(primaryMock).toHaveBeenCalledTimes(1);
    expect(secondaryMock).not.toHaveBeenCalled();
  });

  it("should create FallbackCoachProvider when fallback URL is provided", async () => {
    process.env.COACH_FALLBACK_API_URL = "https://api.fallback.com";

    const provider = createManagedCoachProvider({ apiKey: "test-key", timeout: 1000 });

    expect(provider).toBeInstanceOf(FallbackCoachProvider);
  });

  it("should successfully return response from primary provider if it succeeds", async () => {
    process.env.COACH_FALLBACK_API_URL = "https://api.fallback.com";
    primaryMock.mockResolvedValue(mockStream([{ delta: "OK" }, { done: true }]));

    const provider = createManagedCoachProvider({ apiKey: "test-key", timeout: 1000 });
    const chunks = await collectStream(provider.createReplyStream(dummyMessages));

    expect(chunks.some((c) => c.delta === "OK")).toBe(true);
    expect(primaryMock).toHaveBeenCalledTimes(1);
    expect(secondaryMock).not.toHaveBeenCalled();
  });

  it("should fallback to secondary provider if primary fails", async () => {
    process.env.COACH_FALLBACK_API_URL = "https://api.fallback.com";
    primaryMock.mockResolvedValue(mockStreamError(new Error("Primary down")));
    secondaryMock.mockResolvedValue(mockStream([{ delta: "Fallback" }, { done: true }]));

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const provider = createManagedCoachProvider({ apiKey: "test-key", timeout: 1000 });
    const chunks = await collectStream(provider.createReplyStream(dummyMessages));

    expect(chunks.some((c) => c.delta === "Fallback")).toBe(true);
    expect(primaryMock).toHaveBeenCalledTimes(1);
    expect(secondaryMock).toHaveBeenCalledTimes(1);

    consoleSpy.mockRestore();
  });

  it("should throw error if both providers fail", async () => {
    process.env.COACH_FALLBACK_API_URL = "https://api.fallback.com";
    primaryMock.mockResolvedValue(mockStreamError(new Error("Primary down")));
    secondaryMock.mockResolvedValue(mockStreamError(new Error("Fallback down")));

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const provider = createManagedCoachProvider({ apiKey: "test-key", timeout: 1000 });

    await expect(collectStream(provider.createReplyStream(dummyMessages))).rejects.toThrow(
      "Fallback down",
    );

    expect(primaryMock).toHaveBeenCalledTimes(1);
    expect(secondaryMock).toHaveBeenCalledTimes(1);

    consoleSpy.mockRestore();
  });
});

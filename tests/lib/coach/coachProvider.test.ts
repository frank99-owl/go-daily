// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  COACH_TEMPERATURE,
  createManagedCoachProvider,
  FallbackCoachProvider,
  resolveThinking,
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
    COACH_MAX_TOKENS: 2000,
    COACH_THINKING: process.env.COACH_THINKING as "enabled" | "disabled" | undefined,
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
    delete process.env.COACH_THINKING;
    delete process.env.COACH_FALLBACK_THINKING;
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

  // The budget used to be a hardcoded 400. A reasoning model spent all of it
  // on hidden reasoning, finished with "length", and streamed zero content —
  // an empty reply on every analysis question. The budget must come from
  // config, reach both providers, and never silently revert to a literal.
  it("sends the configured token budget and the shared temperature upstream", async () => {
    process.env.COACH_FALLBACK_API_URL = "https://api.fallback.com";
    primaryMock.mockRejectedValue(new Error("primary down"));
    secondaryMock.mockResolvedValue(mockStream([{ delta: "OK" }, { done: true }]));

    const provider = createManagedCoachProvider({ apiKey: "test-key", timeout: 1000 });
    await collectStream(provider.createReplyStream(dummyMessages));

    for (const mock of [primaryMock, secondaryMock]) {
      expect(mock).toHaveBeenCalledWith(
        expect.objectContaining({ max_tokens: 2000, temperature: COACH_TEMPERATURE }),
        expect.anything(),
      );
    }
  });

  it("disables thinking by default on DeepSeek's own API", async () => {
    // Several DeepSeek model names turn thinking on by default, and with it on
    // the coach returned empty replies. The default must not depend on which
    // name COACH_MODEL happens to hold.
    primaryMock.mockResolvedValue(mockStream([{ delta: "OK" }, { done: true }]));

    const provider = createManagedCoachProvider({ apiKey: "test-key", timeout: 1000 });
    await collectStream(provider.createReplyStream(dummyMessages));

    expect(primaryMock.mock.calls[0][0]).toMatchObject({ thinking: { type: "disabled" } });
  });

  it("sends no thinking parameter to a non-DeepSeek endpoint when unset", async () => {
    process.env.COACH_API_URL = "https://api.other-vendor.com/v1";
    primaryMock.mockResolvedValue(mockStream([{ delta: "OK" }, { done: true }]));

    const provider = createManagedCoachProvider({ apiKey: "test-key", timeout: 1000 });
    await collectStream(provider.createReplyStream(dummyMessages));

    // An OpenAI-compatible endpoint that is not DeepSeek must never see it.
    expect(primaryMock.mock.calls[0][0]).not.toHaveProperty("thinking");
  });

  it("lets an explicit COACH_THINKING override the default", async () => {
    process.env.COACH_THINKING = "enabled";
    primaryMock.mockResolvedValue(mockStream([{ delta: "OK" }, { done: true }]));

    const provider = createManagedCoachProvider({ apiKey: "test-key", timeout: 1000 });
    await collectStream(provider.createReplyStream(dummyMessages));

    expect(primaryMock.mock.calls[0][0]).toMatchObject({ thinking: { type: "enabled" } });
  });

  it("does not pass the primary's thinking switch on to the fallback", async () => {
    // The fallback may be another vendor. Inheriting a DeepSeek-only parameter
    // would fail exactly the request the fallback exists to rescue.
    process.env.COACH_THINKING = "disabled";
    process.env.COACH_FALLBACK_API_URL = "https://api.fallback.com";
    primaryMock.mockRejectedValue(new Error("primary down"));
    secondaryMock.mockResolvedValue(mockStream([{ delta: "OK" }, { done: true }]));

    const provider = createManagedCoachProvider({ apiKey: "test-key", timeout: 1000 });
    await collectStream(provider.createReplyStream(dummyMessages));

    expect(secondaryMock.mock.calls[0][0]).not.toHaveProperty("thinking");
  });

  it("uses COACH_FALLBACK_THINKING for the fallback when set", async () => {
    process.env.COACH_FALLBACK_API_URL = "https://api.fallback.com";
    process.env.COACH_FALLBACK_THINKING = "disabled";
    primaryMock.mockRejectedValue(new Error("primary down"));
    secondaryMock.mockResolvedValue(mockStream([{ delta: "OK" }, { done: true }]));

    const provider = createManagedCoachProvider({ apiKey: "test-key", timeout: 1000 });
    await collectStream(provider.createReplyStream(dummyMessages));

    expect(secondaryMock.mock.calls[0][0]).toMatchObject({ thinking: { type: "disabled" } });
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

describe("resolveThinking", () => {
  it("prefers an explicit setting over the host default", () => {
    expect(resolveThinking("enabled", "https://api.deepseek.com")).toBe("enabled");
    expect(resolveThinking("disabled", "https://api.other-vendor.com")).toBe("disabled");
  });

  it("defaults to disabled only for DeepSeek's exact API host", () => {
    expect(resolveThinking(undefined, "https://api.deepseek.com")).toBe("disabled");
    expect(resolveThinking(undefined, "https://api.deepseek.com/v1")).toBe("disabled");
    // A lookalike host is not DeepSeek; matching on a substring would send a
    // DeepSeek-only parameter to whoever controls it.
    expect(resolveThinking(undefined, "https://api.deepseek.com.example.net")).toBeUndefined();
    expect(resolveThinking(undefined, "https://api.other-vendor.com")).toBeUndefined();
  });

  it("sends nothing when the URL cannot be parsed", () => {
    expect(resolveThinking(undefined, "not a url")).toBeUndefined();
  });
});

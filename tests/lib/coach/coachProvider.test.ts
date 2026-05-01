import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  createManagedCoachProvider,
  FallbackCoachProvider,
  type CoachProviderMessage,
} from "../../../lib/coach/coachProvider";

// We'll capture the mock implementations dynamically
const primaryMock = vi.fn();
const secondaryMock = vi.fn();

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

function mockCompletion(content: string) {
  return {
    choices: [{ message: { content } }],
    model: "deepseek-chat",
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
  };
}

function mockCompletionNoUsage(content: string) {
  return {
    choices: [{ message: { content } }],
    model: "deepseek-chat",
  };
}

describe("CoachProvider Fallback Mechanism", () => {
  const dummyMessages: CoachProviderMessage[] = [{ role: "user", content: "hello" }];

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.COACH_API_URL;
    delete process.env.COACH_FALLBACK_API_URL;
    delete process.env.COACH_FALLBACK_API_KEY;
  });

  it("should use single provider if fallback is not configured", async () => {
    primaryMock.mockResolvedValue(mockCompletion("Primary response"));

    const provider = createManagedCoachProvider({ apiKey: "test-key", timeout: 1000 });

    expect(provider).not.toBeInstanceOf(FallbackCoachProvider);

    const result = await provider.createReply(dummyMessages);
    expect(result.content).toBe("Primary response");
    expect(result.usage.usageAvailable).toBe(true);
    expect(result.usage.inputTokens).toBe(100);
    expect(result.model).toBe("deepseek-chat");
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
    primaryMock.mockResolvedValue(mockCompletion("Primary success"));

    const provider = createManagedCoachProvider({ apiKey: "test-key", timeout: 1000 });
    const result = await provider.createReply(dummyMessages);

    expect(result.content).toBe("Primary success");
    expect(primaryMock).toHaveBeenCalledTimes(1);
    expect(secondaryMock).not.toHaveBeenCalled();
  });

  it("should fallback to secondary provider if primary fails", async () => {
    process.env.COACH_FALLBACK_API_URL = "https://api.fallback.com";
    primaryMock.mockRejectedValue(new Error("Primary down"));
    secondaryMock.mockResolvedValue(mockCompletion("Fallback success"));

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const provider = createManagedCoachProvider({ apiKey: "test-key", timeout: 1000 });
    const result = await provider.createReply(dummyMessages);

    expect(result.content).toBe("Fallback success");
    expect(primaryMock).toHaveBeenCalledTimes(1);
    expect(secondaryMock).toHaveBeenCalledTimes(1);

    consoleSpy.mockRestore();
  });

  it("should throw error if both providers fail", async () => {
    process.env.COACH_FALLBACK_API_URL = "https://api.fallback.com";
    primaryMock.mockRejectedValue(new Error("Primary down"));
    secondaryMock.mockRejectedValue(new Error("Fallback down"));

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const provider = createManagedCoachProvider({ apiKey: "test-key", timeout: 1000 });

    await expect(provider.createReply(dummyMessages)).rejects.toThrow("Fallback down");

    expect(primaryMock).toHaveBeenCalledTimes(1);
    expect(secondaryMock).toHaveBeenCalledTimes(1);

    consoleSpy.mockRestore();
  });

  it("should report usageAvailable: false when provider returns no usage", async () => {
    primaryMock.mockResolvedValue(mockCompletionNoUsage("No usage data"));

    const provider = createManagedCoachProvider({ apiKey: "test-key", timeout: 1000 });
    const result = await provider.createReply(dummyMessages);

    expect(result.content).toBe("No usage data");
    expect(result.usage.usageAvailable).toBe(false);
    expect(result.usage.inputTokens).toBeNull();
    expect(result.usage.outputTokens).toBeNull();
    expect(result.usage.totalTokens).toBeNull();
  });
});

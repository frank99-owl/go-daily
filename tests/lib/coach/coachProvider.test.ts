import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  createManagedCoachProvider,
  FallbackCoachProvider,
  CoachProviderMessage,
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

describe("CoachProvider Fallback Mechanism", () => {
  const dummyMessages: CoachProviderMessage[] = [{ role: "user", content: "hello" }];

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.COACH_API_URL;
    delete process.env.COACH_FALLBACK_API_URL;
    delete process.env.COACH_FALLBACK_API_KEY;
  });

  it("should use single provider if fallback is not configured", async () => {
    primaryMock.mockResolvedValue({ choices: [{ message: { content: "Primary response" } }] });

    const provider = createManagedCoachProvider({ apiKey: "test-key", timeout: 1000 });

    expect(provider).not.toBeInstanceOf(FallbackCoachProvider);

    const reply = await provider.createReply(dummyMessages);
    expect(reply).toBe("Primary response");
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
    primaryMock.mockResolvedValue({ choices: [{ message: { content: "Primary success" } }] });

    const provider = createManagedCoachProvider({ apiKey: "test-key", timeout: 1000 });
    const reply = await provider.createReply(dummyMessages);

    expect(reply).toBe("Primary success");
    expect(primaryMock).toHaveBeenCalledTimes(1);
    expect(secondaryMock).not.toHaveBeenCalled();
  });

  it("should fallback to secondary provider if primary fails", async () => {
    process.env.COACH_FALLBACK_API_URL = "https://api.fallback.com";
    primaryMock.mockRejectedValue(new Error("Primary down"));
    secondaryMock.mockResolvedValue({ choices: [{ message: { content: "Fallback success" } }] });

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const provider = createManagedCoachProvider({ apiKey: "test-key", timeout: 1000 });
    const reply = await provider.createReply(dummyMessages);

    expect(reply).toBe("Fallback success");
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
});

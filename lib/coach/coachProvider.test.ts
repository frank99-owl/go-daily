/**
 * @vitest-environment node
 *
 * Locks down the Coach provider abstraction so that future BYOK / alternate-
 * provider work doesn't accidentally drift the public contract: today
 * `lib/coachProvider.ts` is the only thin wrapper around the OpenAI SDK that
 * speaks to DeepSeek, and `app/api/coach/route.ts` consumes it through the
 * `CoachProvider` interface. These tests pin:
 *   - constructor wiring (apiKey, baseURL, timeout, maxRetries=1)
 *   - model selection (COACH_MODEL env override; defaults to deepseek-chat)
 *   - createReply call shape (temperature, max_tokens, message passthrough)
 *   - response normalization (trim, missing-content fallback to "")
 *   - exception propagation
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createCompletionMock = vi.fn();
const OpenAIMock = vi.fn();

vi.mock("openai", () => {
  // The SDK is invoked as `new OpenAI(...)`; Vitest hoists this mock so we can
  // build a real constructor that records its config and exposes the same
  // chat.completions.create surface coachProvider relies on.
  class FakeOpenAI {
    public config: unknown;
    public chat = {
      completions: { create: createCompletionMock },
    };
    constructor(config: unknown) {
      OpenAIMock(config);
      this.config = config;
    }
  }
  return { default: FakeOpenAI };
});

vi.mock("@/lib/env", () => ({
  getCoachEnv: () => ({
    DEEPSEEK_API_KEY: "test-key",
    COACH_MODEL: process.env.COACH_MODEL || "deepseek-chat",
    COACH_API_URL: process.env.COACH_API_URL || "https://api.deepseek.com",
  }),
}));

import { createManagedCoachProvider } from "@/lib/coach/coachProvider";

describe("createManagedCoachProvider — constructor wiring", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    OpenAIMock.mockClear();
    createCompletionMock.mockReset();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("forwards apiKey and timeout, hard-codes the DeepSeek baseURL, and pins maxRetries=1", () => {
    createManagedCoachProvider({ apiKey: "test-key", timeout: 12_345 });

    expect(OpenAIMock).toHaveBeenCalledTimes(1);
    expect(OpenAIMock).toHaveBeenCalledWith({
      apiKey: "test-key",
      baseURL: "https://api.deepseek.com",
      timeout: 12_345,
      maxRetries: 1,
    });
  });

  it("uses COACH_MODEL when set so ops can swap the upstream model without a deploy", async () => {
    process.env.COACH_MODEL = "deepseek-reasoner";
    const provider = createManagedCoachProvider({ apiKey: "k", timeout: 1000 });
    createCompletionMock.mockResolvedValue({ choices: [{ message: { content: "ok" } }] });

    await provider.createReply([{ role: "user", content: "hi" }]);

    expect(createCompletionMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: "deepseek-reasoner" }),
    );
  });

  it("defaults to deepseek-chat when COACH_MODEL is unset", async () => {
    delete process.env.COACH_MODEL;
    const provider = createManagedCoachProvider({ apiKey: "k", timeout: 1000 });
    createCompletionMock.mockResolvedValue({ choices: [{ message: { content: "ok" } }] });

    await provider.createReply([{ role: "user", content: "hi" }]);

    expect(createCompletionMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: "deepseek-chat" }),
    );
  });

  it("falls back to deepseek-chat when COACH_MODEL is set to an empty string", async () => {
    // The route uses `process.env.COACH_MODEL || "deepseek-chat"`, so an
    // empty string (vs. unset) must still trigger the default. This test
    // pins that semantics in case someone refactors to `??` later.
    process.env.COACH_MODEL = "";
    const provider = createManagedCoachProvider({ apiKey: "k", timeout: 1000 });
    createCompletionMock.mockResolvedValue({ choices: [{ message: { content: "ok" } }] });

    await provider.createReply([{ role: "user", content: "hi" }]);

    expect(createCompletionMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: "deepseek-chat" }),
    );
  });
});

describe("createReply — request shape", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    OpenAIMock.mockClear();
    createCompletionMock.mockReset();
    process.env = { ...originalEnv, COACH_MODEL: "test-model" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("passes the messages array verbatim and applies the configured sampling knobs", async () => {
    const provider = createManagedCoachProvider({ apiKey: "k", timeout: 1000 });
    createCompletionMock.mockResolvedValue({ choices: [{ message: { content: "ok" } }] });

    const messages = [
      { role: "system" as const, content: "you are a coach" },
      { role: "user" as const, content: "what now?" },
      { role: "assistant" as const, content: "consider 3-3" },
      { role: "user" as const, content: "why?" },
    ];

    await provider.createReply(messages);

    expect(createCompletionMock).toHaveBeenCalledTimes(1);
    expect(createCompletionMock).toHaveBeenCalledWith({
      model: "test-model",
      messages,
      temperature: 0.6,
      max_tokens: 400,
    });
  });
});

describe("createReply — response normalization", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    OpenAIMock.mockClear();
    createCompletionMock.mockReset();
    process.env = { ...originalEnv, COACH_MODEL: "test-model" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns the trimmed assistant content from the first choice", async () => {
    createCompletionMock.mockResolvedValue({
      choices: [{ message: { content: "  Take the corner.  \n" } }],
      model: "test-model",
    });

    const result = await createManagedCoachProvider({ apiKey: "k", timeout: 1000 }).createReply([]);

    expect(result.content).toBe("Take the corner.");
  });

  it("returns '' when the first choice has no message content", async () => {
    createCompletionMock.mockResolvedValue({
      choices: [{ message: { content: null } }],
      model: "test-model",
    });

    const result = await createManagedCoachProvider({ apiKey: "k", timeout: 1000 }).createReply([]);

    expect(result.content).toBe("");
  });

  it("returns '' when the first choice has no message at all", async () => {
    createCompletionMock.mockResolvedValue({ choices: [{}], model: "test-model" });

    const result = await createManagedCoachProvider({ apiKey: "k", timeout: 1000 }).createReply([]);

    expect(result.content).toBe("");
  });

  it("returns '' when the choices array is empty (e.g. content filter)", async () => {
    createCompletionMock.mockResolvedValue({ choices: [], model: "test-model" });

    const result = await createManagedCoachProvider({ apiKey: "k", timeout: 1000 }).createReply([]);

    expect(result.content).toBe("");
  });
});

describe("createReply — error propagation", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    OpenAIMock.mockClear();
    createCompletionMock.mockReset();
    process.env = { ...originalEnv, COACH_MODEL: "test-model" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("propagates SDK errors so the route can map them to HTTP status codes", async () => {
    // /api/coach/route.ts pattern-matches the error message ("timeout",
    // "429", "401") and turns it into 504/429/500/502. The provider must
    // therefore NOT swallow exceptions — pin that here.
    createCompletionMock.mockRejectedValue(new Error("request timeout"));

    const provider = createManagedCoachProvider({ apiKey: "k", timeout: 1000 });
    await expect(provider.createReply([{ role: "user", content: "hi" }])).rejects.toThrow(
      "request timeout",
    );
  });

  it("propagates rate-limit errors verbatim", async () => {
    createCompletionMock.mockRejectedValue(new Error("429 rate limit"));

    const provider = createManagedCoachProvider({ apiKey: "k", timeout: 1000 });
    await expect(provider.createReply([])).rejects.toThrow("429 rate limit");
  });
});

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * @vitest-environment node
 */
import OpenAI from "openai";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { POST } from "@/app/api/coach/route";
import { getPuzzle } from "@/content/puzzles";
import { MemoryRateLimiter } from "@/lib/rateLimit";

vi.mock("@/content/puzzles", () => ({
  getPuzzle: vi.fn().mockResolvedValue({
    id: "mock_puzzle",
    title: { zh: "测试" },
    moves: [],
    stones: [],
    correct: [],
    wrongBranches: [],
    solutionNote: { zh: "Solution note" },
    difficulty: "easy",
  }),
}));

vi.mock("openai", () => {
  const mOpenAI = vi.fn();
  mOpenAI.prototype.chat = {
    completions: {
      create: vi.fn(),
    },
  };
  return { default: mOpenAI };
});

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/coach", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `test-ip-${Math.random()}` },
    body: JSON.stringify(body),
  });
}

describe("/api/coach", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv, DEEPSEEK_API_KEY: "test-key", COACH_MODEL: "test-model" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("400 — bad request", () => {
    it("returns 400 for missing puzzleId", async () => {
      const res = await POST(
        makeRequest({ locale: "zh", userMove: { x: 0, y: 0 }, isCorrect: true, history: [] }),
      );
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: string };
      expect(json.error.toLowerCase()).toMatch(/expected string|puzzleid/);
    });

    it("returns 400 for empty puzzleId", async () => {
      const res = await POST(
        makeRequest({
          puzzleId: "",
          locale: "zh",
          userMove: { x: 0, y: 0 },
          isCorrect: true,
          history: [{ role: "user", content: "hi", ts: 0 }],
        }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid locale", async () => {
      const res = await POST(
        makeRequest({
          puzzleId: "test",
          locale: "fr",
          userMove: { x: 0, y: 0 },
          isCorrect: true,
          history: [{ role: "user", content: "hi", ts: 0 }],
        }),
      );
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: string };
      expect(json.error.toLowerCase()).toContain("zh");
    });

    it("returns 400 for non-integer userMove", async () => {
      const res = await POST(
        makeRequest({
          puzzleId: "test",
          locale: "zh",
          userMove: { x: 1.5, y: 0 },
          isCorrect: true,
          history: [{ role: "user", content: "hi", ts: 0 }],
        }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 for empty history", async () => {
      const res = await POST(
        makeRequest({
          puzzleId: "test",
          locale: "zh",
          userMove: { x: 0, y: 0 },
          isCorrect: true,
          history: [],
        }),
      );
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: string };
      expect(json.error.toLowerCase()).toContain("history");
    });

    it("returns 400 for invalid JSON", async () => {
      const req = new Request("http://localhost/api/coach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not json",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });
  });

  describe("404 — unknown puzzle", () => {
    it("returns 404 for a puzzleId that does not exist", async () => {
      vi.mocked(getPuzzle).mockResolvedValueOnce(undefined);
      const res = await POST(
        makeRequest({
          puzzleId: "nonexistent-puzzle-99999",
          locale: "zh",
          userMove: { x: 0, y: 0 },
          isCorrect: true,
          history: [{ role: "user", content: "hi", ts: 0 }],
        }),
      );
      expect(res.status).toBe(404);
    });
  });

  describe("413 — body too large", () => {
    it("returns 413 when content-length exceeds 8KB", async () => {
      const req = new Request("http://localhost/api/coach", {
        method: "POST",
        headers: { "content-type": "application/json", "content-length": "9001" },
        body: JSON.stringify({
          puzzleId: "x",
          locale: "zh",
          userMove: { x: 0, y: 0 },
          isCorrect: true,
          history: [],
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(413);
    });
  });

  describe("429 — rate limit & fail-open", () => {
    it("returns 429 after too many requests from the same IP", async () => {
      const body = {
        puzzleId: "nonexistent-429-test",
        locale: "zh" as const,
        userMove: { x: 0, y: 0 },
        isCorrect: true,
        history: [{ role: "user" as const, content: "hi", ts: 0 }],
      };

      const headers = { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" };

      let lastStatus = 0;
      for (let i = 0; i < 15; i++) {
        const req = new Request("http://localhost/api/coach", {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
        const res = await POST(req);
        lastStatus = res.status;
        if (res.status === 429) break;
      }

      expect(lastStatus).toBe(429);
    });

    it("fails open if rate limiter throws an error", async () => {
      vi.spyOn(MemoryRateLimiter.prototype, "isLimited").mockImplementationOnce(() => {
        throw new Error("Redis timeout simulated");
      });

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const body = {
        // Needs a valid puzzleId so it proceeds past validation and puzzle check
        // "cd_1" is a curated puzzle from phase A, assuming it exists or we mock getPuzzle.
        // Wait, `getPuzzle` is real. We use "cd_1".
        puzzleId: "cd_1",
        locale: "zh" as const,
        userMove: { x: 0, y: 0 },
        isCorrect: true,
        history: [{ role: "user" as const, content: "hi", ts: 0 }],
      };

      const req = new Request("http://localhost/api/coach", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "fail-open-ip" },
        body: JSON.stringify(body),
      });

      const mockedCreate = vi.fn().mockResolvedValue({
        choices: [{ message: { content: "I am the coach." } }],
      });
      (OpenAI.prototype.chat.completions.create as any).mockImplementation(mockedCreate);

      const res = await POST(req);

      // Should not be 429
      expect(res.status).not.toBe(429);
      expect(consoleSpy).toHaveBeenCalledWith(
        "[RateLimitError] Failing open for ip:",
        "fail-open-ip",
        expect.any(Error),
      );
    });
  });

  describe("API Keys and 500/502 errors", () => {
    it("returns 500 if DEEPSEEK_API_KEY is missing", async () => {
      delete process.env.DEEPSEEK_API_KEY;
      const res = await POST(
        makeRequest({
          puzzleId: "cd_1",
          locale: "zh",
          userMove: { x: 0, y: 0 },
          isCorrect: true,
          history: [{ role: "user", content: "hi", ts: 0 }],
        }),
      );
      expect(res.status).toBe(500);
      const json = (await res.json()) as any;
      expect(json.error).toContain("missing DEEPSEEK_API_KEY");
    });

    it("returns 502 if upstream throws", async () => {
      const mockedCreate = vi.fn().mockRejectedValue(new Error("Upstream down"));
      (OpenAI.prototype.chat.completions.create as any).mockImplementation(mockedCreate);

      const res = await POST(
        makeRequest({
          puzzleId: "cd_1",
          locale: "zh",
          userMove: { x: 0, y: 0 },
          isCorrect: true,
          history: [{ role: "user", content: "hi", ts: 0 }],
        }),
      );
      expect(res.status).toBe(502);
      const json = (await res.json()) as any;
      expect(json.error).toContain("temporarily unavailable");
    });

    it("returns 502 if upstream returns empty reply", async () => {
      const mockedCreate = vi.fn().mockResolvedValue({ choices: [{ message: { content: "" } }] });
      (OpenAI.prototype.chat.completions.create as any).mockImplementation(mockedCreate);

      const res = await POST(
        makeRequest({
          puzzleId: "cd_1",
          locale: "zh",
          userMove: { x: 0, y: 0 },
          isCorrect: true,
          history: [{ role: "user", content: "hi", ts: 0 }],
        }),
      );
      expect(res.status).toBe(502);
      const json = (await res.json()) as any;
      expect(json.error).toContain("Empty reply from the model");
    });
  });

  describe("200 — Success & COACH_MODEL branching", () => {
    it("uses default deepseek-chat when COACH_MODEL is unset", async () => {
      delete process.env.COACH_MODEL;
      const mockedCreate = vi
        .fn()
        .mockResolvedValue({ choices: [{ message: { content: "Response" } }] });
      (OpenAI.prototype.chat.completions.create as any).mockImplementation(mockedCreate);

      const res = await POST(
        makeRequest({
          puzzleId: "cd_1",
          locale: "zh",
          userMove: { x: 0, y: 0 },
          isCorrect: true,
          history: [{ role: "user", content: "hi", ts: 0 }],
        }),
      );
      expect(res.status).toBe(200);
      expect(mockedCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "deepseek-chat",
        }),
      );
    });

    it("uses specific COACH_MODEL when set", async () => {
      process.env.COACH_MODEL = "custom-model-x";
      const mockedCreate = vi
        .fn()
        .mockResolvedValue({ choices: [{ message: { content: "Response" } }] });
      (OpenAI.prototype.chat.completions.create as any).mockImplementation(mockedCreate);

      const res = await POST(
        makeRequest({
          puzzleId: "cd_1",
          locale: "zh",
          userMove: { x: 0, y: 0 },
          isCorrect: true,
          history: [{ role: "user", content: "hi", ts: 0 }],
        }),
      );
      expect(res.status).toBe(200);
      expect(mockedCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "custom-model-x",
        }),
      );
    });
  });
});

/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as attemptPOST } from "@/app/api/puzzle/attempt/route";
import { POST as revealPOST } from "@/app/api/puzzle/reveal/route";
import { createRevealToken } from "@/lib/puzzle/revealToken";
import type { Puzzle } from "@/types";

const getPuzzleMock = vi.hoisted(() => vi.fn());

vi.mock("@/content/puzzles", () => ({
  getPuzzle: getPuzzleMock,
}));

const puzzle: Puzzle = {
  id: "api-001",
  date: "2026-04-21",
  boardSize: 9,
  stones: [{ x: 3, y: 3, color: "black" }],
  toPlay: "white",
  correct: [{ x: 4, y: 4 }],
  solutionSequence: [
    { x: 4, y: 4, color: "white" },
    { x: 4, y: 5, color: "black" },
  ],
  wrongBranches: [
    {
      userWrongMove: { x: 0, y: 0 },
      refutation: [{ x: 1, y: 1, color: "black" }],
      note: {
        zh: "错分支",
        en: "Wrong branch",
        ja: "誤りの分岐",
        ko: "잘못된 분기",
      },
    },
  ],
  tag: "life-death",
  difficulty: 2,
  prompt: {
    zh: "白先",
    en: "White to play",
    ja: "白番",
    ko: "백 차례",
  },
  solutionNote: {
    zh: "答案解析",
    en: "Solution note",
    ja: "解説",
    ko: "해설",
  },
};

let ipCounter = 0;

function request(path: string, body: unknown, headers?: HeadersInit): Request {
  ipCounter += 1;
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost",
      "x-forwarded-for": `10.0.0.${ipCounter}`,
      ...(headers ?? {}),
    },
    body: JSON.stringify(body),
  });
}

describe("/api/puzzle/attempt and /api/puzzle/reveal", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    getPuzzleMock.mockReset();
    getPuzzleMock.mockResolvedValue(puzzle);
    process.env = {
      ...originalEnv,
      PUZZLE_REVEAL_SECRET: "test-reveal-secret",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("judges correct and wrong coordinates on the server", async () => {
    const correctResponse = await attemptPOST(
      request("/api/puzzle/attempt", {
        puzzleId: "api-001",
        userMove: { x: 4, y: 4 },
      }),
    );
    const wrongResponse = await attemptPOST(
      request("/api/puzzle/attempt", {
        puzzleId: "api-001",
        userMove: { x: 5, y: 5 },
      }),
    );

    expect(correctResponse.status).toBe(200);
    await expect(correctResponse.json()).resolves.toMatchObject({
      puzzleId: "api-001",
      userMove: { x: 4, y: 4 },
      correct: true,
      revealToken: expect.any(String),
    });
    expect(wrongResponse.status).toBe(200);
    await expect(wrongResponse.json()).resolves.toMatchObject({
      correct: false,
      revealToken: expect.any(String),
    });
  });

  it("returns the current puzzle solution for a valid reveal token", async () => {
    const token = createRevealToken({ puzzleId: "api-001" });

    const response = await revealPOST(
      request("/api/puzzle/reveal", {
        puzzleId: "api-001",
        revealToken: token,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      correct: [{ x: 4, y: 4 }],
      solutionNote: puzzle.solutionNote,
      solutionSequence: puzzle.solutionSequence,
    });
    expect(body).not.toHaveProperty("wrongBranches");
  });

  it("rejects cross-origin attempt and reveal requests", async () => {
    const token = createRevealToken({ puzzleId: "api-001" });
    const headers = { origin: "https://evil.example" };

    const attempt = await attemptPOST(
      request(
        "/api/puzzle/attempt",
        {
          puzzleId: "api-001",
          userMove: { x: 4, y: 4 },
        },
        headers,
      ),
    );
    const reveal = await revealPOST(
      request(
        "/api/puzzle/reveal",
        {
          puzzleId: "api-001",
          revealToken: token,
        },
        headers,
      ),
    );

    expect(attempt.status).toBe(403);
    expect(reveal.status).toBe(403);
  });

  it("rejects missing, forged, expired, and puzzle-mismatched reveal tokens", async () => {
    const validToken = createRevealToken({ puzzleId: "api-001", ttlMs: 1_000, nowMs: 100 });
    const forgedToken = validToken.replace(/\.[^.]+$/, ".forged");
    const expiredToken = createRevealToken({ puzzleId: "api-001", ttlMs: -1, nowMs: 100 });
    const otherPuzzleToken = createRevealToken({ puzzleId: "other-puzzle" });

    const missing = await revealPOST(
      request("/api/puzzle/reveal", {
        puzzleId: "api-001",
      }),
    );
    const forged = await revealPOST(
      request("/api/puzzle/reveal", {
        puzzleId: "api-001",
        revealToken: forgedToken,
      }),
    );
    const expired = await revealPOST(
      request("/api/puzzle/reveal", {
        puzzleId: "api-001",
        revealToken: expiredToken,
      }),
    );
    const mismatch = await revealPOST(
      request("/api/puzzle/reveal", {
        puzzleId: "api-001",
        revealToken: otherPuzzleToken,
      }),
    );

    expect(missing.status).not.toBe(200);
    expect(forged.status).toBe(401);
    expect(expired.status).toBe(401);
    expect(mismatch.status).toBe(401);
  });
});

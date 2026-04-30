import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createRevealToken, verifyRevealToken } from "@/lib/puzzle/revealToken";

describe("puzzle reveal tokens", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      PUZZLE_REVEAL_SECRET: "test-reveal-secret",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("accepts a valid token for the same puzzle before expiry", () => {
    const token = createRevealToken({ puzzleId: "p-1", ttlMs: 1_000, nowMs: 100 });

    const result = verifyRevealToken({ token, puzzleId: "p-1", nowMs: 500 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.puzzleId).toBe("p-1");
    }
  });

  it("rejects forged, expired, and mismatched tokens", () => {
    const token = createRevealToken({ puzzleId: "p-1", ttlMs: 1_000, nowMs: 100 });
    const forged = token.replace(/\.[^.]+$/, ".forged");

    expect(verifyRevealToken({ token: forged, puzzleId: "p-1", nowMs: 500 })).toMatchObject({
      ok: false,
      reason: "signature",
    });
    expect(verifyRevealToken({ token, puzzleId: "p-2", nowMs: 500 })).toMatchObject({
      ok: false,
      reason: "puzzle_mismatch",
    });
    expect(verifyRevealToken({ token, puzzleId: "p-1", nowMs: 1_101 })).toMatchObject({
      ok: false,
      reason: "expired",
    });
  });
});

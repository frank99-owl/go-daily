import { describe, expect, it } from "vitest";

import { attemptKey } from "@/lib/storage/attemptKey";

describe("attemptKey", () => {
  it("generates key from puzzleId and solvedAtMs", () => {
    expect(attemptKey({ puzzleId: "p-001", solvedAtMs: 1700000000000 })).toBe(
      "p-001-1700000000000",
    );
  });

  it("produces different keys for different puzzles", () => {
    const a = attemptKey({ puzzleId: "p-001", solvedAtMs: 1000 });
    const b = attemptKey({ puzzleId: "p-002", solvedAtMs: 1000 });
    expect(a).not.toBe(b);
  });

  it("produces different keys for different timestamps", () => {
    const a = attemptKey({ puzzleId: "p-001", solvedAtMs: 1000 });
    const b = attemptKey({ puzzleId: "p-001", solvedAtMs: 2000 });
    expect(a).not.toBe(b);
  });

  it("is deterministic", () => {
    const input = { puzzleId: "p-001", solvedAtMs: 1700000000000 };
    expect(attemptKey(input)).toBe(attemptKey(input));
  });
});

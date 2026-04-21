import { describe, expect, it } from "vitest";

import { getStatusFor, getHistoryFor, computeStatusTallies, lastAttemptMsMap } from "@/lib/puzzleStatus";
import type { AttemptRecord } from "@/types";

describe("puzzleStatus", () => {
  const attempts: AttemptRecord[] = [
    { puzzleId: "p1", correct: false, solvedAtMs: 1000 },
    { puzzleId: "p1", correct: true, solvedAtMs: 2000 },
    { puzzleId: "p2", correct: false, solvedAtMs: 1500 },
    { puzzleId: "p3", correct: true, solvedAtMs: 500 },
  ];

  describe("getStatusFor", () => {
    it("returns 'unattempted' when no attempts exist", () => {
      expect(getStatusFor("p99", attempts)).toBe("unattempted");
    });
    it("returns 'solved' if any attempt is correct", () => {
      expect(getStatusFor("p1", attempts)).toBe("solved");
    });
    it("returns 'attempted' if attempts exist but none are correct", () => {
      expect(getStatusFor("p2", attempts)).toBe("attempted");
    });
  });

  describe("getHistoryFor", () => {
    it("sorts history by newest first and tallies correctly", () => {
      const res = getHistoryFor("p1", attempts);
      expect(res.total).toBe(2);
      expect(res.correct).toBe(1);
      expect(res.wrong).toBe(1);
      expect(res.history[0].solvedAtMs).toBe(2000); // newest first
      expect(res.history[1].solvedAtMs).toBe(1000);
    });
    it("returns empty history for unattempted", () => {
      const res = getHistoryFor("p99", attempts);
      expect(res.total).toBe(0);
      expect(res.history.length).toBe(0);
    });
  });

  describe("computeStatusTallies", () => {
    it("tallies statuses correctly across library", () => {
      const ids = ["p1", "p2", "p3", "p4"];
      const tallies = computeStatusTallies(ids, attempts);
      expect(tallies.solved).toBe(2); // p1, p3
      expect(tallies.attempted).toBe(1); // p2
      expect(tallies.unattempted).toBe(1); // p4
    });
  });

  describe("lastAttemptMsMap", () => {
    it("maps highest solvedAtMs for each puzzleId", () => {
      const map = lastAttemptMsMap(attempts);
      expect(map.get("p1")).toBe(2000);
      expect(map.get("p2")).toBe(1500);
      expect(map.get("p3")).toBe(500);
      expect(map.has("p99")).toBe(false);
    });
  });
});

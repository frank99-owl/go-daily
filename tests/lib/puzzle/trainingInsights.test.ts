import { describe, expect, it } from "vitest";

import { getTrainingInsights } from "@/lib/puzzle/trainingInsights";
import type { AttemptRecord, PuzzleSummary, PuzzleTag } from "@/types";

function attempt(
  puzzleId: string,
  date: string,
  correct: boolean,
  solvedAtMs: number,
): AttemptRecord {
  return {
    puzzleId,
    date,
    userMove: null,
    correct,
    solvedAtMs,
  };
}

function summary(
  id: string,
  tag: PuzzleTag,
  difficulty: PuzzleSummary["difficulty"] = 2,
): PuzzleSummary {
  return {
    id,
    difficulty,
    source: "test",
    date: "2026-05-01",
    prompt: {
      zh: id,
      en: id,
      ja: id,
      ko: id,
    },
    boardSize: 9,
    tag,
  };
}

const now = new Date("2026-05-18T12:00:00");

describe("getTrainingInsights", () => {
  it("returns a stable fallback with no attempts", () => {
    const insights = getTrainingInsights({ attempts: [], summaries: [], now });

    expect(insights.dueTodayCount).toBe(0);
    expect(insights.reviewBacklogCount).toBe(0);
    expect(insights.weakTags).toEqual([]);
    expect(insights.weakMistakeReasons).toEqual([]);
    expect(insights.recentTrend).toMatchObject({
      attempted: 0,
      correct: 0,
      accuracy: 0,
      activeDays: 0,
    });
    expect(insights.reviewCompletion).toEqual({
      completedCount: 0,
      backlogCount: 0,
      totalReviewCount: 0,
      rate: null,
    });
  });

  it("counts due review items and overdue backlog", () => {
    const insights = getTrainingInsights({
      attempts: [attempt("life-1", "2026-05-18", false, 1_000)],
      summaries: [summary("life-1", "life-death")],
      dueReviewItems: [
        { puzzleId: "life-1", dueDate: "2026-05-18" },
        { puzzleId: "tesuji-1", dueDate: "2026-05-16" },
      ],
      now,
    });

    expect(insights.dueTodayCount).toBe(2);
    expect(insights.reviewBacklogCount).toBe(1);
  });

  it("derives weak tags from unresolved latest wrong attempts", () => {
    const insights = getTrainingInsights({
      attempts: [
        attempt("life-1", "2026-05-18", false, 1_000),
        attempt("life-2", "2026-05-18", false, 2_000),
        attempt("tesuji-1", "2026-05-18", false, 3_000),
        attempt("endgame-1", "2026-05-18", true, 4_000),
      ],
      summaries: [
        summary("life-1", "life-death"),
        summary("life-2", "life-death"),
        summary("tesuji-1", "tesuji"),
        summary("endgame-1", "endgame"),
      ],
      now,
    });

    expect(insights.reviewBacklogCount).toBe(3);
    expect(insights.weakTags.map((item) => [item.tag, item.wrongCount])).toEqual([
      ["life-death", 2],
      ["tesuji", 1],
    ]);
  });

  it("summarizes the last 7 calendar days", () => {
    const insights = getTrainingInsights({
      attempts: [
        attempt("old", "2026-05-10", true, 1_000),
        attempt("wrong", "2026-05-12", false, 2_000),
        attempt("right", "2026-05-18", true, 3_000),
      ],
      summaries: [
        summary("old", "tesuji"),
        summary("wrong", "life-death"),
        summary("right", "opening"),
      ],
      now,
    });

    expect(insights.recentTrend.attempted).toBe(2);
    expect(insights.recentTrend.correct).toBe(1);
    expect(insights.recentTrend.accuracy).toBe(50);
    expect(insights.recentTrend.activeDays).toBe(2);
  });

  it("computes review completion from puzzles that had a wrong attempt", () => {
    const insights = getTrainingInsights({
      attempts: [
        attempt("cleared", "2026-05-16", false, 1_000),
        attempt("cleared", "2026-05-17", true, 2_000),
        attempt("waiting", "2026-05-18", false, 3_000),
      ],
      summaries: [summary("cleared", "tesuji"), summary("waiting", "life-death")],
      now,
    });

    expect(insights.reviewCompletion).toEqual({
      completedCount: 1,
      backlogCount: 1,
      totalReviewCount: 2,
      rate: 50,
    });
  });
});

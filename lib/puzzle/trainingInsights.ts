import type { MistakeReasonId } from "@/lib/puzzle/mistakeReason";
import type { AttemptRecord, PuzzleSummary, PuzzleTag } from "@/types";

export type TrainingInsightTag = {
  tag: PuzzleTag;
  wrongCount: number;
  attemptCount: number;
  accuracy: number;
};

export type TrainingInsightMistakeReason = {
  id: MistakeReasonId;
  count: number;
  source: "tag-inferred";
};

export type TrainingTrendDay = {
  date: string;
  attempted: number;
  correct: number;
};

export type TrainingInsights = {
  attemptedCount: number;
  uniqueAttemptedCount: number;
  dueTodayCount: number;
  reviewBacklogCount: number;
  weakTags: TrainingInsightTag[];
  weakMistakeReasons: TrainingInsightMistakeReason[];
  recentTrend: {
    days: TrainingTrendDay[];
    attempted: number;
    correct: number;
    accuracy: number;
    activeDays: number;
  };
  reviewCompletion: {
    completedCount: number;
    backlogCount: number;
    totalReviewCount: number;
    rate: number | null;
  };
};

type DueReviewItem = {
  puzzleId: string;
  dueDate: string;
};

export type TrainingInsightsInput = {
  attempts: AttemptRecord[];
  summaries: PuzzleSummary[];
  dueReviewItems?: DueReviewItem[];
  now?: Date;
};

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function latestAttemptByPuzzle(attempts: AttemptRecord[]): Map<string, AttemptRecord> {
  const latest = new Map<string, AttemptRecord>();
  for (const attempt of attempts) {
    const existing = latest.get(attempt.puzzleId);
    if (!existing || attempt.solvedAtMs > existing.solvedAtMs) {
      latest.set(attempt.puzzleId, attempt);
    }
  }
  return latest;
}

function hasWrongAttemptByPuzzle(attempts: AttemptRecord[]): Set<string> {
  const wrong = new Set<string>();
  for (const attempt of attempts) {
    if (!attempt.correct) wrong.add(attempt.puzzleId);
  }
  return wrong;
}

function inferMistakeReason(summary: PuzzleSummary): MistakeReasonId {
  switch (summary.tag) {
    case "endgame":
      return "endgame-value";
    case "opening":
      return "opening-direction";
    case "tesuji":
      return "shape-reading";
    case "life-death":
      return summary.difficulty <= 2 ? "liberty-counting" : "shape-reading";
  }
}

function computeRecentTrend(attempts: AttemptRecord[], now: Date): TrainingInsights["recentTrend"] {
  const days = Array.from({ length: 7 }, (_, index) => ({
    date: dateKey(addDays(now, index - 6)),
    attempted: 0,
    correct: 0,
  }));
  const dayByDate = new Map(days.map((day) => [day.date, day]));

  for (const attempt of attempts) {
    const day = dayByDate.get(attempt.date);
    if (!day) continue;
    day.attempted += 1;
    if (attempt.correct) day.correct += 1;
  }

  const attempted = days.reduce((sum, day) => sum + day.attempted, 0);
  const correct = days.reduce((sum, day) => sum + day.correct, 0);
  return {
    days,
    attempted,
    correct,
    accuracy: attempted === 0 ? 0 : Math.round((correct / attempted) * 100),
    activeDays: days.filter((day) => day.attempted > 0).length,
  };
}

export function getTrainingInsights({
  attempts,
  summaries,
  dueReviewItems,
  now = new Date(),
}: TrainingInsightsInput): TrainingInsights {
  const summaryById = new Map(summaries.map((summary) => [summary.id, summary]));
  const latestByPuzzle = latestAttemptByPuzzle(attempts);
  const wrongPuzzleIds = hasWrongAttemptByPuzzle(attempts);
  const latestWrong = Array.from(latestByPuzzle.values()).filter((attempt) => !attempt.correct);

  const today = dateKey(now);
  const dueTodayCount = dueReviewItems
    ? dueReviewItems.filter((item) => item.dueDate <= today).length
    : latestWrong.length;
  const reviewBacklogCount = dueReviewItems
    ? dueReviewItems.filter((item) => item.dueDate < today).length
    : latestWrong.length;

  const tagStats = new Map<
    PuzzleTag,
    { wrongCount: number; attemptCount: number; correct: number }
  >();
  for (const latest of latestByPuzzle.values()) {
    const summary = summaryById.get(latest.puzzleId);
    if (!summary) continue;
    const stat = tagStats.get(summary.tag) ?? { wrongCount: 0, attemptCount: 0, correct: 0 };
    stat.attemptCount += 1;
    if (latest.correct) {
      stat.correct += 1;
    } else {
      stat.wrongCount += 1;
    }
    tagStats.set(summary.tag, stat);
  }

  const weakTags = Array.from(tagStats.entries())
    .filter(([, stat]) => stat.wrongCount > 0)
    .map(([tag, stat]) => ({
      tag,
      wrongCount: stat.wrongCount,
      attemptCount: stat.attemptCount,
      accuracy: stat.attemptCount === 0 ? 0 : Math.round((stat.correct / stat.attemptCount) * 100),
    }))
    .sort((a, b) => {
      if (b.wrongCount !== a.wrongCount) return b.wrongCount - a.wrongCount;
      if (a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
      return b.attemptCount - a.attemptCount;
    })
    .slice(0, 3);

  const reasonCounts = new Map<MistakeReasonId, number>();
  for (const attempt of latestWrong) {
    const summary = summaryById.get(attempt.puzzleId);
    if (!summary) continue;
    const id = inferMistakeReason(summary);
    reasonCounts.set(id, (reasonCounts.get(id) ?? 0) + 1);
  }
  const weakMistakeReasons = Array.from(reasonCounts.entries())
    .map(([id, count]) => ({ id, count, source: "tag-inferred" as const }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const completedCount = Array.from(wrongPuzzleIds).filter((puzzleId) => {
    const latest = latestByPuzzle.get(puzzleId);
    return latest?.correct === true;
  }).length;
  const reviewCompletionBacklog = Array.from(wrongPuzzleIds).filter((puzzleId) => {
    const latest = latestByPuzzle.get(puzzleId);
    return latest?.correct === false;
  }).length;
  const totalReviewCount = completedCount + reviewCompletionBacklog;

  return {
    attemptedCount: attempts.length,
    uniqueAttemptedCount: latestByPuzzle.size,
    dueTodayCount,
    reviewBacklogCount,
    weakTags,
    weakMistakeReasons,
    recentTrend: computeRecentTrend(attempts, now),
    reviewCompletion: {
      completedCount,
      backlogCount: reviewCompletionBacklog,
      totalReviewCount,
      rate: totalReviewCount === 0 ? null : Math.round((completedCount / totalReviewCount) * 100),
    },
  };
}

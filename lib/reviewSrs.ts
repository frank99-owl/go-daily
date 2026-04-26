import { formatDateInTimeZone } from "@/lib/coach/coachQuota";
import { nextSrsCardForAttempt, type SrsCardState } from "@/lib/srs";
import type { createClient } from "@/lib/supabase/server";
import type { PuzzleSummary } from "@/types";

export interface ReviewSrsItem {
  puzzleId: string;
  dueDate: string;
  intervalDays: number;
  easeFactor: number;
  lastReviewedAt: string | null;
  lastAttemptedMs: number;
  attemptCount: number;
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type AttemptRow = {
  puzzle_id: string;
  correct: boolean;
  client_solved_at_ms: number | string;
};

type SrsCardRow = {
  puzzle_id: string;
  ease_factor: number | string;
  interval_days: number | string;
  due_date: string;
  last_reviewed_at: string | null;
};

export function sanitizeTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return "UTC";
  }
}

function fromSrsRow(row: SrsCardRow): SrsCardState {
  return {
    easeFactor: Number(row.ease_factor),
    intervalDays: Number(row.interval_days),
    dueDate: row.due_date,
    lastReviewedAt: row.last_reviewed_at,
  };
}

export async function syncAndReadDueSrsItems({
  supabase,
  userId,
  summaries,
  timeZone,
  now,
}: {
  supabase: SupabaseServerClient;
  userId: string;
  summaries: PuzzleSummary[];
  timeZone: string;
  now: Date;
}): Promise<ReviewSrsItem[]> {
  const knownPuzzleIds = new Set(summaries.map((summary) => summary.id));

  const [{ data: attemptRows, error: attemptErr }, { data: cardRows, error: cardErr }] =
    await Promise.all([
      supabase
        .from("attempts")
        .select("puzzle_id, correct, client_solved_at_ms")
        .eq("user_id", userId)
        .order("client_solved_at_ms", { ascending: true })
        .limit(10_000),
      supabase
        .from("srs_cards")
        .select("puzzle_id, ease_factor, interval_days, due_date, last_reviewed_at")
        .eq("user_id", userId),
    ]);

  if (attemptErr) {
    console.error("[review] failed to read attempts for SRS", attemptErr.message);
    return [];
  }
  if (cardErr) {
    console.error("[review] failed to read SRS cards", cardErr.message);
    return [];
  }

  const cardsByPuzzle = new Map<string, SrsCardState>();
  for (const row of (cardRows ?? []) as SrsCardRow[]) {
    if (!knownPuzzleIds.has(row.puzzle_id)) continue;
    cardsByPuzzle.set(row.puzzle_id, fromSrsRow(row));
  }

  const attemptCountByPuzzle = new Map<string, number>();
  const lastAttemptMsByPuzzle = new Map<string, number>();
  const changedPuzzleIds = new Set<string>();

  for (const row of (attemptRows ?? []) as AttemptRow[]) {
    if (!knownPuzzleIds.has(row.puzzle_id)) continue;

    const solvedAtMs = Number(row.client_solved_at_ms);
    if (!Number.isFinite(solvedAtMs)) continue;

    attemptCountByPuzzle.set(row.puzzle_id, (attemptCountByPuzzle.get(row.puzzle_id) ?? 0) + 1);
    lastAttemptMsByPuzzle.set(
      row.puzzle_id,
      Math.max(lastAttemptMsByPuzzle.get(row.puzzle_id) ?? 0, solvedAtMs),
    );

    const existing = cardsByPuzzle.get(row.puzzle_id) ?? null;
    const existingReviewedMs = existing?.lastReviewedAt
      ? Date.parse(existing.lastReviewedAt)
      : Number.NEGATIVE_INFINITY;
    if (Number.isFinite(existingReviewedMs) && existingReviewedMs >= solvedAtMs) continue;

    const next = nextSrsCardForAttempt({
      card: existing,
      correct: row.correct,
      solvedAt: new Date(solvedAtMs),
      timeZone,
    });
    if (!next) continue;

    cardsByPuzzle.set(row.puzzle_id, next);
    changedPuzzleIds.add(row.puzzle_id);
  }

  if (changedPuzzleIds.size > 0) {
    const rows = Array.from(changedPuzzleIds).map((puzzleId) => {
      const card = cardsByPuzzle.get(puzzleId);
      return {
        user_id: userId,
        puzzle_id: puzzleId,
        ease_factor: card?.easeFactor ?? 2.5,
        interval_days: card?.intervalDays ?? 0,
        due_date: card?.dueDate ?? formatDateInTimeZone(now, timeZone),
        last_reviewed_at: card?.lastReviewedAt ?? null,
      };
    });

    const { error: upsertErr } = await supabase
      .from("srs_cards")
      .upsert(rows, { onConflict: "user_id,puzzle_id" });
    if (upsertErr) {
      console.error("[review] failed to upsert SRS cards", upsertErr.message);
    }
  }

  const today = formatDateInTimeZone(now, timeZone);
  return Array.from(cardsByPuzzle.entries())
    .filter(([puzzleId, card]) => knownPuzzleIds.has(puzzleId) && card.dueDate <= today)
    .sort((a, b) => {
      const dueOrder = a[1].dueDate.localeCompare(b[1].dueDate);
      if (dueOrder !== 0) return dueOrder;
      return (lastAttemptMsByPuzzle.get(b[0]) ?? 0) - (lastAttemptMsByPuzzle.get(a[0]) ?? 0);
    })
    .map(([puzzleId, card]) => ({
      puzzleId,
      dueDate: card.dueDate,
      intervalDays: card.intervalDays,
      easeFactor: card.easeFactor,
      lastReviewedAt: card.lastReviewedAt,
      lastAttemptedMs: lastAttemptMsByPuzzle.get(puzzleId) ?? 0,
      attemptCount: attemptCountByPuzzle.get(puzzleId) ?? 0,
    }));
}

import { formatDateInTimeZone } from "./coachQuota";

export type SrsQuality = 0 | 1 | 2 | 3 | 4 | 5;

export interface SrsCardState {
  easeFactor: number;
  intervalDays: number;
  dueDate: string;
  lastReviewedAt: string | null;
}

export const DEFAULT_EASE_FACTOR = 2.5;
export const MIN_EASE_FACTOR = 1.3;

function clampEaseFactor(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_EASE_FACTOR;
  return Math.max(MIN_EASE_FACTOR, Math.round(value * 100) / 100);
}

function clampQuality(value: number): SrsQuality {
  if (value <= 0) return 0;
  if (value >= 5) return 5;
  return Math.round(value) as SrsQuality;
}

function addDaysToDayKey(dayKey: string, days: number): string {
  const [year, month, day] = dayKey.split("-").map((part) => Number.parseInt(part, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function qualityFromAttempt(correct: boolean): SrsQuality {
  return correct ? 5 : 2;
}

export function nextEaseFactor(currentEaseFactor: number, quality: number): number {
  const q = clampQuality(quality);
  const next = currentEaseFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  return clampEaseFactor(next);
}

export function reviewSrsCard({
  card,
  quality,
  reviewedAt = new Date(),
  timeZone = "UTC",
}: {
  card: Pick<SrsCardState, "easeFactor" | "intervalDays"> | null;
  quality: SrsQuality;
  reviewedAt?: Date;
  timeZone?: string;
}): SrsCardState {
  const previousEase = clampEaseFactor(card?.easeFactor ?? DEFAULT_EASE_FACTOR);
  const nextEase = nextEaseFactor(previousEase, quality);
  const reviewedDay = formatDateInTimeZone(reviewedAt, timeZone);

  if (quality < 3) {
    return {
      easeFactor: nextEase,
      intervalDays: 0,
      dueDate: reviewedDay,
      lastReviewedAt: reviewedAt.toISOString(),
    };
  }

  const previousInterval = Math.max(0, Math.floor(card?.intervalDays ?? 0));
  const intervalDays =
    previousInterval === 0
      ? 1
      : previousInterval === 1
        ? 6
        : Math.ceil(previousInterval * nextEase);

  return {
    easeFactor: nextEase,
    intervalDays,
    dueDate: addDaysToDayKey(reviewedDay, intervalDays),
    lastReviewedAt: reviewedAt.toISOString(),
  };
}

export function nextSrsCardForAttempt({
  card,
  correct,
  solvedAt,
  timeZone = "UTC",
}: {
  card: Pick<SrsCardState, "easeFactor" | "intervalDays"> | null;
  correct: boolean;
  solvedAt: Date;
  timeZone?: string;
}): SrsCardState | null {
  if (correct && !card) return null;
  return reviewSrsCard({
    card,
    quality: qualityFromAttempt(correct),
    reviewedAt: solvedAt,
    timeZone,
  });
}

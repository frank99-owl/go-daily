"use client";

import { useEffect, useMemo, useState } from "react";

import { LocalizedLink } from "@/components/LocalizedLink";
import { PuzzleStatusBadge } from "@/components/PuzzleStatusBadge";
import type { ViewerPlan } from "@/lib/entitlements";
import { useLocale } from "@/lib/i18n/i18n";
import { localized } from "@/lib/i18n/localized";
import { track } from "@/lib/posthog/events";
import { getStatusFor, lastAttemptMsMap } from "@/lib/puzzle/puzzleStatus";
import type { ReviewSrsItem } from "@/lib/puzzle/reviewSrs";
import { getTrainingInsights, type TrainingInsights } from "@/lib/puzzle/trainingInsights";
import { loadAttempts } from "@/lib/storage/storage";
import { BOARD_SIZE_LABELS } from "@/types";
import type { AttemptRecord, PuzzleSummary, PuzzleTag } from "@/types";

interface ReviewListItem {
  puzzle: PuzzleSummary;
  lastMs: number;
  attemptCount: number;
}

export function ReviewClient({
  summaries,
  viewerPlan = "guest",
  srsItems = [],
  freeLimit = 20,
  now = new Date(),
}: {
  summaries: PuzzleSummary[];
  viewerPlan?: ViewerPlan;
  srsItems?: ReviewSrsItem[];
  freeLimit?: number;
  now?: Date;
}) {
  const { t, locale } = useLocale();
  const [attempts, setAttempts] = useState<AttemptRecord[] | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAttempts(loadAttempts());
  }, []);

  const attemptsList: AttemptRecord[] = useMemo(() => attempts ?? [], [attempts]);

  const lastAttemptByPuzzle = useMemo(() => lastAttemptMsMap(attemptsList), [attemptsList]);

  const attemptCountByPuzzle = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of attemptsList) {
      m.set(a.puzzleId, (m.get(a.puzzleId) ?? 0) + 1);
    }
    return m;
  }, [attemptsList]);

  const summaryById = useMemo(() => {
    return new Map(summaries.map((summary) => [summary.id, summary]));
  }, [summaries]);

  const localWrongItems = useMemo<ReviewListItem[]>(() => {
    return summaries
      .filter((p) => getStatusFor(p.id, attemptsList) === "attempted")
      .sort((a, b) => {
        const aMs = lastAttemptByPuzzle.get(a.id) ?? 0;
        const bMs = lastAttemptByPuzzle.get(b.id) ?? 0;
        return bMs - aMs;
      })
      .map((puzzle) => ({
        puzzle,
        lastMs: lastAttemptByPuzzle.get(puzzle.id) ?? 0,
        attemptCount: attemptCountByPuzzle.get(puzzle.id) ?? 0,
      }));
  }, [summaries, attemptsList, lastAttemptByPuzzle, attemptCountByPuzzle]);

  const srsReviewItems = useMemo<ReviewListItem[]>(() => {
    return srsItems
      .map((item) => {
        const puzzle = summaryById.get(item.puzzleId);
        if (!puzzle) return null;
        return {
          puzzle,
          lastMs: item.lastAttemptedMs,
          attemptCount: item.attemptCount,
        };
      })
      .filter((item): item is ReviewListItem => item !== null);
  }, [srsItems, summaryById]);

  const isSrsMode = viewerPlan === "pro";
  const insights = useMemo(
    () =>
      getTrainingInsights({
        attempts: attemptsList,
        summaries,
        dueReviewItems: isSrsMode ? srsItems : undefined,
        now,
      }),
    [attemptsList, summaries, isSrsMode, srsItems, now],
  );
  const visibleLocalItems =
    viewerPlan === "free" ? localWrongItems.slice(0, freeLimit) : localWrongItems;
  const visibleItems = isSrsMode ? srsReviewItems : visibleLocalItems;
  const totalReviewCount = isSrsMode ? srsReviewItems.length : localWrongItems.length;
  const hiddenFreeCount =
    !isSrsMode && viewerPlan === "free"
      ? Math.max(0, localWrongItems.length - visibleLocalItems.length)
      : 0;
  const ready = isSrsMode || attempts !== null;

  useEffect(() => {
    if (!ready) return;
    track("review_page_viewed", { wrongCount: totalReviewCount });
  }, [ready, totalReviewCount]);

  const subtitle = isSrsMode ? t.review.srsSubtitle : t.review.subtitle;
  const emptyText = isSrsMode ? t.review.emptySrs : t.review.empty;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl text-white">
          {t.review.title}
        </h1>
        <p className="text-sm text-white/50">{subtitle}</p>
      </div>

      {ready ? (
        <ReviewInsightPanel
          insights={insights}
          isSrsMode={isSrsMode}
          tagLabels={t.tags}
          copy={t.review.insights}
        />
      ) : null}

      {hiddenFreeCount > 0 ? (
        <div className="flex flex-col gap-3 rounded-xl border border-[color:var(--color-accent)]/20 bg-[color:var(--color-accent)]/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-white/65">
            {t.review.freeLimitNotice
              .replace("{{limit}}", String(freeLimit))
              .replace("{{count}}", String(hiddenFreeCount))}
          </p>
          <LocalizedLink
            href="/pricing"
            className="self-start rounded-full bg-[var(--color-accent)] px-4 py-2 text-xs font-semibold text-black transition-opacity hover:opacity-90 sm:self-auto"
          >
            {t.review.freeLimitCta}
          </LocalizedLink>
        </div>
      ) : null}

      {!ready ? null : visibleItems.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
          <p className="text-sm text-white/50">{emptyText}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleItems.map((item) => (
            <ReviewCard
              key={item.puzzle.id}
              item={item}
              locale={locale}
              lastAttemptedLabel={t.review.lastAttempted}
              attemptCountLabel={t.review.attemptCount}
              boardSizeLabel={BOARD_SIZE_LABELS[item.puzzle.boardSize]}
              tagLabel={t.tags[item.puzzle.tag]}
              statusTitle={t.puzzles.statusAttempted}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewInsightPanel({
  insights,
  isSrsMode,
  tagLabels,
  copy,
}: {
  insights: TrainingInsights;
  isSrsMode: boolean;
  tagLabels: Record<PuzzleTag, string>;
  copy: {
    title: string;
    dueNow: string;
    backlog: string;
    weakTags: string;
    noWeakTags: string;
    focusTitle: string;
    focusWithTag: string;
    focusBacklog: string;
    focusClear: string;
    whySrs: string;
    whyLocal: string;
  };
}) {
  const primaryTag = insights.weakTags[0];
  const focusText = primaryTag
    ? copy.focusWithTag.replace("{{tag}}", tagLabels[primaryTag.tag])
    : insights.reviewBacklogCount > 0
      ? copy.focusBacklog
      : copy.focusClear;

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.75fr)]">
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="font-[family-name:var(--font-headline)] text-lg text-white">
              {copy.title}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-white/55">
              {isSrsMode ? copy.whySrs : copy.whyLocal}
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-white/35">
              {copy.focusTitle}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-white/75">{focusText}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <InsightMetric label={copy.dueNow} value={String(insights.dueTodayCount)} />
          <InsightMetric label={copy.backlog} value={String(insights.reviewBacklogCount)} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-white/35">
          {copy.weakTags}
        </span>
        {insights.weakTags.length === 0 ? (
          <span className="text-sm text-white/45">{copy.noWeakTags}</span>
        ) : (
          insights.weakTags.map((item) => (
            <span
              key={item.tag}
              className="rounded-full border border-white/10 bg-black/15 px-2.5 py-1 text-sm text-white/70"
            >
              {tagLabels[item.tag]} · {item.wrongCount}
            </span>
          ))
        )}
      </div>
    </section>
  );
}

function InsightMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/15 px-3 py-3">
      <div className="text-xs text-white/45">{label}</div>
      <div className="mt-1 font-[family-name:var(--font-headline)] text-xl text-white">{value}</div>
    </div>
  );
}

function ReviewCard({
  item,
  locale,
  lastAttemptedLabel,
  attemptCountLabel,
  boardSizeLabel,
  tagLabel,
  statusTitle,
}: {
  item: ReviewListItem;
  locale: "zh" | "en" | "ja" | "ko";
  lastAttemptedLabel: string;
  attemptCountLabel: string;
  boardSizeLabel: string;
  tagLabel: string;
  statusTitle: string;
}) {
  const { puzzle, lastMs, attemptCount } = item;
  const lastDateText = lastMs
    ? new Date(lastMs).toLocaleDateString(
        locale === "zh" ? "zh-CN" : locale === "ja" ? "ja-JP" : locale === "ko" ? "ko-KR" : "en-US",
        { month: "short", day: "numeric" },
      )
    : "";

  return (
    <LocalizedLink
      href={`/puzzles/${encodeURIComponent(puzzle.id)}`}
      className="group relative rounded-xl border border-white/10 bg-white/5 p-4 transition-all hover:border-[color:var(--color-accent)]/30 hover:bg-white/10"
    >
      <div className="absolute right-3 top-3">
        <PuzzleStatusBadge status="attempted" size="sm" title={statusTitle} />
      </div>

      <div className="mb-2 flex items-center justify-between pr-6">
        <span className="max-w-[70%] truncate text-sm text-white/50">
          {lastAttemptedLabel.replace("{{date}}", lastDateText)}
        </span>
        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-sm text-white/50">
          {boardSizeLabel}
        </span>
      </div>

      <h3 className="mb-2 line-clamp-2 text-sm font-medium text-white">
        {localized(puzzle.prompt, locale)}
      </h3>

      <div className="flex items-center gap-2 text-sm text-white/50">
        <span className="rounded-full bg-white/5 px-2 py-0.5">{tagLabel}</span>
        <span>{"★".repeat(puzzle.difficulty)}</span>
        <span className="text-white/10">{"★".repeat(5 - puzzle.difficulty)}</span>
        <span className="ml-auto text-white/50">
          {attemptCountLabel.replace("{{count}}", String(attemptCount))}
        </span>
      </div>
    </LocalizedLink>
  );
}

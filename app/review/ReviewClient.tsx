"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale } from "@/lib/i18n";
import { PUZZLES } from "@/content/puzzles";
import { PuzzleStatusBadge } from "@/components/PuzzleStatusBadge";
import { loadAttempts } from "@/lib/storage";
import { getStatusFor, lastAttemptMsMap } from "@/lib/puzzleStatus";
import { localized } from "@/lib/localized";
import type { AttemptRecord, Puzzle } from "@/types";

/**
 * Mistake review — the LeetCode "wrong-questions notebook". Shows every puzzle
 * the user has attempted but not yet solved, sorted by most recent attempt so
 * unfinished fights float to the top. Empty state is intentionally encouraging
 * (no mistakes == streak-worthy) rather than apologetic.
 */
export function ReviewClient() {
  const { t, locale } = useLocale();
  const [attempts, setAttempts] = useState<AttemptRecord[] | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAttempts(loadAttempts());
  }, []);

  // Memoized so downstream useMemos get a stable reference between renders.
  const attemptsList: AttemptRecord[] = useMemo(
    () => attempts ?? [],
    [attempts],
  );

  const lastAttemptByPuzzle = useMemo(
    () => lastAttemptMsMap(attemptsList),
    [attemptsList],
  );

  // Count attempts per puzzle — used for the "N attempts" subtitle.
  const attemptCountByPuzzle = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of attemptsList) {
      m.set(a.puzzleId, (m.get(a.puzzleId) ?? 0) + 1);
    }
    return m;
  }, [attemptsList]);

  const wrongPuzzles = useMemo(() => {
    return PUZZLES.filter(
      (p) => getStatusFor(p.id, attemptsList) === "attempted",
    ).sort((a, b) => {
      // Most-recently-attempted first.
      const aMs = lastAttemptByPuzzle.get(a.id) ?? 0;
      const bMs = lastAttemptByPuzzle.get(b.id) ?? 0;
      return bMs - aMs;
    });
  }, [attemptsList, lastAttemptByPuzzle]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl text-ink">
          {t.review.title}
        </h1>
        <p className="text-sm text-ink-2">{t.review.subtitle}</p>
      </div>

      {attempts !== null && wrongPuzzles.length === 0 ? (
        <div className="rounded-xl border border-[color:var(--color-line)] bg-white/60 p-8 text-center">
          <p className="text-sm text-ink-2">{t.review.empty}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {wrongPuzzles.map((puzzle) => (
            <ReviewCard
              key={puzzle.id}
              puzzle={puzzle}
              lastMs={lastAttemptByPuzzle.get(puzzle.id) ?? 0}
              attemptCount={attemptCountByPuzzle.get(puzzle.id) ?? 0}
              locale={locale}
              lastAttemptedLabel={t.review.lastAttempted}
              attemptCountLabel={t.review.attemptCount}
              boardSizeLabel={
                t.puzzles.boardSize[
                  String(puzzle.boardSize) as "9" | "13" | "19"
                ]
              }
              tagLabel={t.tags[puzzle.tag]}
              statusTitle={t.puzzles.statusAttempted}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewCard({
  puzzle,
  lastMs,
  attemptCount,
  locale,
  lastAttemptedLabel,
  attemptCountLabel,
  boardSizeLabel,
  tagLabel,
  statusTitle,
}: {
  puzzle: Puzzle;
  lastMs: number;
  attemptCount: number;
  locale: "zh" | "en" | "ja" | "ko";
  lastAttemptedLabel: string;
  attemptCountLabel: string;
  boardSizeLabel: string;
  tagLabel: string;
  statusTitle: string;
}) {
  const lastDateText = lastMs
    ? new Date(lastMs).toLocaleDateString(
        locale === "zh"
          ? "zh-CN"
          : locale === "ja"
            ? "ja-JP"
            : locale === "ko"
              ? "ko-KR"
              : "en-US",
        { month: "short", day: "numeric" },
      )
    : "";

  return (
    <Link
      href={`/puzzles/${encodeURIComponent(puzzle.id)}`}
      className="group relative rounded-xl border border-[color:var(--color-line)] bg-white/60 p-4 hover:border-[color:var(--color-accent)]/50 hover:bg-white/80 transition-all"
    >
      <div className="absolute top-3 right-3">
        <PuzzleStatusBadge status="attempted" size="sm" title={statusTitle} />
      </div>

      <div className="flex items-center justify-between mb-2 pr-6">
        <span className="text-xs text-ink-2 truncate max-w-[70%]">
          {lastAttemptedLabel.replace("{{date}}", lastDateText)}
        </span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-[color:var(--color-paper)] border border-[color:var(--color-line)] text-ink-2">
          {boardSizeLabel}
        </span>
      </div>

      <h3 className="text-sm font-medium text-ink mb-2 line-clamp-2">
        {localized(puzzle.prompt, locale)}
      </h3>

      <div className="flex items-center gap-2 text-xs text-ink-2">
        <span className="px-2 py-0.5 rounded-full bg-[color:var(--color-paper)]">
          {tagLabel}
        </span>
        <span>{"★".repeat(puzzle.difficulty)}</span>
        <span className="text-[color:var(--color-line)]">
          {"★".repeat(5 - puzzle.difficulty)}
        </span>
        <span className="ml-auto text-ink-2">
          {attemptCountLabel.replace("{{count}}", String(attemptCount))}
        </span>
      </div>
    </Link>
  );
}

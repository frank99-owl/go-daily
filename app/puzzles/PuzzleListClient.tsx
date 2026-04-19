"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale } from "@/lib/i18n";
import { PUZZLES } from "@/content/puzzles";
import { PuzzleStatusBadge } from "@/components/PuzzleStatusBadge";
import { DifficultyLegend } from "@/components/DifficultyLegend";
import { loadAttempts } from "@/lib/storage";
import { localized } from "@/lib/i18n";
import { computeStatusTallies, getStatusFor, lastAttemptMsMap } from "@/lib/puzzleStatus";
import type { AttemptRecord, Puzzle, PuzzleStatus } from "@/types";

type SortKey = "default" | "difficulty-asc" | "difficulty-desc" | "recent";
type StatusFilter = "all" | "wrong" | "todo";

export function PuzzleListClient() {
  const { t } = useLocale();

  const [difficulty, setDifficulty] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [attempts, setAttempts] = useState<AttemptRecord[] | null>(null);

  useEffect(() => {
    // localStorage read — only safe after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAttempts(loadAttempts());
  }, []);

  // Memoized so downstream useMemos get a stable reference between renders.
  const attemptsList: AttemptRecord[] = useMemo(() => attempts ?? [], [attempts]);
  const ready = attempts !== null;

  const tallies = useMemo(
    () =>
      computeStatusTallies(
        PUZZLES.map((p) => p.id),
        attemptsList,
      ),
    [attemptsList],
  );

  const lastAttemptByPuzzle = useMemo(() => lastAttemptMsMap(attemptsList), [attemptsList]);

  const filtered = useMemo(() => {
    const base = PUZZLES.filter((p) => {
      if (difficulty !== "all" && String(p.difficulty) !== difficulty) return false;
      if (statusFilter !== "all") {
        const s = getStatusFor(p.id, attemptsList);
        if (statusFilter === "wrong" && s !== "attempted") return false;
        if (statusFilter === "todo" && s !== "unattempted") return false;
      }
      return true;
    });

    // Sorting — clone so we don't mutate PUZZLES ordering.
    const sorted = base.slice();
    if (sortKey === "difficulty-asc") {
      sorted.sort((a, b) => a.difficulty - b.difficulty);
    } else if (sortKey === "difficulty-desc") {
      sorted.sort((a, b) => b.difficulty - a.difficulty);
    } else if (sortKey === "recent") {
      sorted.sort((a, b) => {
        const aMs = lastAttemptByPuzzle.get(a.id) ?? 0;
        const bMs = lastAttemptByPuzzle.get(b.id) ?? 0;
        return bMs - aMs;
      });
    }
    return sorted;
  }, [difficulty, statusFilter, sortKey, attemptsList, lastAttemptByPuzzle]);

  const difficulties = ["all", "1", "2", "3", "4", "5"];

  const selectBase =
    "rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-[#00f2ff]";

  return (
    <div className="flex flex-col gap-6">
      {/* Top section: left (title + stats + filters) vs right (difficulty legend) */}
      <div className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h1 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl text-white">
              {t.puzzles.title}
            </h1>
            <p className="text-sm text-white/50">
              {t.puzzles.total.replace("{{count}}", String(PUZZLES.length))}
            </p>
          </div>

          {/* Status tally bar */}
          <div className="flex flex-wrap items-center gap-3 text-sm text-white/50">
            <span className="inline-flex items-center gap-1.5">
              <PuzzleStatusBadge status="solved" size="sm" />
              <span>
                {t.puzzles.statusSolved} {ready ? tallies.solved : 0}
              </span>
            </span>
            <span className="h-1 w-1 rounded-full bg-white/10" />
            <span className="inline-flex items-center gap-1.5">
              <PuzzleStatusBadge status="attempted" size="sm" />
              <span>
                {t.puzzles.statusAttempted} {ready ? tallies.attempted : 0}
              </span>
            </span>
            <span className="h-1 w-1 rounded-full bg-white/10" />
            <span className="inline-flex items-center gap-1.5">
              <PuzzleStatusBadge status="unattempted" size="sm" />
              <span>
                {t.puzzles.statusUnattempted} {ready ? tallies.unattempted : PUZZLES.length}
              </span>
            </span>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm text-white/50">{t.puzzles.filterDifficulty}</label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className={selectBase}
              >
                {difficulties.map((d) => (
                  <option key={d} value={d} className="bg-[#0a0a0a]">
                    {d === "all"
                      ? t.puzzles.all
                      : "★".repeat(Number(d)) + "☆".repeat(5 - Number(d))}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm text-white/50">{t.puzzles.filterStatus}</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className={selectBase}
              >
                <option value="all" className="bg-[#0a0a0a]">
                  {t.puzzles.all}
                </option>
                <option value="wrong" className="bg-[#0a0a0a]">
                  {t.puzzles.onlyWrong}
                </option>
                <option value="todo" className="bg-[#0a0a0a]">
                  {t.puzzles.onlyTodo}
                </option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm text-white/50">{t.puzzles.sortLabel}</label>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className={selectBase}
              >
                <option value="default" className="bg-[#0a0a0a]">
                  {t.puzzles.sortDefault}
                </option>
                <option value="difficulty-asc" className="bg-[#0a0a0a]">
                  {t.puzzles.sortDifficultyAsc}
                </option>
                <option value="difficulty-desc" className="bg-[#0a0a0a]">
                  {t.puzzles.sortDifficultyDesc}
                </option>
                <option value="recent" className="bg-[#0a0a0a]">
                  {t.puzzles.sortRecent}
                </option>
              </select>
            </div>
          </div>
        </div>

        <div className="hidden lg:block flex-shrink-0 w-[220px]">
          <DifficultyLegend />
        </div>
      </div>

      <p className="text-sm text-white/50">
        {t.puzzles.total.replace("{{count}}", String(filtered.length))}
      </p>

      {filtered.length === 0 ? (
        <p className="text-sm text-white/50">{t.puzzles.empty}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((puzzle) => (
            <PuzzleCard
              key={puzzle.id}
              puzzle={puzzle}
              status={ready ? getStatusFor(puzzle.id, attemptsList) : "unattempted"}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PuzzleCard({ puzzle, status }: { puzzle: Puzzle; status: PuzzleStatus }) {
  const { t, locale } = useLocale();

  const statusTitle =
    status === "solved"
      ? t.puzzles.statusSolved
      : status === "attempted"
        ? t.puzzles.statusAttempted
        : t.puzzles.statusUnattempted;

  return (
    <Link
      href={`/puzzles/${encodeURIComponent(puzzle.id)}`}
      className="group relative rounded-xl border border-white/10 bg-white/5 p-4 hover:border-[#00f2ff]/30 hover:bg-white/10 transition-all"
    >
      {/* Status badge pinned top-right */}
      <div className="absolute top-3 right-3">
        <PuzzleStatusBadge status={status} size="sm" title={statusTitle} />
      </div>

      <div className="flex items-center justify-between mb-2 pr-6">
        <span className="text-sm text-white/50 truncate max-w-[70%]">
          {puzzle.isCurated === false ? (puzzle.source ?? "Library") : puzzle.date}
        </span>
      </div>

      <h3 className="text-sm font-medium text-white mb-2 line-clamp-2">
        {localized(puzzle.prompt, locale)}
      </h3>

      <div className="flex items-center gap-2 text-sm text-white/50">
        <span>{"★".repeat(puzzle.difficulty)}</span>
        <span className="text-white/10">{"★".repeat(5 - puzzle.difficulty)}</span>
        {puzzle.isCurated && (
          <span className="px-2 py-0.5 rounded-full bg-[#00f2ff]/10 text-[#00f2ff] text-xs font-medium">
            {t.puzzles.curated}
          </span>
        )}
      </div>
    </Link>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale } from "@/lib/i18n";
import { PUZZLES } from "@/content/puzzles";
import { PuzzleStatusBadge } from "@/components/PuzzleStatusBadge";
import { loadAttempts } from "@/lib/storage";
import { localized } from "@/lib/localized";
import {
  computeStatusTallies,
  getStatusFor,
  lastAttemptMsMap,
} from "@/lib/puzzleStatus";
import type { AttemptRecord, Puzzle, PuzzleStatus, PuzzleTag } from "@/types";

type SortKey = "default" | "difficulty-asc" | "difficulty-desc" | "recent";
type StatusFilter = "all" | "wrong" | "todo";

export function PuzzleListClient() {
  const { t, locale } = useLocale();

  const [boardSize, setBoardSize] = useState<string>("all");
  const [tag, setTag] = useState<string>("all");
  const [difficulty, setDifficulty] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [search, setSearch] = useState("");
  const [attempts, setAttempts] = useState<AttemptRecord[] | null>(null);

  useEffect(() => {
    // localStorage read — only safe after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAttempts(loadAttempts());
  }, []);

  // Memoized so downstream useMemos get a stable reference between renders.
  const attemptsList: AttemptRecord[] = useMemo(
    () => attempts ?? [],
    [attempts],
  );
  const ready = attempts !== null;

  const tallies = useMemo(
    () =>
      computeStatusTallies(
        PUZZLES.map((p) => p.id),
        attemptsList,
      ),
    [attemptsList],
  );

  const lastAttemptByPuzzle = useMemo(
    () => lastAttemptMsMap(attemptsList),
    [attemptsList],
  );

  const filtered = useMemo(() => {
    const base = PUZZLES.filter((p) => {
      if (boardSize !== "all" && String(p.boardSize) !== boardSize) return false;
      if (tag !== "all" && p.tag !== tag) return false;
      if (difficulty !== "all" && String(p.difficulty) !== difficulty)
        return false;
      if (statusFilter !== "all") {
        const s = getStatusFor(p.id, attemptsList);
        if (statusFilter === "wrong" && s !== "attempted") return false;
        if (statusFilter === "todo" && s !== "unattempted") return false;
      }
      if (search.trim()) {
        const needle = search.toLowerCase();
        const text = `${localized(p.prompt, locale)} ${p.id}`.toLowerCase();
        return text.includes(needle);
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
  }, [
    boardSize,
    tag,
    difficulty,
    statusFilter,
    sortKey,
    search,
    locale,
    attemptsList,
    lastAttemptByPuzzle,
  ]);

  const boardSizes = ["all", "9", "13", "19"];
  const tags: Array<PuzzleTag | "all"> = [
    "all",
    "life-death",
    "tesuji",
    "endgame",
    "opening",
  ];
  const difficulties = ["all", "1", "2", "3", "4", "5"];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl text-ink">
          {t.puzzles.title}
        </h1>
        <p className="text-sm text-ink-2">
          {t.puzzles.total.replace("{{count}}", String(PUZZLES.length))}
        </p>
      </div>

      {/* Status tally bar — the LeetCode "N solved, M attempted, K todo" header.
          Renders a subtle count even pre-hydration so the layout doesn't jump. */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <PuzzleStatusBadge status="solved" size="sm" />
          <span>
            {t.puzzles.statusSolved} {ready ? tallies.solved : 0}
          </span>
        </span>
        <span className="h-1 w-1 rounded-full bg-[color:var(--color-line)]" />
        <span className="inline-flex items-center gap-1.5">
          <PuzzleStatusBadge status="attempted" size="sm" />
          <span>
            {t.puzzles.statusAttempted} {ready ? tallies.attempted : 0}
          </span>
        </span>
        <span className="h-1 w-1 rounded-full bg-[color:var(--color-line)]" />
        <span className="inline-flex items-center gap-1.5">
          <PuzzleStatusBadge status="unattempted" size="sm" />
          <span>
            {t.puzzles.statusUnattempted}{" "}
            {ready ? tallies.unattempted : PUZZLES.length}
          </span>
        </span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-ink-2">{t.puzzles.filterBoardSize}</label>
          <select
            value={boardSize}
            onChange={(e) => setBoardSize(e.target.value)}
            className="rounded-lg border border-[color:var(--color-line)] bg-white px-3 py-2 text-sm focus:outline-none focus:border-[color:var(--color-accent)]"
          >
            {boardSizes.map((s) => (
              <option key={s} value={s}>
                {s === "all"
                  ? t.puzzles.all
                  : t.puzzles.boardSize[s as "9" | "13" | "19"]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-ink-2">{t.puzzles.filterTag}</label>
          <select
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            className="rounded-lg border border-[color:var(--color-line)] bg-white px-3 py-2 text-sm focus:outline-none focus:border-[color:var(--color-accent)]"
          >
            {tags.map((tg) => (
              <option key={tg} value={tg}>
                {tg === "all" ? t.puzzles.all : t.tags[tg]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-ink-2">
            {t.puzzles.filterDifficulty}
          </label>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            className="rounded-lg border border-[color:var(--color-line)] bg-white px-3 py-2 text-sm focus:outline-none focus:border-[color:var(--color-accent)]"
          >
            {difficulties.map((d) => (
              <option key={d} value={d}>
                {d === "all"
                  ? t.puzzles.all
                  : "★".repeat(Number(d)) + "☆".repeat(5 - Number(d))}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-ink-2">{t.puzzles.filterStatus}</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded-lg border border-[color:var(--color-line)] bg-white px-3 py-2 text-sm focus:outline-none focus:border-[color:var(--color-accent)]"
          >
            <option value="all">{t.puzzles.all}</option>
            <option value="wrong">{t.puzzles.onlyWrong}</option>
            <option value="todo">{t.puzzles.onlyTodo}</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-ink-2">{t.puzzles.sortLabel}</label>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="rounded-lg border border-[color:var(--color-line)] bg-white px-3 py-2 text-sm focus:outline-none focus:border-[color:var(--color-accent)]"
          >
            <option value="default">{t.puzzles.sortDefault}</option>
            <option value="difficulty-asc">{t.puzzles.sortDifficultyAsc}</option>
            <option value="difficulty-desc">{t.puzzles.sortDifficultyDesc}</option>
            <option value="recent">{t.puzzles.sortRecent}</option>
          </select>
        </div>

        <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <label className="text-xs text-ink-2">{t.home?.hint ?? "Search"}</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.puzzles.searchPlaceholder}
            className="rounded-lg border border-[color:var(--color-line)] bg-white px-3 py-2 text-sm focus:outline-none focus:border-[color:var(--color-accent)]"
          />
        </div>
      </div>

      <p className="text-xs text-ink-2">
        {t.puzzles.total.replace("{{count}}", String(filtered.length))}
      </p>

      {filtered.length === 0 ? (
        <p className="text-sm text-ink-2">{t.puzzles.empty}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((puzzle) => (
            <PuzzleCard
              key={puzzle.id}
              puzzle={puzzle}
              status={
                ready ? getStatusFor(puzzle.id, attemptsList) : "unattempted"
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PuzzleCard({
  puzzle,
  status,
}: {
  puzzle: Puzzle;
  status: PuzzleStatus;
}) {
  const { t, locale } = useLocale();

  // Title for the badge — small but useful for accessibility.
  const statusTitle =
    status === "solved"
      ? t.puzzles.statusSolved
      : status === "attempted"
        ? t.puzzles.statusAttempted
        : t.puzzles.statusUnattempted;

  return (
    <Link
      href={`/puzzles/${encodeURIComponent(puzzle.id)}`}
      className="group relative rounded-xl border border-[color:var(--color-line)] bg-white/60 p-4 hover:border-[color:var(--color-accent)]/50 hover:bg-white/80 transition-all"
    >
      {/* Status badge pinned top-right — mirrors LeetCode's ✓ next to problem titles. */}
      <div className="absolute top-3 right-3">
        <PuzzleStatusBadge status={status} size="sm" title={statusTitle} />
      </div>

      <div className="flex items-center justify-between mb-2 pr-6">
        <span className="text-xs text-ink-2 truncate max-w-[70%]">
          {puzzle.isCurated === false ? (puzzle.source ?? "Library") : puzzle.date}
        </span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-[color:var(--color-paper)] border border-[color:var(--color-line)] text-ink-2">
          {t.puzzles.boardSize[String(puzzle.boardSize) as "9" | "13" | "19"]}
        </span>
      </div>

      <h3 className="text-sm font-medium text-ink mb-2 line-clamp-2">
        {localized(puzzle.prompt, locale)}
      </h3>

      <div className="flex items-center gap-2 text-xs text-ink-2">
        <span className="px-2 py-0.5 rounded-full bg-[color:var(--color-paper)]">
          {t.tags[puzzle.tag]}
        </span>
        <span>{"★".repeat(puzzle.difficulty)}</span>
        <span className="text-[color:var(--color-line)]">
          {"★".repeat(5 - puzzle.difficulty)}
        </span>
        {puzzle.isCurated && (
          <span className="px-2 py-0.5 rounded-full bg-[color:var(--color-accent)]/10 text-[color:var(--color-accent)] text-[10px] font-medium">
            {t.puzzles.curated}
          </span>
        )}
      </div>
    </Link>
  );
}

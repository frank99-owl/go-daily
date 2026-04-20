"use client";

import { useLocale } from "@/lib/i18n";
import { localized } from "@/lib/localized";
import { BOARD_SIZE_LABELS } from "@/types";
import type { Puzzle } from "@/types";

export function PuzzleHeader({ puzzle, metaLabel }: { puzzle: Puzzle; metaLabel?: string }) {
  const { t, locale } = useLocale();
  const toPlayLabel = puzzle.toPlay === "black" ? t.home.toPlayBlack : t.home.toPlayWhite;
  const primaryMeta = metaLabel ?? puzzle.source ?? puzzle.date;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3 text-sm text-ink-2">
        <span>{primaryMeta}</span>
        <span className="h-1 w-1 rounded-full bg-[color:var(--color-line)]" />
        <span>{t.tags[puzzle.tag]}</span>
        <span className="h-1 w-1 rounded-full bg-[color:var(--color-line)]" />
        <span>{BOARD_SIZE_LABELS[puzzle.boardSize]}</span>
        <span className="h-1 w-1 rounded-full bg-[color:var(--color-line)]" />
        <span>
          {t.home.difficulty} {"★".repeat(puzzle.difficulty)}
          <span className="text-[color:var(--color-line)]">
            {"★".repeat(5 - puzzle.difficulty)}
          </span>
        </span>
      </div>
      <h1 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl text-ink">
        {localized(puzzle.prompt, locale)}
      </h1>
      <p className="text-sm text-ink-2">
        {toPlayLabel} · {t.home.hint}
      </p>
    </div>
  );
}

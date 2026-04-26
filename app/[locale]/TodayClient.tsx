"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { GoBoard } from "@/components/GoBoard";
import { PuzzleHeader } from "@/components/PuzzleHeader";
import { useCurrentUser } from "@/lib/auth/auth";
import { judgeMove } from "@/lib/board/judge";
import { useLocale } from "@/lib/i18n/i18n";
import { localePath } from "@/lib/i18n/localePath";
import { createAttemptRecord, saveAttempt } from "@/lib/storage/storage";
import { createSyncStorage } from "@/lib/storage/syncStorage";
import type { Coord, Puzzle } from "@/types";

export function TodayClient({ puzzle, metaLabel }: { puzzle: Puzzle; metaLabel?: string }) {
  const router = useRouter();
  const { t, locale } = useLocale();
  const { user } = useCurrentUser();
  const [pending, setPending] = useState<Coord | null>(null);

  const syncStorage = useMemo(() => createSyncStorage(user?.id ?? null), [user?.id]);

  const submit = () => {
    if (!pending) return;
    const correct = judgeMove(puzzle, pending);
    const record = createAttemptRecord({
      puzzleId: puzzle.id,
      userMove: pending,
      correct,
    });

    try {
      void syncStorage.saveAttempt(record).catch((err) => {
        console.error("[sync] failed to persist attempt", err);
      });
    } catch (err) {
      console.error("[sync] unavailable, falling back to local storage", err);
      saveAttempt(record);
    }

    router.push(localePath(locale, `/result?id=${encodeURIComponent(puzzle.id)}`));
  };

  const resetPending = () => {
    setPending(null);
  };

  const handleKeyDownCapture: React.KeyboardEventHandler<HTMLDivElement> = (event) => {
    const target = event.target as HTMLElement | null;
    if (
      target?.tagName === "INPUT" ||
      target?.tagName === "TEXTAREA" ||
      target?.isContentEditable
    ) {
      return;
    }

    switch (event.key) {
      case "r":
      case "R":
        event.preventDefault();
        resetPending();
        break;
      case "Escape":
        if (!pending) return;
        event.preventDefault();
        resetPending();
        break;
    }
  };

  return (
    <div className="flex flex-col gap-6" onKeyDownCapture={handleKeyDownCapture}>
      <PuzzleHeader puzzle={puzzle} metaLabel={metaLabel} />
      <div className="mx-auto">
        <GoBoard
          size={puzzle.boardSize}
          stones={puzzle.stones}
          toPlay={puzzle.toPlay}
          userMove={pending}
          onPlay={(c) => setPending(c)}
          cropToStones={puzzle.boardSize === 19}
          boardStyle="dark"
          keyboardEnabled
          focusOnMount
        />
      </div>
      <div className="flex flex-col gap-2 text-center text-sm text-white/45">
        <p>{t.home.boardCoordinateHint}</p>
        <p>{t.home.keyboardShortcuts}</p>
      </div>
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={resetPending}
          disabled={!pending}
          className="px-4 py-2 rounded-full border border-white/10 text-sm text-white/60 hover:text-white disabled:opacity-40 transition-colors"
        >
          {t.home.reset}
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!pending}
          className="px-5 py-2 rounded-full bg-white/10 text-white text-sm font-medium disabled:opacity-40 hover:bg-[#00f2ff] hover:text-black transition-colors"
        >
          {t.home.submit}
        </button>
      </div>
    </div>
  );
}

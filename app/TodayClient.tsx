"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { GoBoard } from "@/components/GoBoard";
import { PuzzleHeader } from "@/components/PuzzleHeader";
import { useLocale } from "@/lib/i18n";
import { judgeMove } from "@/lib/judge";
import { createAttemptRecord, saveAttempt } from "@/lib/storage";
import type { Coord, Puzzle } from "@/types";

export function TodayClient({ puzzle, metaLabel }: { puzzle: Puzzle; metaLabel?: string }) {
  const router = useRouter();
  const { t } = useLocale();
  const [pending, setPending] = useState<Coord | null>(null);

  const submit = () => {
    if (!pending) return;
    const correct = judgeMove(puzzle, pending);
    saveAttempt(
      createAttemptRecord({
        puzzleId: puzzle.id,
        userMove: pending,
        correct,
      }),
    );
    router.push(`/result?id=${encodeURIComponent(puzzle.id)}`);
  };

  return (
    <div className="flex flex-col gap-6">
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
        />
      </div>
      <p className="text-center text-sm text-white/45">{t.home.boardCoordinateHint}</p>
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => setPending(null)}
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

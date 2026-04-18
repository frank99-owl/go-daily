"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { GoBoard } from "@/components/GoBoard";
import { CoachDialogue } from "@/components/CoachDialogue";
import { ShareCard } from "@/components/ShareCard";
import { useLocale } from "@/lib/i18n";
import { PUZZLES } from "@/content/puzzles";
import { getAttemptFor } from "@/lib/storage";
import type { AttemptRecord, Puzzle } from "@/types";

export function ResultClient() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const puzzle: Puzzle | undefined = PUZZLES.find((p) => p.id === id);
  const { t, locale } = useLocale();
  const [attempt, setAttempt] = useState<AttemptRecord | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);

  useEffect(() => {
    if (!puzzle) return;
    // Hydrating from localStorage on mount — not an external sync loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAttempt(getAttemptFor(puzzle.id));
  }, [puzzle]);

  if (!puzzle) {
    return (
      <p className="text-ink-2">
        Puzzle not found.{" "}
        <Link href="/" className="underline">
          {t.result.backToToday}
        </Link>
      </p>
    );
  }

  const correct = attempt?.correct ?? false;

  return (
    <div className="flex flex-col gap-6">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className={
          "rounded-xl px-5 py-4 border " +
          (correct
            ? "bg-[color:var(--color-success)]/10 border-[color:var(--color-success)]/30 text-[color:var(--color-success)]"
            : "bg-[color:var(--color-warn)]/10 border-[color:var(--color-warn)]/30 text-[color:var(--color-warn)]")
        }
      >
        <div className="text-sm font-medium">
          {correct ? t.result.correct : t.result.wrong}
        </div>
        <div className="text-xs text-ink-2 mt-1">{puzzle.prompt[locale]}</div>
      </motion.div>

      <div className="mx-auto">
        <GoBoard
          size={puzzle.boardSize}
          stones={puzzle.stones}
          toPlay={puzzle.toPlay}
          userMove={attempt?.userMove ?? null}
          highlight={showAnswer ? puzzle.correct : undefined}
          disabled
        />
      </div>

      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => setShowAnswer((v) => !v)}
          className="px-4 py-2 rounded-full border border-[color:var(--color-line)] text-sm text-ink-2 hover:text-ink"
        >
          {t.result.viewAnswer}
        </button>
        <Link
          href="/"
          className="px-5 py-2 rounded-full bg-ink text-paper text-sm font-medium hover:bg-[color:var(--color-accent)] transition-colors"
        >
          {t.result.backToToday}
        </Link>
      </div>

      <div className="flex items-center justify-center">
        <ShareCard puzzle={puzzle} correct={correct} />
      </div>

      {showAnswer && (
        <section className="rounded-xl border border-[color:var(--color-line)] bg-white/60 p-5 text-sm leading-relaxed text-ink-2">
          {puzzle.solutionNote[locale]}
        </section>
      )}

      {attempt?.userMove && (
        <CoachDialogue
          puzzleId={puzzle.id}
          userMove={attempt.userMove}
          isCorrect={correct}
        />
      )}
    </div>
  );
}

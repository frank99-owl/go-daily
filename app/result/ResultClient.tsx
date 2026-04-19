"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { GoBoard } from "@/components/GoBoard";
import { CoachDialogue } from "@/components/CoachDialogue";
import { ShareCard } from "@/components/ShareCard";
import { useLocale } from "@/lib/i18n";
import { PUZZLES } from "@/content/puzzles";
import { getAttemptFor, getAttemptsFor } from "@/lib/storage";
import { localized } from "@/lib/localized";
import type { AttemptRecord, Puzzle, Stone } from "@/types";

export function ResultClient() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const puzzle: Puzzle | undefined = PUZZLES.find((p) => p.id === id);
  const { t, locale } = useLocale();
  const [attempt, setAttempt] = useState<AttemptRecord | null>(null);
  const [history, setHistory] = useState<AttemptRecord[]>([]);
  const [showAnswer, setShowAnswer] = useState(false);
  const [solutionStep, setSolutionStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (!puzzle) return;
    // Hydrating from localStorage on mount — both reads are cheap snapshots.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAttempt(getAttemptFor(puzzle.id));
    setHistory(getAttemptsFor(puzzle.id));
  }, [puzzle]);

  // Auto-advance when playing.
  useEffect(() => {
    if (!isPlaying || !puzzle?.solutionSequence) return;
    if (solutionStep >= puzzle.solutionSequence.length) {
      // Stopping the autoplay when the sequence finishes is a legitimate
      // terminal-state transition, not a cascading render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsPlaying(false);
      return;
    }
    const timer = setTimeout(() => {
      setSolutionStep((s) => s + 1);
    }, 1200);
    return () => clearTimeout(timer);
  }, [isPlaying, solutionStep, puzzle]);

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
  const hasSolution = !!puzzle.solutionSequence?.length;

  // History tally across ALL attempts on this puzzle (not just today). Shows
  // the "第 N 次尝试 · 累计 X 对 Y 错" banner — LeetCode-style submission count.
  const totalAttempts = history.length;
  const correctCount = history.filter((a) => a.correct).length;
  const wrongCount = totalAttempts - correctCount;

  // Build extra stones for the board (solution sequence up to current step).
  const extraStones: Stone[] =
    showAnswer && hasSolution
      ? (puzzle.solutionSequence ?? []).slice(0, solutionStep)
      : [];

  const handlePlay = () => {
    setShowAnswer(true);
    setSolutionStep(0);
    setIsPlaying(true);
  };

  const handleStep = (delta: number) => {
    if (!puzzle.solutionSequence) return;
    const max = puzzle.solutionSequence.length;
    setSolutionStep((s) => Math.max(0, Math.min(max, s + delta)));
    setIsPlaying(false);
  };

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
        <div className="text-xs text-ink-2 mt-1">{localized(puzzle.prompt, locale)}</div>
        {totalAttempts > 0 && (
          <div className="text-xs text-ink-2 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              {t.result.attemptCount.replace(
                "{{count}}",
                String(totalAttempts),
              )}
            </span>
            <span className="text-[color:var(--color-line)]">·</span>
            <span>
              {t.result.historyTally
                .replace("{{correct}}", String(correctCount))
                .replace("{{wrong}}", String(wrongCount))}
            </span>
          </div>
        )}
      </motion.div>

      <div className="mx-auto">
        <GoBoard
          size={puzzle.boardSize}
          stones={puzzle.stones}
          toPlay={puzzle.toPlay}
          userMove={attempt?.userMove ?? null}
          highlight={showAnswer ? puzzle.correct : undefined}
          extraStones={extraStones}
          disabled
          cropToStones={puzzle.boardSize === 19}
        />
      </div>

      <div className="flex items-center justify-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => {
            setShowAnswer((v) => !v);
            setSolutionStep(0);
            setIsPlaying(false);
          }}
          className="px-4 py-2 rounded-full border border-[color:var(--color-line)] text-sm text-ink-2 hover:text-ink"
        >
          {showAnswer ? t.result.hideAnswer : t.result.viewAnswer}
        </button>

        {hasSolution && (
          <>
            {!isPlaying && solutionStep === 0 && (
              <button
                type="button"
                onClick={handlePlay}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[color:var(--color-accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
              >
                <Play className="h-3.5 w-3.5" />
                {t.result.playSolution}
              </button>
            )}

            {(solutionStep > 0 || isPlaying) && (
              <div className="inline-flex items-center gap-1 rounded-full border border-[color:var(--color-line)] bg-white/60 px-1 py-1">
                <button
                  type="button"
                  onClick={() => handleStep(-1)}
                  disabled={solutionStep <= 0}
                  className="p-1.5 rounded-full hover:bg-[color:var(--color-paper)] disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-xs text-ink-2 px-1 min-w-[3ch] text-center">
                  {solutionStep} / {puzzle.solutionSequence?.length}
                </span>
                <button
                  type="button"
                  onClick={() => handleStep(1)}
                  disabled={
                    solutionStep >= (puzzle.solutionSequence?.length ?? 0)
                  }
                  className="p-1.5 rounded-full hover:bg-[color:var(--color-paper)] disabled:opacity-30 transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </>
        )}

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

      {/* Solution notes are only shown for curated puzzles — library imports
          have a generic placeholder note which is not worth the visual space. */}
      {showAnswer && puzzle.isCurated !== false && (
        <section className="rounded-xl border border-[color:var(--color-line)] bg-white/60 p-5 text-sm leading-relaxed text-ink-2">
          {localized(puzzle.solutionNote, locale)}
        </section>
      )}

      {/* AI coach is only offered for curated puzzles — library imports lack
          hand-authored 4-language solution notes, so grounding would be weak
          and hallucination risk high. */}
      {attempt?.userMove && puzzle.isCurated !== false && (
        <CoachDialogue
          puzzleId={puzzle.id}
          userMove={attempt.userMove}
          isCorrect={correct}
        />
      )}
    </div>
  );
}

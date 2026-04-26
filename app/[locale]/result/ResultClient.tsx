"use client";

import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { CoachDialogue } from "@/components/CoachDialogue";
import { GoBoard } from "@/components/GoBoard";
import { LocalizedLink } from "@/components/LocalizedLink";
import { ShareCard } from "@/components/ShareCard";
import { getCoachAccess } from "@/lib/coach/coachAccess";
import { useLocale } from "@/lib/i18n";
import { localePath } from "@/lib/localePath";
import { localized } from "@/lib/localized";
import { getAttemptFor, getAttemptsFor } from "@/lib/storage/storage";
import type { AttemptRecord, Puzzle, Stone } from "@/types";

export function ResultClient({
  initialPuzzle,
  todayPuzzleId,
}: {
  initialPuzzle: Puzzle;
  todayPuzzleId: string;
}) {
  const router = useRouter();
  const puzzle = initialPuzzle;
  const { t, locale } = useLocale();
  const retryPath =
    puzzle.id === todayPuzzleId ? "/today" : `/puzzles/${encodeURIComponent(puzzle.id)}`;
  const retryHref = localePath(locale, retryPath);
  const [attempt, setAttempt] = useState<AttemptRecord | null>(null);
  const [history, setHistory] = useState<AttemptRecord[]>([]);
  const [showAnswer, setShowAnswer] = useState(false);
  const [solutionStep, setSolutionStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!puzzle) return;
    // Hydrating from localStorage on mount — both reads are cheap snapshots.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAttempt(getAttemptFor(puzzle.id));
    setHistory(getAttemptsFor(puzzle.id));
  }, [puzzle]);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

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
      <p className="text-white/50">
        Puzzle not found.{" "}
        <LocalizedLink href="/" className="underline text-[#00f2ff]">
          {t.result.backToToday}
        </LocalizedLink>
      </p>
    );
  }

  const correct = attempt?.correct ?? false;
  const hasSolution = !!puzzle.solutionSequence?.length;
  const coachAccess = getCoachAccess(puzzle);

  // History tally across ALL attempts on this puzzle (not just today). Shows
  // the "Attempt N · X correct, Y wrong" banner — LeetCode-style submission count.
  const totalAttempts = history.length;
  const correctCount = history.filter((a) => a.correct).length;
  const wrongCount = totalAttempts - correctCount;

  // Build extra stones for the board (solution sequence up to current step).
  const extraStones: Stone[] =
    showAnswer && hasSolution ? (puzzle.solutionSequence ?? []).slice(0, solutionStep) : [];

  const handlePlay = () => {
    setShowAnswer(true);
    setSolutionStep(1);
    setIsPlaying(true);
  };

  const handleStep = (delta: number) => {
    if (!puzzle.solutionSequence) return;
    const max = puzzle.solutionSequence.length;
    setSolutionStep((s) => Math.max(0, Math.min(max, s + delta)));
    setIsPlaying(false);
    setShowAnswer(true);
  };

  const closeSolutionView = () => {
    setShowAnswer(false);
    setSolutionStep(0);
    setIsPlaying(false);
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
        router.push(retryHref);
        break;
      case "ArrowLeft":
        if (!hasSolution) return;
        event.preventDefault();
        handleStep(-1);
        break;
      case "ArrowRight":
        if (!hasSolution) return;
        event.preventDefault();
        if (solutionStep === 0) {
          setShowAnswer(true);
          setSolutionStep(1);
          setIsPlaying(false);
          return;
        }
        handleStep(1);
        break;
      case "Escape":
        if (!showAnswer && solutionStep === 0 && !isPlaying) return;
        event.preventDefault();
        closeSolutionView();
        break;
    }
  };

  return (
    <div
      ref={containerRef}
      className="flex flex-col gap-6 focus:outline-none"
      onKeyDownCapture={handleKeyDownCapture}
      tabIndex={0}
    >
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
        <div className="text-sm font-medium">{correct ? t.result.correct : t.result.wrong}</div>
        <div className="text-sm mt-1 opacity-70">{localized(puzzle.prompt, locale)}</div>
        {totalAttempts > 0 && (
          <div className="text-sm mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 opacity-70">
            <span>{t.result.attemptCount.replace("{{count}}", String(totalAttempts))}</span>
            <span className="opacity-30">·</span>
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
          userMove={showAnswer ? null : (attempt?.userMove ?? null)}
          highlight={showAnswer && !hasSolution ? puzzle.correct : undefined}
          extraStones={extraStones}
          disabled
          cropToStones={puzzle.boardSize === 19}
          boardStyle="dark"
        />
      </div>
      <div className="flex flex-col gap-2 text-center text-sm text-white/45">
        <p>{t.result.boardCoordinateHint}</p>
        <p>{t.result.keyboardShortcuts}</p>
      </div>

      <div className="flex items-center justify-center gap-3 flex-wrap">
        {!correct && (
          <LocalizedLink
            href={retryPath}
            className="px-5 py-2 rounded-full bg-white/10 text-white text-sm font-medium hover:bg-[#00f2ff] hover:text-black transition-colors"
          >
            {t.result.retry}
          </LocalizedLink>
        )}

        {!hasSolution && (
          <button
            type="button"
            onClick={() => {
              if (showAnswer) {
                closeSolutionView();
              } else {
                setShowAnswer(true);
              }
            }}
            className="px-4 py-2 rounded-full border border-white/10 text-sm text-white/60 hover:text-white transition-colors"
          >
            {showAnswer ? t.result.hideAnswer : t.result.viewAnswer}
          </button>
        )}

        {hasSolution && (
          <>
            {!isPlaying && solutionStep === 0 && (
              <button
                type="button"
                onClick={handlePlay}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#00f2ff] text-black text-sm font-medium hover:opacity-90 transition-opacity"
              >
                <Play className="h-3.5 w-3.5" />
                {t.result.playSolution}
              </button>
            )}

            {(solutionStep > 0 || isPlaying) && (
              <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-1 py-1">
                <button
                  type="button"
                  onClick={() => handleStep(-1)}
                  disabled={solutionStep <= 0}
                  className="p-1.5 rounded-full hover:bg-white/10 disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm text-white/50 px-1 min-w-[3ch] text-center">
                  {solutionStep} / {puzzle.solutionSequence?.length}
                </span>
                <button
                  type="button"
                  onClick={() => handleStep(1)}
                  disabled={solutionStep >= (puzzle.solutionSequence?.length ?? 0)}
                  className="p-1.5 rounded-full hover:bg-white/10 disabled:opacity-30 transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </>
        )}

        <LocalizedLink
          href="/"
          className="px-5 py-2 rounded-full bg-white/10 text-white text-sm font-medium hover:bg-[#00f2ff] hover:text-black transition-colors"
        >
          {t.result.backToHome}
        </LocalizedLink>
      </div>

      <div className="flex items-center justify-center">
        <ShareCard puzzle={puzzle} correct={correct} />
      </div>

      {/* Solution notes are only shown for curated puzzles — library imports
          have a generic placeholder note which is not worth the visual space. */}
      {showAnswer && puzzle.isCurated !== false && (
        <section className="rounded-xl border border-white/10 bg-white/5 p-5">
          <div className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-[#00f2ff]/70">
            {t.result.curatedNote}
          </div>
          <div className="text-sm leading-relaxed text-white/60">
            {localized(puzzle.solutionNote, locale)}
          </div>
        </section>
      )}

      {/* AI coach stays gated: curated puzzles are always allowed, while
          library/imported puzzles must pass the quality bar and land in the
          approved allowlist before the coach is shown. */}
      {attempt?.userMove && coachAccess.available && (
        <CoachDialogue puzzleId={puzzle.id} userMove={attempt.userMove} isCorrect={correct} />
      )}

      {attempt?.userMove && !coachAccess.available && (
        <section className="rounded-xl border border-white/10 bg-white/5 p-5">
          <div className="text-sm leading-relaxed text-white/60">{t.result.coachLimited}</div>
        </section>
      )}
    </div>
  );
}

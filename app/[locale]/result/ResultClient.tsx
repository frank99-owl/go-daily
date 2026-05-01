"use client";

import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import dynamic from "next/dynamic";

import { GoBoard } from "@/components/GoBoard";
import { LocalizedLink } from "@/components/LocalizedLink";

const CoachDialogue = dynamic(
  () => import("@/components/CoachDialogue").then((m) => m.CoachDialogue),
  {
    loading: () => <div className="h-48 animate-pulse rounded-lg bg-ink/5" />,
  },
);
const ShareCard = dynamic(() => import("@/components/ShareCard").then((m) => m.ShareCard), {
  loading: () => <div className="h-64 animate-pulse rounded-lg bg-ink/5" />,
});
import { useLocale } from "@/lib/i18n/i18n";
import { localePath } from "@/lib/i18n/localePath";
import { localized } from "@/lib/i18n/localized";
import { attemptKey } from "@/lib/storage/attemptKey";
import {
  getAttemptFor,
  getAttemptsFor,
  loadAttempts,
  replaceAttempts,
} from "@/lib/storage/storage";
import type { AttemptRecord, PublicPuzzle, PuzzleReveal, Stone } from "@/types";

type PuzzleRevealResponse = Partial<PuzzleReveal> & {
  error?: string;
};

type PuzzleAttemptResponse = {
  correct?: boolean;
  revealToken?: string;
  error?: string;
};

function normalizeReveal(data: PuzzleRevealResponse): PuzzleReveal {
  if (!Array.isArray(data.correct) || !data.solutionNote) {
    throw new Error("Invalid reveal response.");
  }

  return {
    correct: data.correct,
    solutionNote: data.solutionNote,
    ...(data.solutionSequence ? { solutionSequence: data.solutionSequence } : {}),
  };
}

export function ResultClient({
  initialPuzzle,
  todayPuzzleId,
}: {
  initialPuzzle: PublicPuzzle;
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
  const [reveal, setReveal] = useState<PuzzleReveal | null>(null);
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
    const legacyAttempt = attempt;
    if (!legacyAttempt || legacyAttempt.revealToken || !legacyAttempt.userMove) return;
    const attemptToUpgrade = legacyAttempt;

    let cancelled = false;

    async function refreshAttemptToken(attemptToRefresh: AttemptRecord): Promise<AttemptRecord> {
      try {
        const response = await fetch("/api/puzzle/attempt", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            puzzleId: puzzle.id,
            userMove: attemptToRefresh.userMove,
          }),
        });
        const data = (await response.json()) as PuzzleAttemptResponse;
        if (!response.ok) {
          throw new Error(data.error ?? `Request failed (${response.status})`);
        }
        if (typeof data.correct !== "boolean" || !data.revealToken) {
          throw new Error("Invalid attempt response.");
        }

        const upgraded: AttemptRecord = {
          ...attemptToRefresh,
          correct: data.correct,
          revealToken: data.revealToken,
        };
        const key = attemptKey(attemptToRefresh);
        const all = loadAttempts();
        replaceAttempts(all.map((item) => (attemptKey(item) === key ? upgraded : item)));
        return upgraded;
      } catch (err) {
        console.error("[puzzle] failed to refresh attempt token", err);
        throw err;
      }
    }

    async function upgradeLegacyAttempt() {
      try {
        const upgraded = await refreshAttemptToken(attemptToUpgrade);
        if (!cancelled) {
          setAttempt(upgraded);
          setHistory(getAttemptsFor(puzzle.id));
        }
      } catch (err) {
        console.error("[puzzle] failed to upgrade legacy attempt", err);
      }
    }

    void upgradeLegacyAttempt();

    return () => {
      cancelled = true;
    };
  }, [attempt, puzzle.id]);

  useEffect(() => {
    if (!attempt?.revealToken) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReveal(null);
      return;
    }

    let cancelled = false;
    const attemptToReveal = attempt;
    const revealToken = attempt.revealToken;

    async function revealWithToken(token: string): Promise<PuzzleReveal> {
      const response = await fetch("/api/puzzle/reveal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          puzzleId: puzzle.id,
          revealToken: token,
        }),
      });
      const data = (await response.json()) as PuzzleRevealResponse;
      if (!response.ok) {
        throw new Error(data.error ?? `Request failed (${response.status})`);
      }
      return normalizeReveal(data);
    }

    async function refreshAttemptToken(attemptToRefresh: AttemptRecord): Promise<AttemptRecord> {
      if (!attemptToRefresh.userMove) {
        throw new Error("Cannot refresh reveal token without a recorded move.");
      }

      const response = await fetch("/api/puzzle/attempt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          puzzleId: puzzle.id,
          userMove: attemptToRefresh.userMove,
        }),
      });
      const data = (await response.json()) as PuzzleAttemptResponse;
      if (!response.ok) {
        throw new Error(data.error ?? `Request failed (${response.status})`);
      }
      if (typeof data.correct !== "boolean" || !data.revealToken) {
        throw new Error("Invalid attempt response.");
      }

      const refreshed: AttemptRecord = {
        ...attemptToRefresh,
        correct: data.correct,
        revealToken: data.revealToken,
      };
      const key = attemptKey(attemptToRefresh);
      const all = loadAttempts();
      replaceAttempts(all.map((item) => (attemptKey(item) === key ? refreshed : item)));
      return refreshed;
    }

    async function loadReveal() {
      try {
        let nextReveal: PuzzleReveal;
        try {
          nextReveal = await revealWithToken(revealToken);
        } catch (err) {
          if (!attemptToReveal.userMove) throw err;
          const refreshedAttempt = await refreshAttemptToken(attemptToReveal);
          nextReveal = await revealWithToken(refreshedAttempt.revealToken as string);
          if (!cancelled) {
            setAttempt(refreshedAttempt);
            setHistory(getAttemptsFor(puzzle.id));
          }
        }

        if (!cancelled) {
          setReveal(nextReveal);
        }
      } catch (err) {
        console.error("[puzzle] failed to reveal solution", err);
        if (!cancelled) {
          setReveal(null);
          setShowAnswer(false);
          setSolutionStep(0);
          setIsPlaying(false);
        }
      }
    }

    void loadReveal();

    return () => {
      cancelled = true;
    };
  }, [attempt, puzzle.id]);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  // Auto-advance when playing.
  useEffect(() => {
    if (!isPlaying || !reveal?.solutionSequence) return;
    if (solutionStep >= reveal.solutionSequence.length) {
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
  }, [isPlaying, solutionStep, reveal]);

  if (!puzzle) {
    return (
      <p className="text-white/50">
        Puzzle not found.{" "}
        <LocalizedLink href="/" className="underline text-[var(--color-accent)]">
          {t.result.backToToday}
        </LocalizedLink>
      </p>
    );
  }

  const correct = attempt?.correct ?? false;
  const hasReveal = !!reveal;
  const hasSolution = !!reveal?.solutionSequence?.length;

  // History tally across ALL attempts on this puzzle (not just today). Shows
  // the "Attempt N · X correct, Y wrong" banner — LeetCode-style submission count.
  const totalAttempts = history.length;
  const correctCount = history.filter((a) => a.correct).length;
  const wrongCount = totalAttempts - correctCount;

  // Build extra stones for the board (solution sequence up to current step).
  const extraStones: Stone[] =
    showAnswer && hasSolution ? (reveal?.solutionSequence ?? []).slice(0, solutionStep) : [];

  const handlePlay = () => {
    if (!reveal?.solutionSequence?.length) return;
    setShowAnswer(true);
    setSolutionStep(1);
    setIsPlaying(true);
  };

  const handleStep = (delta: number) => {
    if (!reveal?.solutionSequence) return;
    const max = reveal.solutionSequence.length;
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
          highlight={showAnswer && !hasSolution && reveal ? reveal.correct : undefined}
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
            className="px-5 py-2 rounded-full bg-white/10 text-white text-sm font-medium hover:bg-[var(--color-accent)] hover:text-black transition-colors"
          >
            {t.result.retry}
          </LocalizedLink>
        )}

        {hasReveal && !hasSolution && (
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

        {hasReveal && hasSolution && (
          <>
            {!isPlaying && solutionStep === 0 && (
              <button
                type="button"
                onClick={handlePlay}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[var(--color-accent)] text-black text-sm font-medium hover:opacity-90 transition-opacity"
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
                  {solutionStep} / {reveal?.solutionSequence?.length}
                </span>
                <button
                  type="button"
                  onClick={() => handleStep(1)}
                  disabled={solutionStep >= (reveal?.solutionSequence?.length ?? 0)}
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
          className="px-5 py-2 rounded-full bg-white/10 text-white text-sm font-medium hover:bg-[var(--color-accent)] hover:text-black transition-colors"
        >
          {t.result.backToHome}
        </LocalizedLink>
      </div>

      <div className="flex items-center justify-center">
        <ShareCard puzzle={puzzle} correct={correct} />
      </div>

      {/* Solution note — shown once the answer is revealed. */}
      {showAnswer && reveal && (
        <section className="rounded-xl border border-white/10 bg-white/5 p-5">
          <div className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-[color:var(--color-accent)]/70">
            {t.result.curatedNote}
          </div>
          <div className="text-sm leading-relaxed text-white/60">
            {localized(reveal.solutionNote, locale)}
          </div>
        </section>
      )}

      {attempt?.userMove && puzzle.coachAvailable && (
        <CoachDialogue puzzleId={puzzle.id} userMove={attempt.userMove} isCorrect={correct} />
      )}

      {attempt?.userMove && !puzzle.coachAvailable && (
        <section className="rounded-xl border border-white/10 bg-white/5 p-5">
          <div className="text-sm leading-relaxed text-white/60">{t.result.coachLimited}</div>
        </section>
      )}
    </div>
  );
}

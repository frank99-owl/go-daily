"use client";

import { motion } from "framer-motion";
import {
  BookOpenCheck,
  ChevronLeft,
  ChevronRight,
  Cloud,
  MessageCircleQuestion,
  Play,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { GoBoard } from "@/components/GoBoard";
import { LocalizedLink } from "@/components/LocalizedLink";
import { useCurrentUser } from "@/lib/auth/auth";
import { useLocale } from "@/lib/i18n/i18n";
import { localePath } from "@/lib/i18n/localePath";
import { localized } from "@/lib/i18n/localized";
import { track } from "@/lib/posthog/events";
import type { RecommendationType } from "@/lib/posthog/eventTypes";
import { getResultUnderstanding } from "@/lib/puzzle/mistakeReason";
import { getNextRecommendation } from "@/lib/puzzle/nextRecommendation";
import type { OnboardingLevel } from "@/lib/puzzle/onboardingLevels";
import { attemptKey } from "@/lib/storage/attemptKey";
import {
  getAttemptFor,
  getAttemptsFor,
  loadAttempts,
  replaceAttempts,
} from "@/lib/storage/storage";
import type { AttemptRecord, PublicCoachAccess, PublicPuzzle, PuzzleReveal, Stone } from "@/types";

const CoachDialogue = dynamic(
  () => import("@/components/CoachDialogue").then((m) => m.CoachDialogue),
  {
    loading: () => <div className="h-48 animate-pulse rounded-lg bg-ink/5" />,
  },
);
const ShareCard = dynamic(() => import("@/components/ShareCard").then((m) => m.ShareCard), {
  loading: () => <div className="h-64 animate-pulse rounded-lg bg-ink/5" />,
});

export type ResultSource = "result" | "onboarding";

type PuzzleRevealResponse = Partial<PuzzleReveal> & {
  error?: string;
};

type PuzzleAttemptResponse = {
  correct?: boolean;
  revealToken?: string;
  error?: string;
};

type RandomPuzzleResponse = {
  puzzleId?: string;
  error?: string;
};

function fallbackCoachAccess(coachAvailable: boolean): PublicCoachAccess {
  return {
    available: coachAvailable,
    reason: coachAvailable ? "approved" : "restricted",
    contentTier: coachAvailable ? "coach-ready" : "basic-explained",
    qualityTier: coachAvailable ? "coach-ready" : "explained",
    hasVariationSupport: coachAvailable,
    capabilities: {
      staticExplanation: true,
      basicCoach: coachAvailable,
      fullCoach: coachAvailable,
      variationQuestions: false,
    },
  };
}

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

async function refreshAttemptToken(
  puzzleId: string,
  attemptToRefresh: AttemptRecord,
): Promise<AttemptRecord> {
  if (!attemptToRefresh.userMove) {
    throw new Error("Cannot refresh attempt token without a recorded move.");
  }

  const response = await fetch("/api/puzzle/attempt", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      puzzleId,
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
}

export function ResultClient({
  initialPuzzle,
  todayPuzzleId,
  source = "result",
  onboardingLevel,
}: {
  initialPuzzle: PublicPuzzle;
  todayPuzzleId: string;
  source?: ResultSource;
  onboardingLevel?: OnboardingLevel;
}) {
  const router = useRouter();
  const puzzle = initialPuzzle;
  const { t, locale } = useLocale();
  const coachAccess = puzzle.coachAccess ?? fallbackCoachAccess(puzzle.coachAvailable);
  const { user, loading: userLoading } = useCurrentUser();
  const resultAnalyticsSource = source === "onboarding" ? "onboarding_result" : "result";
  const retryPath =
    puzzle.id === todayPuzzleId ? "/today" : `/puzzles/${encodeURIComponent(puzzle.id)}`;
  const retryHref = localePath(locale, retryPath);
  const resultPath =
    source === "onboarding"
      ? `/result?id=${encodeURIComponent(puzzle.id)}&source=onboarding${
          onboardingLevel ? `&level=${onboardingLevel}` : ""
        }`
      : `/result?id=${encodeURIComponent(puzzle.id)}`;
  const loginHref = `/login?next=${encodeURIComponent(localePath(locale, resultPath))}`;
  const [attempt, setAttempt] = useState<AttemptRecord | null>(null);
  const [history, setHistory] = useState<AttemptRecord[]>([]);
  const [allAttempts, setAllAttempts] = useState<AttemptRecord[]>([]);
  const [reveal, setReveal] = useState<PuzzleReveal | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [solutionStep, setSolutionStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [nextPuzzlePending, setNextPuzzlePending] = useState(false);
  const [nextPuzzleError, setNextPuzzleError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const signupPromptTrackedRef = useRef(false);
  const resultViewedTrackedRef = useRef(false);

  useEffect(() => {
    if (!puzzle) return;
    // Hydrating from localStorage on mount — both reads are cheap snapshots.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAttempt(getAttemptFor(puzzle.id));
    setHistory(getAttemptsFor(puzzle.id));
    setAllAttempts(loadAttempts());
  }, [puzzle]);

  // Safety: this effect cannot loop. (1) The guard bails once `revealToken`
  // exists, and `setAttempt(upgraded)` adds exactly that field. (2) On API
  // failure `setAttempt` is never called, so `attempt` (and thus the dep
  // array) stays identical — React skips the re-run. (3) Attempts without
  // `userMove` are skipped outright.
  useEffect(() => {
    const legacyAttempt = attempt;
    if (!legacyAttempt || legacyAttempt.revealToken || !legacyAttempt.userMove) return;
    const attemptToUpgrade = legacyAttempt;

    let cancelled = false;

    async function upgradeLegacyAttempt() {
      try {
        const upgraded = await refreshAttemptToken(puzzle.id, attemptToUpgrade);
        if (!cancelled) {
          setAttempt(upgraded);
          setHistory(getAttemptsFor(puzzle.id));
          setAllAttempts(loadAttempts());
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

    async function loadReveal() {
      try {
        let nextReveal: PuzzleReveal;
        try {
          nextReveal = await revealWithToken(revealToken);
        } catch (err) {
          if (!attemptToReveal.userMove) throw err;
          const refreshedAttempt = await refreshAttemptToken(puzzle.id, attemptToReveal);
          nextReveal = await revealWithToken(refreshedAttempt.revealToken as string);
          if (!cancelled) {
            setAttempt(refreshedAttempt);
            setHistory(getAttemptsFor(puzzle.id));
            setAllAttempts(loadAttempts());
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

  useEffect(() => {
    if (userLoading || user || signupPromptTrackedRef.current) return;
    signupPromptTrackedRef.current = true;
    track("result_signup_prompt_view", { locale, source: resultAnalyticsSource });
  }, [locale, resultAnalyticsSource, user, userLoading]);

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

  const correct = attempt?.correct ?? false;
  const contentTier = coachAccess.contentTier;
  const hasReveal = !!reveal;
  const hasSolution = !!reveal?.solutionSequence?.length;
  const resultUnderstanding = reveal
    ? getResultUnderstanding({
        tag: puzzle.tag,
        difficulty: puzzle.difficulty,
        boardSize: puzzle.boardSize,
        stones: puzzle.stones,
        correctMoves: reveal.correct,
        userMove: attempt?.userMove ?? null,
        correct,
      })
    : null;
  const understandingCopy = resultUnderstanding
    ? t.result.understanding.reasons[resultUnderstanding.id]
    : null;
  const recommendationAttempts = allAttempts.length > 0 ? allAttempts : attempt ? [attempt] : [];
  const nextRecommendation = getNextRecommendation({
    puzzle: {
      id: puzzle.id,
      difficulty: puzzle.difficulty,
      tag: puzzle.tag,
    },
    correct,
    mistakeReasonId: resultUnderstanding?.id ?? null,
    attempts: recommendationAttempts,
    onboardingLevel: source === "onboarding" ? (onboardingLevel ?? null) : null,
  });
  const recommendationCopy = t.result.nextRecommendation.reasons[nextRecommendation.reasonId];
  const nextPracticeLabel = nextPuzzlePending
    ? t.result.nextRecommendation.cta.loading
    : nextRecommendation.difficultyHint === "step-up"
      ? t.result.nextRecommendation.cta.stepUp
      : nextRecommendation.targetTag
        ? t.result.nextRecommendation.cta.sameTopic
        : t.result.nextRecommendation.cta.sameLevel;
  const coachPrompts = [
    t.result.coachPromptMainLine,
    t.result.coachPromptWhyWrong,
    t.result.coachPromptPattern,
    t.result.coachPromptNextJudgment,
  ];

  // History tally across ALL attempts on this puzzle (not just today). Shows
  // the "Attempt N · X correct, Y wrong" banner — LeetCode-style submission count.
  const totalAttempts = history.length;
  const correctCount = history.filter((a) => a.correct).length;
  const wrongCount = totalAttempts - correctCount;
  const nextRecommendationType: RecommendationType = nextRecommendation.targetTag
    ? "same-topic"
    : nextRecommendation.difficultyHint === "step-up"
      ? "step-up"
      : "same-level";

  useEffect(() => {
    if (!attempt || resultViewedTrackedRef.current) return;
    resultViewedTrackedRef.current = true;
    track("result_viewed", {
      locale,
      source: resultAnalyticsSource,
      result: attempt.correct ? "correct" : "wrong",
      tag: puzzle.tag,
      difficulty: puzzle.difficulty,
      contentTier,
    });
  }, [attempt, contentTier, locale, puzzle.difficulty, puzzle.tag, resultAnalyticsSource]);

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

  const continueRecommendedPractice = async () => {
    if (nextPuzzlePending) return;
    setNextPuzzlePending(true);
    setNextPuzzleError(null);

    try {
      const attemptedPuzzleIds = Array.from(
        new Set([...loadAttempts().map((item) => item.puzzleId), puzzle.id]),
      );
      const requestBody = {
        attemptedPuzzleIds,
        level: nextRecommendation.targetLevel,
        ...(nextRecommendation.targetTag ? { tag: nextRecommendation.targetTag } : {}),
      };
      track("next_recommendation_clicked", {
        locale,
        source: resultAnalyticsSource,
        recommendationType: nextRecommendationType,
        level: nextRecommendation.targetLevel,
        ...(nextRecommendation.targetTag ? { tag: nextRecommendation.targetTag } : {}),
      });
      const response = await fetch("/api/puzzle/random", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const data = (await response.json()) as RandomPuzzleResponse;
      if (!response.ok) {
        throw new Error(data.error ?? `Request failed (${response.status})`);
      }
      if (!data.puzzleId) {
        throw new Error("Invalid random puzzle response.");
      }
      router.push(localePath(locale, `/puzzles/${encodeURIComponent(data.puzzleId)}`));
    } catch (err) {
      console.warn("[result] failed to continue recommended practice", err);
      setNextPuzzleError(err instanceof Error ? err.message : "Failed to pick the next puzzle.");
    } finally {
      setNextPuzzlePending(false);
    }
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

      {source === "onboarding" && (
        <section className="rounded-xl border border-[color:var(--color-accent)]/20 bg-[color:var(--color-accent)]/[0.06] p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.2em] text-[color:var(--color-accent)]">
                <BookOpenCheck className="h-3.5 w-3.5" />
                {t.onboarding.resultEyebrow}
              </div>
              <h2 className="font-[family-name:var(--font-display)] text-2xl text-white">
                {correct ? t.onboarding.resultTitleCorrect : t.onboarding.resultTitleWrong}
              </h2>
              <p className="max-w-2xl text-sm leading-relaxed text-white/60">
                {correct ? t.onboarding.resultBodyCorrect : t.onboarding.resultBodyWrong}
              </p>
            </div>
            <div className="grid min-w-[12rem] gap-2 text-xs text-white/55">
              <span>{t.onboarding.resultStepSubmitted}</span>
              <span>{t.onboarding.resultStepExplanation}</span>
              <span>{t.onboarding.resultStepReview}</span>
            </div>
          </div>
        </section>
      )}

      <div className="mx-auto">
        <GoBoard
          size={puzzle.boardSize}
          stones={puzzle.stones}
          toPlay={puzzle.toPlay}
          userMove={showAnswer ? null : (attempt?.userMove ?? null)}
          highlight={showAnswer && !hasSolution && reveal ? reveal.correct : undefined}
          extraStones={extraStones}
          disabled
          boardStyle="dark"
        />
      </div>
      <div className="flex flex-col gap-2 text-center text-sm text-white/45">
        <p>{t.result.boardCoordinateHint}</p>
        <p>{t.result.keyboardShortcuts}</p>
      </div>

      <section className="rounded-xl border border-white/10 bg-white/[0.04] p-5">
        <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-[color:var(--color-accent)]/75">
          <BookOpenCheck className="h-3.5 w-3.5" />
          {t.result.explanationTitle}
        </div>
        {hasReveal ? (
          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-white/70">
              {correct ? t.result.explanationCorrectLead : t.result.explanationWrongLead}
            </p>
            <p className="text-sm leading-relaxed text-white/60">
              {localized(reveal.solutionNote, locale).replace(/^\[SYSTEM ANCHOR\]\s*/, "")}
            </p>
          </div>
        ) : (
          <div className="space-y-2" aria-live="polite">
            <div className="h-3 w-3/4 animate-pulse rounded bg-white/10" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-white/10" />
            <p className="pt-1 text-sm text-white/45">{t.result.explanationLoading}</p>
          </div>
        )}
      </section>

      {resultUnderstanding && understandingCopy && (
        <section className="rounded-xl border border-white/10 bg-white/[0.04] p-5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-[color:var(--color-accent)]/75">
              <BookOpenCheck className="h-3.5 w-3.5" />
              {resultUnderstanding.mode === "mistake"
                ? t.result.understanding.mistakeEyebrow
                : t.result.understanding.trainingEyebrow}
            </div>
            <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[11px] text-white/45">
              {t.result.understanding.confidence[resultUnderstanding.confidence]}
            </span>
          </div>
          <div className="space-y-2">
            <h2 className="text-sm font-medium text-white">{understandingCopy.title}</h2>
            <p className="text-sm leading-relaxed text-white/60">
              {resultUnderstanding.mode === "mistake"
                ? understandingCopy.mistake
                : understandingCopy.training}
            </p>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-[color:var(--color-accent)]/20 bg-[color:var(--color-accent)]/[0.05] p-5">
        <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-[color:var(--color-accent)]/75">
          <BookOpenCheck className="h-3.5 w-3.5" />
          {t.result.nextRecommendation.eyebrow}
        </div>
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-white">{recommendationCopy.title}</h2>
          <p className="text-sm leading-relaxed text-white/60">{recommendationCopy.body}</p>
          {nextRecommendation.includeReviewPrompt && (
            <p className="text-sm leading-relaxed text-white/50">
              {t.result.nextRecommendation.reviewPrompt.replace(
                "{{count}}",
                String(nextRecommendation.reviewBacklogCount),
              )}
            </p>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              void continueRecommendedPractice();
            }}
            disabled={nextPuzzlePending}
            className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-50"
          >
            {nextPracticeLabel}
          </button>
          {(nextRecommendation.includeReviewPrompt || !correct) && (
            <LocalizedLink
              href="/review"
              className="rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-white/65 transition-colors hover:border-white/25 hover:text-white"
            >
              {t.result.nextRecommendation.reviewCta}
            </LocalizedLink>
          )}
          {nextPuzzleError && (
            <span className="text-sm text-[color:var(--color-warn)]" role="alert">
              {nextPuzzleError}
            </span>
          )}
        </div>
      </section>

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
          href={source === "onboarding" ? "/review" : "/"}
          className="px-5 py-2 rounded-full bg-white/10 text-white text-sm font-medium hover:bg-[var(--color-accent)] hover:text-black transition-colors"
        >
          {source === "onboarding" ? t.result.openReview : t.result.backToHome}
        </LocalizedLink>
      </div>

      <section className="rounded-xl border border-white/10 bg-white/[0.04] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/20 text-[color:var(--color-accent)]">
              <Cloud className="h-4 w-4" />
            </span>
            <div className="space-y-1">
              <h2 className="text-sm font-medium text-white">{t.result.saveTitle}</h2>
              <p className="text-sm leading-relaxed text-white/55">
                {user ? t.result.saveBodySignedIn : t.result.saveBodyGuest}
              </p>
            </div>
          </div>
          <LocalizedLink
            href={user ? "/review" : loginHref}
            onClick={() =>
              track("review_saved_prompt_clicked", {
                locale,
                source: resultAnalyticsSource,
              })
            }
            className="self-start rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90 sm:self-center"
          >
            {user ? t.result.openReview : t.result.saveCtaGuest}
          </LocalizedLink>
        </div>
      </section>

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
            {localized(reveal.solutionNote, locale).replace(/^\[SYSTEM ANCHOR\]\s*/, "")}
          </div>
        </section>
      )}

      {attempt?.userMove && (
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-white">
            <MessageCircleQuestion className="h-4 w-4 text-[color:var(--color-accent)]" />
            {t.result.coachPromptTitle}
          </div>
          <CoachDialogue
            puzzleId={puzzle.id}
            userMove={attempt.userMove}
            coachAccess={coachAccess}
            suggestedPrompts={coachPrompts}
            suggestedPromptSource={resultAnalyticsSource}
          />
        </section>
      )}
    </div>
  );
}

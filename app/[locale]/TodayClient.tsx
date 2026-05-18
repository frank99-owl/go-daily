"use client";

import { Brain, CheckCircle2, Circle, Lightbulb, Shuffle, Target } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { GoBoard } from "@/components/GoBoard";
import { LocalizedLink } from "@/components/LocalizedLink";
import { PuzzleHeader } from "@/components/PuzzleHeader";
import { useCurrentUser } from "@/lib/auth/auth";
import { useLocale } from "@/lib/i18n/i18n";
import { localePath } from "@/lib/i18n/localePath";
import { track } from "@/lib/posthog/events";
import { type OnboardingLevel, ONBOARDING_LEVELS } from "@/lib/puzzle/onboardingLevels";
import {
  saveOnboardingPreference,
  saveOnboardingPreferenceToAccount,
} from "@/lib/puzzle/onboardingPreference";
import { createAttemptRecord, loadAttempts, saveAttempt } from "@/lib/storage/storage";
import { createSyncStorage } from "@/lib/storage/syncStorage";
import type { Coord, PublicPuzzle } from "@/types";

type PuzzleAttemptResponse = {
  puzzleId?: string;
  userMove?: Coord;
  correct?: boolean;
  revealToken?: string;
  error?: string;
};

type RandomPuzzleResponse = {
  puzzleId?: string;
  error?: string;
};

export function TodayClient({
  puzzle,
  metaLabel,
  mode = "practice",
  onboardingLevel = "beginner",
  dailyLevel = "beginner",
  showRandomAction = false,
}: {
  puzzle: PublicPuzzle;
  metaLabel?: string;
  mode?: "practice" | "onboarding";
  onboardingLevel?: OnboardingLevel;
  dailyLevel?: OnboardingLevel;
  showRandomAction?: boolean;
}) {
  const router = useRouter();
  const { t, locale } = useLocale();
  const { user } = useCurrentUser();
  const [pending, setPending] = useState<Coord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [randomPending, setRandomPending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [randomError, setRandomError] = useState<string | null>(null);
  const [hintIndex, setHintIndex] = useState(0);
  const startedAtRef = useRef(0);
  const startedTrackedRef = useRef<string | null>(null);
  const firstMoveTrackedRef = useRef(false);

  const syncStorage = useMemo(() => createSyncStorage(user?.id ?? null), [user?.id]);
  const source = mode === "onboarding" ? "onboarding" : metaLabel ? "today" : "library";
  const contentTier = puzzle.coachAccess?.contentTier ?? (puzzle.coachAvailable ? "coach-ready" : "basic-explained");
  const onboardingHints = t.onboarding.hints;

  useEffect(() => {
    startedAtRef.current = Date.now();
    firstMoveTrackedRef.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHintIndex(0);

    if (startedTrackedRef.current === puzzle.id) return;
    startedTrackedRef.current = puzzle.id;
    if (mode === "onboarding")
      track("onboarding_started", { locale, level: onboardingLevel, source: "onboarding" });
    track("puzzle_started", {
      locale,
      source,
      tag: puzzle.tag,
      difficulty: puzzle.difficulty,
      contentTier,
    });
  }, [contentTier, locale, mode, onboardingLevel, puzzle.difficulty, puzzle.id, puzzle.tag, source]);

  useEffect(() => {
    if (mode === "onboarding") {
      saveOnboardingPreference(onboardingLevel);
      if (user?.id) {
        void saveOnboardingPreferenceToAccount(onboardingLevel);
      }
      return;
    }

    if (showRandomAction) {
      saveOnboardingPreference(dailyLevel);
    }
  }, [dailyLevel, mode, onboardingLevel, showRandomAction, user?.id]);

  const selectMove = (coord: Coord) => {
    setPending(coord);
    if (firstMoveTrackedRef.current) return;
    firstMoveTrackedRef.current = true;
    if (mode === "onboarding") {
      track("first_move_played", { locale, level: onboardingLevel, source: "onboarding" });
    }
  };

  const submit = async () => {
    if (!pending || submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    let data: PuzzleAttemptResponse;
    try {
      const response = await fetch("/api/puzzle/attempt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          puzzleId: puzzle.id,
          userMove: pending,
        }),
      });
      data = (await response.json()) as PuzzleAttemptResponse;
      if (!response.ok) {
        throw new Error(data.error ?? `Request failed (${response.status})`);
      }
      if (typeof data.correct !== "boolean" || !data.revealToken) {
        throw new Error("Invalid attempt response.");
      }
    } catch (err) {
      console.error("[puzzle] failed to submit attempt", err);
      setSubmitError(err instanceof Error ? err.message : "Failed to submit move.");
      setSubmitting(false);
      return;
    }

    const record = createAttemptRecord({
      puzzleId: puzzle.id,
      userMove: pending,
      correct: data.correct,
      revealToken: data.revealToken,
    });

    try {
      await syncStorage.saveAttempt(record);
    } catch (err) {
      console.error("[sync] unavailable, falling back to local storage", err);
      saveAttempt(record);
    }

    track("puzzle_solved", {
      locale,
      result: data.correct ? "correct" : "wrong",
      durationMs: Date.now() - startedAtRef.current,
      source,
      tag: puzzle.tag,
      difficulty: puzzle.difficulty,
      contentTier,
    });
    if (mode === "onboarding") {
      track("first_puzzle_completed", {
        locale,
        level: onboardingLevel,
        result: data.correct ? "correct" : "wrong",
        tag: puzzle.tag,
        difficulty: puzzle.difficulty,
        contentTier,
      });
    }

    const nextPath =
      mode === "onboarding"
        ? `/result?id=${encodeURIComponent(puzzle.id)}&source=onboarding&level=${onboardingLevel}`
        : `/result?id=${encodeURIComponent(puzzle.id)}`;
    router.push(localePath(locale, nextPath));
    setSubmitting(false);
  };

  const resetPending = () => {
    setPending(null);
    setSubmitError(null);
  };

  const pickRandomPuzzle = async () => {
    if (randomPending) return;
    setRandomPending(true);
    setRandomError(null);

    try {
      if (user?.id) {
        await syncStorage.sync();
      }
      const attemptedPuzzleIds = Array.from(
        new Set([...loadAttempts().map((attempt) => attempt.puzzleId), puzzle.id]),
      );
      const response = await fetch("/api/puzzle/random", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ attemptedPuzzleIds, level: dailyLevel }),
      });
      const data = (await response.json()) as RandomPuzzleResponse;
      if (!response.ok) {
        throw new Error(data.error ?? `Request failed (${response.status})`);
      }
      if (!data.puzzleId) {
        throw new Error("Invalid random puzzle response.");
      }
      track("next_recommendation_clicked", {
        locale,
        source: "today",
        recommendationType: "same-level",
        level: dailyLevel,
      });
      router.push(localePath(locale, `/puzzles/${encodeURIComponent(data.puzzleId)}`));
    } catch (err) {
      console.warn("[today] failed to pick random puzzle", err);
      setRandomError(err instanceof Error ? err.message : "Failed to pick a random puzzle.");
    } finally {
      setRandomPending(false);
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
      {mode === "onboarding" && (
        <OnboardingPracticePanel selectedLevel={onboardingLevel} moveSelected={!!pending} />
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PuzzleHeader puzzle={puzzle} metaLabel={metaLabel} />
        {showRandomAction && (
          <button
            type="button"
            onClick={() => {
              void pickRandomPuzzle();
            }}
            disabled={randomPending}
            title={t.home.randomPracticeTitle}
            aria-label={t.home.randomPracticeTitle}
            className="inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-white/55 transition-colors hover:border-[color:var(--color-accent)]/40 hover:text-white disabled:cursor-wait disabled:opacity-50"
          >
            <Shuffle className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t.home.randomPractice}</span>
          </button>
        )}
      </div>
      {randomError && (
        <p className="text-sm text-[color:var(--color-warn)]" role="alert">
          {randomError}
        </p>
      )}
      <div className="mx-auto">
        <GoBoard
          size={puzzle.boardSize}
          stones={puzzle.stones}
          toPlay={puzzle.toPlay}
          userMove={pending}
          onPlay={selectMove}
          boardStyle="dark"
          keyboardEnabled
          focusOnMount
        />
      </div>
      {mode === "onboarding" && (
        <section className="rounded-lg border border-[color:var(--color-accent)]/20 bg-[color:var(--color-accent)]/[0.06] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[color:var(--color-accent)]/25 bg-black/20 text-[color:var(--color-accent)]">
                <Lightbulb className="h-4 w-4" />
              </span>
              <div className="space-y-1">
                <h2 className="text-sm font-medium text-white">{t.onboarding.hintTitle}</h2>
                <p className="text-sm leading-relaxed text-white/65">
                  {onboardingHints[hintIndex]}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const nextHintIndex = Math.min(hintIndex + 1, onboardingHints.length - 1);
                setHintIndex(nextHintIndex);
                track("puzzle_hint_requested", {
                  locale,
                  source: "onboarding",
                  hintIndex: nextHintIndex,
                });
              }}
              disabled={hintIndex >= onboardingHints.length - 1}
              className="self-start rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-white/65 transition-colors hover:border-[color:var(--color-accent)]/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {hintIndex >= onboardingHints.length - 1
                ? t.onboarding.lastHint
                : t.onboarding.nextHint}
            </button>
          </div>
        </section>
      )}
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
          onClick={() => {
            void submit();
          }}
          disabled={!pending || submitting}
          className="px-5 py-2 rounded-full bg-white/10 text-white text-sm font-medium disabled:opacity-40 hover:bg-[var(--color-accent)] hover:text-black transition-colors"
        >
          {mode === "onboarding" ? t.onboarding.submitFirst : t.home.submit}
        </button>
      </div>
      {submitError && (
        <p className="text-center text-sm text-[color:var(--color-warn)]" role="alert">
          {submitError}
        </p>
      )}
    </div>
  );
}

function OnboardingPracticePanel({
  selectedLevel,
  moveSelected,
}: {
  selectedLevel: OnboardingLevel;
  moveSelected: boolean;
}) {
  const { t } = useLocale();
  const levels = t.onboarding.levels;
  const levelRanges = t.onboarding.levelRanges;
  const steps = [
    { label: t.onboarding.stepThink, done: true },
    { label: t.onboarding.stepMove, done: moveSelected },
    { label: t.onboarding.stepReview, done: false },
  ];

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-sm">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-accent)]/25 bg-[color:var(--color-accent)]/[0.08] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-[color:var(--color-accent)]">
            <Target className="h-3.5 w-3.5" />
            {t.onboarding.practiceEyebrow}
          </div>
          <div className="space-y-1.5">
            <h1 className="font-[family-name:var(--font-display)] text-2xl text-white sm:text-3xl">
              {t.onboarding.practiceTitle}
            </h1>
            <p className="text-sm leading-relaxed text-white/55">{t.onboarding.practiceSubtitle}</p>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3 lg:w-[22rem]">
          <div className="grid grid-cols-3 gap-2">
            {ONBOARDING_LEVELS.map((level) => {
              const active = level === selectedLevel;
              return (
                <LocalizedLink
                  key={level}
                  href={`/onboarding?level=${level}`}
                  aria-current={active ? "page" : undefined}
                  className={
                    "flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2 text-center transition-colors " +
                    (active
                      ? "border-[color:var(--color-accent)]/50 bg-[color:var(--color-accent)]/15 text-white"
                      : "border-white/10 bg-white/[0.03] text-white/55 hover:border-white/20 hover:text-white")
                  }
                >
                  <span className="text-xs font-medium">{levels[level]}</span>
                  <span className="text-[10px] leading-tight text-white/45">
                    {levelRanges[level]}
                  </span>
                </LocalizedLink>
              );
            })}
          </div>
          <div className="grid gap-2">
            {steps.map((step) => (
              <div key={step.label} className="flex items-center gap-2 text-xs text-white/55">
                {step.done ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-[color:var(--color-success)]" />
                ) : (
                  <Circle className="h-3.5 w-3.5 text-white/25" />
                )}
                <span>{step.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        {t.onboarding.valueProps.map((item) => (
          <div
            key={item}
            className="flex items-center gap-2 rounded-lg border border-white/8 bg-black/15 px-3 py-2 text-xs text-white/55"
          >
            <Brain className="h-3.5 w-3.5 shrink-0 text-[color:var(--color-accent)]/75" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

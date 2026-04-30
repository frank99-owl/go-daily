"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { GoBoard } from "@/components/GoBoard";
import { PuzzleHeader } from "@/components/PuzzleHeader";
import { useCurrentUser } from "@/lib/auth/auth";
import { useLocale } from "@/lib/i18n/i18n";
import { localePath } from "@/lib/i18n/localePath";
import { createAttemptRecord, saveAttempt } from "@/lib/storage/storage";
import { createSyncStorage } from "@/lib/storage/syncStorage";
import type { Coord, PublicPuzzle } from "@/types";

type PuzzleAttemptResponse = {
  puzzleId?: string;
  userMove?: Coord;
  correct?: boolean;
  revealToken?: string;
  error?: string;
};

export function TodayClient({ puzzle, metaLabel }: { puzzle: PublicPuzzle; metaLabel?: string }) {
  const router = useRouter();
  const { t, locale } = useLocale();
  const { user } = useCurrentUser();
  const [pending, setPending] = useState<Coord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const syncStorage = useMemo(() => createSyncStorage(user?.id ?? null), [user?.id]);

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

    router.push(localePath(locale, `/result?id=${encodeURIComponent(puzzle.id)}`));
    setSubmitting(false);
  };

  const resetPending = () => {
    setPending(null);
    setSubmitError(null);
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
          onClick={() => {
            void submit();
          }}
          disabled={!pending || submitting}
          className="px-5 py-2 rounded-full bg-white/10 text-white text-sm font-medium disabled:opacity-40 hover:bg-[#00f2ff] hover:text-black transition-colors"
        >
          {t.home.submit}
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

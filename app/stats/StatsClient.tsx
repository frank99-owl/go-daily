"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/lib/i18n";
import {
  computeAccuracy,
  computeStreak,
  loadAttempts,
} from "@/lib/storage";
import type { AttemptRecord } from "@/types";

export function StatsClient() {
  const { t } = useLocale();
  const [attempts, setAttempts] = useState<AttemptRecord[] | null>(null);

  useEffect(() => {
    // Hydrating from localStorage on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAttempts(loadAttempts());
  }, []);

  if (attempts === null) return null; // pre-hydration, avoid SSR/CSR mismatch

  if (attempts.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl">
          {t.stats.title}
        </h1>
        <p className="text-ink-2 text-sm">{t.stats.empty}</p>
      </div>
    );
  }

  const streak = computeStreak(attempts);
  const accuracy = computeAccuracy(attempts);
  const total = attempts.length;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl">
        {t.stats.title}
      </h1>
      <div className="grid grid-cols-3 gap-3">
        <Stat label={t.stats.streak} value={`${streak} ${t.stats.days}`} />
        <Stat label={t.stats.total} value={String(total)} />
        <Stat label={t.stats.accuracy} value={`${accuracy}%`} />
      </div>
      <ul className="flex flex-col gap-2 mt-4">
        {attempts
          .slice()
          .sort((a, b) => b.solvedAtMs - a.solvedAtMs)
          .map((a) => (
            <li
              key={a.puzzleId}
              className="flex items-center justify-between rounded-lg border border-[color:var(--color-line)] bg-white/60 px-4 py-3 text-sm"
            >
              <span className="text-ink">{a.date}</span>
              <span
                className={
                  a.correct
                    ? "text-[color:var(--color-success)]"
                    : "text-[color:var(--color-warn)]"
                }
              >
                {a.correct ? "✓" : "✗"}
              </span>
            </li>
          ))}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[color:var(--color-line)] bg-white/60 px-4 py-4">
      <div className="text-xs text-ink-2">{label}</div>
      <div className="font-[family-name:var(--font-display)] text-xl text-ink mt-1">
        {value}
      </div>
    </div>
  );
}

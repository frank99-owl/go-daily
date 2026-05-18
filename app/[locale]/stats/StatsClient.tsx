"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Heatmap } from "@/components/Heatmap";
import { useLocale } from "@/lib/i18n/i18n";
import { track } from "@/lib/posthog/events";
import type { MistakeReasonId } from "@/lib/puzzle/mistakeReason";
import { getTrainingInsights, type TrainingInsights } from "@/lib/puzzle/trainingInsights";
import { downloadExport, importUserData } from "@/lib/storage/exportData";
import { computeAccuracy, computeStreak, loadAttempts } from "@/lib/storage/storage";
import type { AttemptRecord, PuzzleSummary, PuzzleTag } from "@/types";

export function StatsClient({
  summaries = [],
  now = new Date(),
}: {
  summaries?: PuzzleSummary[];
  now?: Date;
}) {
  const { t, locale } = useLocale();
  const [attempts, setAttempts] = useState<AttemptRecord[] | null>(null);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(
    null,
  );
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // Hydrating from localStorage on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAttempts(loadAttempts());
  }, []);

  const insights = useMemo(
    () => getTrainingInsights({ attempts: attempts ?? [], summaries, now }),
    [attempts, summaries, now],
  );

  useEffect(() => {
    if (attempts === null) return;
    track("stats_page_viewed", {
      locale,
      source: "stats",
      result: attempts.length > 0 ? "has_attempts" : "empty",
    });
    track("review_recommendation_viewed", {
      locale,
      source: "stats",
      recommendationType: "review",
      ...(insights.weakTags[0] ? { tag: insights.weakTags[0].tag } : {}),
    });
  }, [attempts, insights.weakTags, locale]);

  if (attempts === null) return null; // pre-hydration, avoid SSR/CSR mismatch

  const openImportPicker = () => {
    fileInputRef.current?.click();
  };

  const handleImport: React.ChangeEventHandler<HTMLInputElement> = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setFeedback(null);

    try {
      const result = importUserData(await file.text());
      if (!result.ok) {
        setFeedback({
          kind: "error",
          message: t.stats.importError.replace("{{error}}", result.error ?? "Unknown error"),
        });
        return;
      }

      const refreshedAttempts = loadAttempts();
      setAttempts(refreshedAttempts);
      setFeedback({
        kind: "success",
        message: t.stats.importSuccess
          .replace("{{count}}", String(result.count ?? 0))
          .replace("{{total}}", String(result.total ?? refreshedAttempts.length)),
      });
    } finally {
      setIsImporting(false);
      event.target.value = "";
    }
  };

  if (attempts.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl text-white">
          {t.stats.title}
        </h1>
        <p className="text-white/50 text-sm">{t.stats.empty}</p>
        <StatsInsightPanel
          copy={t.stats.insights}
          insights={insights}
          mistakeReasonLabels={t.result.understanding.reasons}
          tagLabels={t.tags}
        />
        <BackupPanel
          description={t.stats.backupDescription}
          exportLabel={t.stats.export}
          feedback={feedback}
          importLabel={isImporting ? t.stats.importing : t.stats.import}
          inputRef={fileInputRef}
          onExport={downloadExport}
          onImport={openImportPicker}
          onImportFile={handleImport}
          title={t.stats.backupTitle}
        />
        <Heatmap attempts={attempts} />
      </div>
    );
  }

  const streak = computeStreak(attempts);
  const accuracy = computeAccuracy(attempts);
  const total = attempts.length;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-[family-name:var(--font-headline)] text-2xl sm:text-3xl text-white">
        {t.stats.title}
      </h1>
      <div className="grid grid-cols-3 gap-3">
        <Stat label={t.stats.streak} value={`${streak} ${t.stats.days}`} />
        <Stat label={t.stats.total} value={String(total)} />
        <Stat label={t.stats.accuracy} value={`${accuracy}%`} />
      </div>

      <StatsInsightPanel
        copy={t.stats.insights}
        insights={insights}
        mistakeReasonLabels={t.result.understanding.reasons}
        tagLabels={t.tags}
      />

      <BackupPanel
        description={t.stats.backupDescription}
        exportLabel={t.stats.export}
        feedback={feedback}
        importLabel={isImporting ? t.stats.importing : t.stats.import}
        inputRef={fileInputRef}
        onExport={downloadExport}
        onImport={openImportPicker}
        onImportFile={handleImport}
        title={t.stats.backupTitle}
      />

      <Heatmap attempts={attempts} />

      <ul className="flex flex-col gap-2 mt-2">
        {attempts
          .slice()
          .sort((a, b) => b.solvedAtMs - a.solvedAtMs)
          .map((a) => (
            <li
              key={`${a.puzzleId}-${a.solvedAtMs}`}
              className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm"
            >
              <span className="text-white/80">{a.date}</span>
              <span
                className={
                  a.correct ? "text-[color:var(--color-success)]" : "text-[color:var(--color-warn)]"
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

function StatsInsightPanel({
  insights,
  tagLabels,
  mistakeReasonLabels,
  copy,
}: {
  insights: TrainingInsights;
  tagLabels: Record<PuzzleTag, string>;
  mistakeReasonLabels: Record<MistakeReasonId, { title: string }>;
  copy: {
    title: string;
    weakTagsTitle: string;
    weakMistakesTitle: string;
    trendTitle: string;
    completionTitle: string;
    noWeakTags: string;
    noMistakeReasons: string;
    noTrend: string;
    noCompletion: string;
    trendValue: string;
    activeDays: string;
    completionValue: string;
    completionDetail: string;
  };
}) {
  const trend =
    insights.recentTrend.attempted > 0
      ? copy.trendValue
          .replace("{{correct}}", String(insights.recentTrend.correct))
          .replace("{{attempted}}", String(insights.recentTrend.attempted))
          .replace("{{accuracy}}", String(insights.recentTrend.accuracy))
      : copy.noTrend;
  const activeDays = copy.activeDays.replace("{{count}}", String(insights.recentTrend.activeDays));
  const completion =
    insights.reviewCompletion.rate === null
      ? copy.noCompletion
      : copy.completionValue.replace("{{rate}}", String(insights.reviewCompletion.rate));
  const completionDetail = copy.completionDetail
    .replace("{{completed}}", String(insights.reviewCompletion.completedCount))
    .replace("{{backlog}}", String(insights.reviewCompletion.backlogCount));

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="flex flex-col gap-5">
        <h2 className="font-[family-name:var(--font-headline)] text-lg text-white">{copy.title}</h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <InsightBlock title={copy.weakTagsTitle}>
            {insights.weakTags.length === 0 ? (
              <p className="text-sm text-white/45">{copy.noWeakTags}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {insights.weakTags.map((item) => (
                  <span
                    key={item.tag}
                    className="rounded-full border border-white/10 bg-black/15 px-2.5 py-1 text-sm text-white/70"
                  >
                    {tagLabels[item.tag]} · {item.wrongCount}
                  </span>
                ))}
              </div>
            )}
          </InsightBlock>

          <InsightBlock title={copy.weakMistakesTitle}>
            {insights.weakMistakeReasons.length === 0 ? (
              <p className="text-sm text-white/45">{copy.noMistakeReasons}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {insights.weakMistakeReasons.map((item) => (
                  <span
                    key={item.id}
                    className="rounded-full border border-white/10 bg-black/15 px-2.5 py-1 text-sm text-white/70"
                  >
                    {mistakeReasonLabels[item.id].title} · {item.count}
                  </span>
                ))}
              </div>
            )}
          </InsightBlock>

          <InsightBlock title={copy.trendTitle}>
            <p className="text-sm text-white/75">{trend}</p>
            {insights.recentTrend.attempted > 0 ? (
              <p className="mt-1 text-xs text-white/45">{activeDays}</p>
            ) : null}
          </InsightBlock>

          <InsightBlock title={copy.completionTitle}>
            <p className="text-sm text-white/75">{completion}</p>
            {insights.reviewCompletion.rate !== null ? (
              <p className="mt-1 text-xs text-white/45">{completionDetail}</p>
            ) : null}
          </InsightBlock>
        </div>
      </div>
    </section>
  );
}

function InsightBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/15 p-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-white/35">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-4">
      <div className="text-sm text-white/50">{label}</div>
      <div className="font-[family-name:var(--font-headline)] text-xl text-white mt-1">{value}</div>
    </div>
  );
}

function BackupPanel({
  title,
  description,
  exportLabel,
  importLabel,
  feedback,
  onExport,
  onImport,
  onImportFile,
  inputRef,
}: {
  title: string;
  description: string;
  exportLabel: string;
  importLabel: string;
  feedback: { kind: "success" | "error"; message: string } | null;
  onExport: () => void;
  onImport: () => void;
  onImportFile: React.ChangeEventHandler<HTMLInputElement>;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="font-[family-name:var(--font-headline)] text-lg text-white">{title}</h2>
          <p className="mt-1 text-sm text-white/60">{description}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onExport}
            className="px-4 py-2 rounded-full bg-white/10 text-white text-sm font-medium hover:bg-[var(--color-accent)] hover:text-black transition-colors"
          >
            {exportLabel}
          </button>
          <button
            type="button"
            onClick={onImport}
            className="px-4 py-2 rounded-full border border-white/10 text-sm text-white/80 hover:text-white transition-colors"
          >
            {importLabel}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={onImportFile}
          />
        </div>

        {feedback && (
          <p
            className={
              feedback.kind === "success"
                ? "text-sm text-[color:var(--color-success)]"
                : "text-sm text-[color:var(--color-warn)]"
            }
            role="status"
          >
            {feedback.message}
          </p>
        )}
      </div>
    </section>
  );
}

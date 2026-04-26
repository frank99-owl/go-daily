"use client";

import { useEffect, useRef, useState } from "react";

import { Heatmap } from "@/components/Heatmap";
import { downloadExport, importUserData } from "@/lib/storage/exportData";
import { useLocale } from "@/lib/i18n/i18n";
import { computeAccuracy, computeStreak, loadAttempts } from "@/lib/storage/storage";
import type { AttemptRecord } from "@/types";

export function StatsClient() {
  const { t } = useLocale();
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
            className="px-4 py-2 rounded-full bg-white/10 text-white text-sm font-medium hover:bg-[#00f2ff] hover:text-black transition-colors"
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

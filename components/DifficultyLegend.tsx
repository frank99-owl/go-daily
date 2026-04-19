"use client";

import { useLocale } from "@/lib/i18n";

export function DifficultyLegend() {
  const { t } = useLocale();

  const levels = [
    { stars: 1, range: "15K ~ 12K" },
    { stars: 2, range: "11K ~ 8K" },
    { stars: 3, range: "7K ~ 4K" },
    { stars: 4, range: "3K ~ 1D" },
    { stars: 5, range: "2D ~ 7D" },
  ];

  return (
    <div className="rounded-xl border border-[color:var(--color-line)] bg-white/60 p-4">
      <h3 className="text-sm font-medium text-ink mb-3">
        {t.puzzles?.filterDifficulty ?? "Difficulty"}
      </h3>
      <div className="flex flex-col gap-2">
        {levels.map((lv) => (
          <div key={lv.stars} className="flex items-center gap-3 text-xs">
            <span className="text-ink">
              {"★".repeat(lv.stars)}
              <span className="text-[color:var(--color-line)]">
                {"★".repeat(5 - lv.stars)}
              </span>
            </span>
            <span className="text-ink-2">{lv.range}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

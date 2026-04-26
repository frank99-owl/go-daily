"use client";

import { useLocale } from "@/lib/i18n/i18n";

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
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <h3 className="text-sm font-medium text-white mb-3">
        {t.puzzles?.filterDifficulty ?? "Difficulty"}
      </h3>
      <div className="flex flex-col gap-2">
        {levels.map((lv) => (
          <div key={lv.stars} className="flex items-center gap-3 text-sm">
            <span className="text-white/80">
              {"★".repeat(lv.stars)}
              <span className="text-white/20">{"★".repeat(5 - lv.stars)}</span>
            </span>
            <span className="text-white/50">{lv.range}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useLocale } from "@/lib/i18n";
import type { Locale } from "@/types";

const LABELS: Record<Locale, string> = {
  zh: "中",
  en: "EN",
  ja: "日",
  ko: "한",
};

const ORDER: Locale[] = ["zh", "en", "ja", "ko"];

export function LanguageToggle() {
  const { locale, setLocale } = useLocale();
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-full border border-[color:var(--color-line)] bg-white/60 p-0.5 text-xs"
      role="group"
      aria-label="Language"
    >
      {ORDER.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLocale(l)}
          className={
            "px-2 py-1 rounded-full transition-colors " +
            (locale === l
              ? "bg-ink text-paper"
              : "text-ink-2 hover:text-ink")
          }
          aria-pressed={locale === l}
        >
          {LABELS[l]}
        </button>
      ))}
    </div>
  );
}

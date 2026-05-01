"use client";

import { useEffect } from "react";

import { useLocale } from "@/lib/i18n/i18n";

export function PageError({ error, reset }: { error: Error; reset: () => void }) {
  const { t } = useLocale();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 pt-20 pb-8 sm:pt-24 sm:pb-12 text-center">
      <h2 className="text-2xl font-headline font-bold text-white mb-4">
        {t.errors.somethingWentWrong}
      </h2>
      <p className="text-white/60 mb-8 max-w-md mx-auto">{t.errors.boardMistake}</p>
      <button
        onClick={() => reset()}
        className="px-6 py-2 rounded-full bg-white/10 text-white text-sm font-medium hover:bg-[var(--color-accent)] hover:text-black transition-colors"
      >
        {t.errors.tryAgain}
      </button>
    </div>
  );
}

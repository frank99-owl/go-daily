"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

import { reportError } from "@/lib/errorReporting";
import { useLocale } from "@/lib/i18n/i18n";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useLocale();

  useEffect(() => {
    Sentry.captureException(error);
    reportError(error);
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <h2 className="text-3xl font-headline mb-4 font-bold text-ink">
        {t.errors.somethingWentWrong}
      </h2>
      <p className="text-lg text-ink/70 mb-8 max-w-md italic">{t.errors.boardMistake}</p>
      <button
        onClick={() => reset()}
        className="px-6 py-2 border border-ink/20 hover:border-ink hover:bg-ink hover:text-paper transition-colors duration-200 font-medium"
      >
        {t.errors.tryAgain}
      </button>
    </div>
  );
}

"use client";

import { LocalizedLink } from "@/components/LocalizedLink";
import { useLocale } from "@/lib/i18n/i18n";

export function NotFoundContent() {
  const { t } = useLocale();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <h2 className="text-4xl font-headline mb-4 font-bold text-ink">{t.errors.notFound}</h2>
      <p className="text-xl text-ink/70 mb-8 max-w-md italic">
        &ldquo;{t.errors.notFoundDescription}&rdquo;
      </p>
      <LocalizedLink
        href="/"
        className="px-6 py-2 border border-ink/20 hover:border-ink hover:bg-ink hover:text-paper transition-colors duration-200 font-medium"
      >
        {t.errors.returnHome}
      </LocalizedLink>
    </div>
  );
}

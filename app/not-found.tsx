import { headers } from "next/headers";
import Link from "next/link";

import { DEFAULT_LOCALE, isLocale, localePath } from "@/lib/i18n/localePath";
import { getMessages } from "@/lib/i18n/metadata";
import type { Locale } from "@/types";

export default async function NotFound() {
  const h = await headers();
  const rawLocale = h.get("x-locale");
  const locale: Locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const homePath = localePath(locale, "/");
  const t = getMessages(locale);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <h2 className="text-4xl font-headline mb-4 font-bold text-ink">{t.errors.notFound}</h2>
      <p className="text-xl text-ink/70 mb-8 max-w-md italic">
        &ldquo;{t.errors.notFoundDescription}&rdquo;
      </p>
      <Link
        href={homePath}
        className="px-6 py-2 border border-ink/20 hover:border-ink hover:bg-ink hover:text-paper transition-colors duration-200 font-medium"
      >
        {t.errors.returnHome}
      </Link>
    </div>
  );
}

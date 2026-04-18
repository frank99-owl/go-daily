"use client";

import Link from "next/link";
import { useLocale } from "@/lib/i18n";
import { LanguageToggle } from "./LanguageToggle";

export function Nav() {
  const { t } = useLocale();
  return (
    <header className="w-full border-b border-[color:var(--color-line)] bg-paper/80 backdrop-blur sticky top-0 z-20">
      <div className="mx-auto max-w-4xl flex items-center justify-between px-4 sm:px-6 h-14">
        <Link
          href="/"
          className="font-[family-name:var(--font-display)] text-lg tracking-tight text-ink"
        >
          {t.brand}
        </Link>
        <nav className="flex items-center gap-6 text-sm text-ink-2">
          <Link href="/" className="hover:text-ink transition-colors">
            {t.nav.today}
          </Link>
          <Link href="/stats" className="hover:text-ink transition-colors">
            {t.nav.stats}
          </Link>
          <LanguageToggle />
        </nav>
      </div>
    </header>
  );
}

"use client";

import { LocalizedLink } from "@/components/LocalizedLink";
import { useLocale } from "@/lib/i18n/i18n";

import { LanguageToggle } from "./LanguageToggle";
import { UserMenu } from "./UserMenu";

export function Nav() {
  const { t, locale } = useLocale();
  const isCjk = locale === "zh" || locale === "ja" || locale === "ko";

  const linkBase = [
    "whitespace-nowrap hover:text-[var(--color-accent)] transition-colors duration-500",
    isCjk ? "tracking-[0.14em]" : "tracking-[0.3em]",
  ].join(" ");

  return (
    <header className="fixed top-0 w-full z-50 bg-black/10 backdrop-blur-xl border-b border-white/5">
      <div className="mx-auto flex h-16 w-full max-w-[1800px] items-center justify-between px-4 sm:px-6 lg:px-8 xl:px-12">
        <LocalizedLink
          href="/"
          className="shrink-0 whitespace-nowrap font-[family-name:var(--font-headline)] text-xl tracking-[0.2em] text-white"
        >
          GO-DAILY
        </LocalizedLink>
        <div className="flex flex-1 items-center justify-end gap-4">
          <nav className="ml-12 hidden flex-nowrap items-center gap-7 text-xs font-light uppercase text-white/60 md:flex lg:ml-16 lg:gap-9 xl:gap-10">
            <LocalizedLink href="/" className={linkBase}>
              {t.nav.home}
            </LocalizedLink>
            <LocalizedLink href="/today" className={linkBase}>
              {t.nav.today}
            </LocalizedLink>
            <LocalizedLink href="/mentors" className={linkBase}>
              {t.nav.mentors}
            </LocalizedLink>
            <LocalizedLink href="/puzzles" className={linkBase}>
              {t.nav.puzzles}
            </LocalizedLink>
            <LocalizedLink href="/review" className={linkBase}>
              {t.nav.review}
            </LocalizedLink>
            <LocalizedLink href="/stats" className={linkBase}>
              {t.nav.stats}
            </LocalizedLink>
            <LocalizedLink href="/about" className={linkBase}>
              {t.nav.about}
            </LocalizedLink>
          </nav>
          <div className="w-3" />
          <LocalizedLink
            href="/pricing"
            className="whitespace-nowrap text-xs uppercase tracking-[0.2em] text-[var(--color-accent)] transition-opacity hover:opacity-80"
          >
            Pro
          </LocalizedLink>
          <div className="w-3" />
          <UserMenu />
          <div className="w-2" />
          <LanguageToggle />
        </div>
      </div>
    </header>
  );
}

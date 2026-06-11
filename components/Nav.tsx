"use client";

import { Menu, X } from "lucide-react";
import { Suspense, useState } from "react";

import { LocalizedLink } from "@/components/LocalizedLink";
import { useLocale } from "@/lib/i18n/i18n";

import { LanguageToggle } from "./LanguageToggle";
import { UserMenu } from "./UserMenu";

export function Nav() {
  const { t, locale } = useLocale();
  const [menuOpen, setMenuOpen] = useState(false);
  const isCjk = locale === "zh" || locale === "ja" || locale === "ko";

  const linkBase = [
    "whitespace-nowrap hover:text-[var(--color-accent)] transition-colors duration-500",
    isCjk ? "tracking-[0.14em]" : "tracking-[0.3em]",
  ].join(" ");

  const links = [
    ["/", t.nav.home],
    ["/today", t.nav.today],
    ["/mentors", t.nav.mentors],
    ["/puzzles", t.nav.puzzles],
    ["/review", t.nav.review],
    ["/stats", t.nav.stats],
    ["/about", t.nav.about],
  ] as const;

  return (
    <header className="fixed top-0 w-full z-50 bg-black/10 backdrop-blur-xl border-b border-white/5">
      <div className="mx-auto flex h-16 w-full max-w-[1800px] items-center justify-between px-4 sm:px-6 lg:px-8 xl:px-12">
        <LocalizedLink
          href="/"
          className="shrink-0 whitespace-nowrap font-[family-name:var(--font-headline)] text-base md:text-xl tracking-[0.2em] text-white"
        >
          GO-DAILY
        </LocalizedLink>
        {/* gap-3 below md: wider locales (en/ja sign-in labels) otherwise push
            the hamburger button past the right edge of phone viewports. */}
        <div className="flex flex-1 items-center justify-end gap-3 md:gap-4">
          <nav className="ml-12 hidden flex-nowrap items-center gap-7 text-xs font-light uppercase text-white/60 md:flex lg:ml-16 lg:gap-9 xl:gap-10">
            {links.map(([href, label]) => (
              <LocalizedLink key={href} href={href} className={linkBase}>
                {label}
              </LocalizedLink>
            ))}
          </nav>
          <div className="hidden w-3 md:block" />
          <LocalizedLink
            href="/pricing"
            className="whitespace-nowrap text-xs uppercase tracking-[0.2em] text-[var(--color-accent)] transition-opacity hover:opacity-80"
          >
            Pro
          </LocalizedLink>
          <div className="hidden w-3 md:block" />
          {/* UserMenu reads useSearchParams(); the boundary keeps statically
              rendered pages from bailing out to client-side rendering. */}
          <Suspense fallback={null}>
            <UserMenu />
          </Suspense>
          <div className="hidden w-2 md:block" />
          <LanguageToggle />
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center text-white/70 transition-colors hover:text-white md:hidden"
            aria-label={t.nav.menu}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {menuOpen && (
        <nav className="flex flex-col border-t border-white/5 bg-black/40 px-4 pb-3 pt-1 text-xs font-light uppercase text-white/60 backdrop-blur-xl md:hidden">
          {links.map(([href, label]) => (
            <LocalizedLink
              key={href}
              href={href}
              className={`${linkBase} py-3`}
              onClick={() => setMenuOpen(false)}
            >
              {label}
            </LocalizedLink>
          ))}
        </nav>
      )}
    </header>
  );
}

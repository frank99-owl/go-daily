"use client";

import { Shuffle } from "lucide-react";
import { useRouter } from "next/navigation";

import { LocalizedLink } from "@/components/LocalizedLink";
import { useLocale } from "@/lib/i18n";
import { localePath } from "@/lib/localePath";
import { pickRandomPuzzle } from "@/lib/random";
import { loadAttempts } from "@/lib/storage/storage";

import { LanguageToggle } from "./LanguageToggle";
import { UserMenu } from "./UserMenu";

export function Nav({ puzzleIds = [] }: { puzzleIds?: string[] }) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const isCjk = locale === "zh" || locale === "ja" || locale === "ko";

  const handleRandom = () => {
    const attempts = loadAttempts();
    // Wrap IDs in objects to satisfy pickRandomPuzzle's generic constraint
    const pool = puzzleIds.map((id) => ({ id }));
    const pick = pickRandomPuzzle(pool, attempts, "all");
    if (!pick) return;
    router.push(localePath(locale, `/puzzles/${encodeURIComponent(pick.id)}`));
  };

  const linkBase = [
    "whitespace-nowrap hover:text-[#00f2ff] transition-colors duration-500",
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
            <button
              type="button"
              onClick={handleRandom}
              title={t.nav.random}
              aria-label={t.nav.random}
              className={`${linkBase} inline-flex items-center gap-1`}
            >
              <Shuffle className="h-4 w-4" />
              <span className="hidden sm:inline">{t.nav.random}</span>
            </button>
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
          <div className="w-6" />
          <UserMenu />
          <div className="w-2" />
          <LanguageToggle />
        </div>
      </div>
    </header>
  );
}

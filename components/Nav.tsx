"use client";

import { Shuffle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useLocale } from "@/lib/i18n";
import { pickRandomPuzzle } from "@/lib/random";
import { loadAttempts } from "@/lib/storage";

import { LanguageToggle } from "./LanguageToggle";

export function Nav({ puzzleIds = [] }: { puzzleIds?: string[] }) {
  const { t } = useLocale();
  const router = useRouter();

  const handleRandom = () => {
    const attempts = loadAttempts();
    // Wrap IDs in objects to satisfy pickRandomPuzzle's generic constraint
    const pool = puzzleIds.map((id) => ({ id }));
    const pick = pickRandomPuzzle(pool, attempts, "all");
    if (!pick) return;
    router.push(`/puzzles/${encodeURIComponent(pick.id)}`);
  };

  const linkBase = "whitespace-nowrap hover:text-[#00f2ff] transition-colors duration-500";

  return (
    <header className="fixed top-0 w-full z-50 bg-black/10 backdrop-blur-xl border-b border-white/5">
      <div className="mx-auto max-w-7xl flex items-center justify-between px-6 sm:px-8 lg:px-12 h-16">
        <Link
          href="/"
          className="font-[family-name:var(--font-headline)] text-xl tracking-[0.2em] text-white"
        >
          GO-DAILY
        </Link>
        <div className="flex items-center gap-4">
          <nav className="hidden md:flex items-center justify-between w-[720px] lg:w-[860px] text-xs uppercase tracking-[0.3em] font-light text-white/60">
            <Link href="/" className={linkBase}>
              {t.nav.home}
            </Link>
            <Link href="/today" className={linkBase}>
              {t.nav.today}
            </Link>
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
            <Link href="/puzzles" className={linkBase}>
              {t.nav.puzzles}
            </Link>
            <Link href="/review" className={linkBase}>
              {t.nav.review}
            </Link>
            <Link href="/stats" className={linkBase}>
              {t.nav.stats}
            </Link>
            <Link href="/developer" className={linkBase}>
              {t.nav.developer}
            </Link>
          </nav>
          <LanguageToggle />
        </div>
      </div>
    </header>
  );
}

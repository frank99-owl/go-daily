"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shuffle } from "lucide-react";
import { useLocale } from "@/lib/i18n";
import { LanguageToggle } from "./LanguageToggle";
import { PUZZLES } from "@/content/puzzles";
import { pickRandomPuzzle } from "@/lib/random";
import { loadAttempts } from "@/lib/storage";

export function Nav() {
  const { t } = useLocale();
  const router = useRouter();

  // Random picks any puzzle across the library. The pool here is "all" on
  // purpose — dropping to unattempted-only would surprise users once they've
  // worked through most of the library. Honest random, no preference.
  const handleRandom = () => {
    const attempts = loadAttempts();
    const pick = pickRandomPuzzle(PUZZLES, attempts, "all");
    if (!pick) return;
    router.push(`/puzzles/${encodeURIComponent(pick.id)}`);
  };

  return (
    <header className="w-full border-b border-[color:var(--color-line)] bg-paper/80 backdrop-blur sticky top-0 z-20">
      <div className="mx-auto max-w-4xl flex items-center justify-between px-4 sm:px-6 h-14">
        <Link
          href="/"
          className="font-[family-name:var(--font-display)] text-lg tracking-tight text-ink"
        >
          {t.brand}
        </Link>
        <nav className="flex items-center gap-4 sm:gap-6 text-sm text-ink-2">
          <Link href="/" className="hover:text-ink transition-colors">
            {t.nav.today}
          </Link>
          <Link href="/puzzles" className="hover:text-ink transition-colors">
            {t.nav.puzzles}
          </Link>
          <Link href="/review" className="hover:text-ink transition-colors">
            {t.nav.review}
          </Link>
          <Link href="/stats" className="hover:text-ink transition-colors">
            {t.nav.stats}
          </Link>
          <button
            type="button"
            onClick={handleRandom}
            title={t.nav.random}
            aria-label={t.nav.random}
            className="inline-flex items-center gap-1 hover:text-ink transition-colors"
          >
            <Shuffle className="h-4 w-4" />
            <span className="hidden sm:inline">{t.nav.random}</span>
          </button>
          <LanguageToggle />
        </nav>
      </div>
    </header>
  );
}

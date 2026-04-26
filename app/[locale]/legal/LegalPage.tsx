"use client";

import Link from "next/link";

import { LocalizedLink } from "@/components/LocalizedLink";
import { useLocale } from "@/lib/i18n/i18n";
import { localePath } from "@/lib/i18n/localePath";
import type { Locale } from "@/types";

import { getLegalCopy, LEGAL_PATHS, type LegalKind } from "./_content";

export function LegalPage({ locale, kind }: { locale: Locale; kind: LegalKind }) {
  const { t } = useLocale();
  const copy = getLegalCopy(locale, kind);

  return (
    <div className="mx-auto max-w-5xl px-6 pb-32 pt-32 sm:pt-40 lg:px-8">
      <div className="relative">
        {/* Apple-style background accents */}
        <div className="pointer-events-none absolute -left-40 -top-40 h-80 w-80 rounded-full bg-[#00f2ff]/5 blur-[120px]" />
        <div className="pointer-events-none absolute -right-20 bottom-0 h-64 w-64 rounded-full bg-white/[0.02] blur-[100px]" />

        <header className="relative flex flex-col gap-8 text-center sm:text-left">
          <div className="flex flex-col items-center gap-4 sm:items-start">
            <div className="rounded-full border border-[#00f2ff]/20 bg-[#00f2ff]/5 px-4 py-1 text-[10px] font-medium uppercase tracking-[0.3em] text-[#00f2ff]">
              {copy.eyebrow}
            </div>
            <h1 className="font-[family-name:var(--font-headline)] text-5xl tracking-tight text-white sm:text-6xl lg:text-7xl">
              {copy.title}
            </h1>
          </div>

          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <p className="max-w-2xl text-lg font-light leading-relaxed text-white/50 sm:text-xl">
              {copy.description}
            </p>
            <div className="shrink-0 text-[11px] uppercase tracking-[0.2em] text-white/30">
              {copy.versionLabel} • {copy.versionValue}
            </div>
          </div>
        </header>

        <div className="relative mt-20 grid gap-12 sm:mt-32 sm:gap-24">
          {copy.sections.map((section, idx) => (
            <section key={idx} className="group relative">
              <div className="grid gap-8 lg:grid-cols-[1fr_2fr]">
                <div className="flex flex-col gap-4">
                  <h2 className="text-2xl font-medium tracking-tight text-white">
                    {section.heading}
                  </h2>
                  {section.summary && (
                    <p className="text-base font-normal leading-relaxed text-[#00f2ff]/80">
                      {section.summary}
                    </p>
                  )}
                </div>
                <div className="text-base leading-8 text-white/45 sm:text-lg sm:leading-9">
                  {section.body}
                </div>
              </div>
              <div className="mt-12 h-px w-full bg-gradient-to-r from-white/5 via-white/5 to-transparent sm:mt-24" />
            </section>
          ))}
        </div>

        <nav className="relative mt-12 flex flex-col items-center gap-10 sm:mt-20">
          <div className="text-[10px] uppercase tracking-[0.4em] text-white/20">More Resources</div>
          <div className="flex flex-wrap justify-center gap-3">
            {(Object.keys(LEGAL_PATHS) as LegalKind[]).map((item) => {
              const itemCopy = getLegalCopy(locale, item);
              const active = item === kind;
              return (
                <Link
                  key={item}
                  href={localePath(locale, LEGAL_PATHS[item])}
                  className={
                    "rounded-full border px-6 py-2.5 text-xs font-medium transition-all duration-500 " +
                    (active
                      ? "border-[#00f2ff]/50 bg-[#00f2ff]/10 text-[#00f2ff] shadow-[0_0_20px_rgba(0,242,255,0.1)]"
                      : "border-white/5 bg-white/[0.02] text-white/40 hover:border-white/20 hover:bg-white/5 hover:text-white")
                  }
                >
                  {itemCopy.title}
                </Link>
              );
            })}
          </div>

          <LocalizedLink
            href="/"
            className="mt-8 text-xs font-light text-white/30 transition-colors hover:text-[#00f2ff]"
          >
            Back to Home
          </LocalizedLink>
        </nav>
      </div>
    </div>
  );
}

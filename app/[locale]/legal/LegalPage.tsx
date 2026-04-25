import Link from "next/link";

import { localePath } from "@/lib/localePath";
import type { Locale } from "@/types";

import { getLegalCopy, LEGAL_PATHS, type LegalKind } from "./_content";

export function LegalPage({ locale, kind }: { locale: Locale; kind: LegalKind }) {
  const copy = getLegalCopy(locale, kind);

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-24 sm:px-6 sm:pt-32">
      <article className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.025] p-6 shadow-2xl shadow-black/30 backdrop-blur sm:p-10">
        <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-[#00f2ff]/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-8 h-48 w-48 rounded-full bg-white/5 blur-3xl" />

        <header className="relative flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.35em] text-[#00f2ff]/70">
            <span>{copy.eyebrow}</span>
            <span className="h-1 w-1 rounded-full bg-white/30" />
            <span>{copy.status}</span>
          </div>

          <div className="flex flex-col gap-3">
            <h1 className="font-[family-name:var(--font-display)] text-4xl text-white sm:text-5xl">
              {copy.title}
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-white/55 sm:text-base">
              {copy.description}
            </p>
          </div>

          <div className="inline-flex w-fit rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-white/50">
            {copy.updatedLabel}: {copy.updatedValue}
          </div>
        </header>

        <div className="relative mt-10 grid gap-4">
          {copy.sections.map((section) => (
            <section
              key={section.heading}
              className="rounded-2xl border border-white/10 bg-black/20 p-5"
            >
              <h2 className="text-sm font-medium uppercase tracking-[0.25em] text-white/80">
                {section.heading}
              </h2>
              <p className="mt-3 text-sm leading-7 text-white/55">{section.body}</p>
            </section>
          ))}
        </div>

        <nav className="relative mt-8 flex flex-wrap gap-2 border-t border-white/10 pt-5">
          {(Object.keys(LEGAL_PATHS) as LegalKind[]).map((item) => {
            const itemCopy = getLegalCopy(locale, item);
            const active = item === kind;
            return (
              <Link
                key={item}
                href={localePath(locale, LEGAL_PATHS[item])}
                className={
                  "rounded-full border px-3 py-1.5 text-xs transition-colors " +
                  (active
                    ? "border-[#00f2ff]/50 bg-[#00f2ff]/10 text-[#00f2ff]"
                    : "border-white/10 bg-white/5 text-white/50 hover:border-white/20 hover:text-white")
                }
              >
                {itemCopy.title}
              </Link>
            );
          })}
        </nav>
      </article>
    </div>
  );
}

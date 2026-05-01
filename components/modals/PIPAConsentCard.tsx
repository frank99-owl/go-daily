"use client";

import { useLocale } from "@/lib/i18n/i18n";

export function PIPAConsentCard({ onAccept }: { onAccept: () => void }) {
  const { t } = useLocale();

  return (
    <div className="relative flex flex-col gap-8 rounded-2xl border border-white/10 bg-white/[0.02] p-8 backdrop-blur sm:p-10">
      {/* Decorative light accent */}
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[color:var(--color-accent)]/10 blur-[80px]" />

      <header className="relative flex flex-col gap-3">
        <div className="w-fit rounded-full border border-[color:var(--color-accent)]/30 bg-[color:var(--color-accent)]/5 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--color-accent)]">
          PIPA Compliance
        </div>
        <h2 className="text-3xl font-medium tracking-tight text-white">{t.pipa.title}</h2>
        <p className="text-sm font-normal text-white/50">{t.pipa.subtitle}</p>
      </header>

      <div className="relative flex flex-col gap-6 text-[13px] leading-relaxed text-white/40">
        <p className="text-white/60">{t.pipa.description}</p>

        <ul className="flex flex-col gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-6">
          <li className="flex gap-3">
            <span className="shrink-0 text-[var(--color-accent)]">•</span>
            <span>{t.pipa.purpose}</span>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 text-[var(--color-accent)]">•</span>
            <span>{t.pipa.items}</span>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 text-[var(--color-accent)]">•</span>
            <span>{t.pipa.location}</span>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 text-[var(--color-accent)]">•</span>
            <span>{t.pipa.retention}</span>
          </li>
        </ul>

        <p className="italic text-white/30 text-[11px]">{t.pipa.rights}</p>
      </div>

      <button
        onClick={onAccept}
        className="group relative flex h-14 w-full items-center justify-center overflow-hidden rounded-full bg-white text-sm font-semibold text-black transition-all hover:bg-[var(--color-accent)] hover:text-black hover:shadow-[0_0_30px_rgba(0,242,255,0.3)]"
      >
        <span className="relative z-10">{t.pipa.accept}</span>
      </button>
    </div>
  );
}

"use client";

import { useState } from "react";

import { ModalShell } from "@/components/ModalShell";
import { PERSONAS, type PersonaId } from "@/lib/coach/personas";
import { useLocale } from "@/lib/i18n/i18n";

interface Props {
  selectedId: string;
  onSelect: (id: PersonaId) => void;
}

export function CoachPersonaSelector({ selectedId, onSelect }: Props) {
  const { locale, t } = useLocale();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const selectedPersona = PERSONAS.find((p) => p.id === selectedId) || PERSONAS[0];

  return (
    <>
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/10 transition-all border border-white/5 hover:border-white/20 group"
      >
        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[color:var(--color-accent)] to-blue-600 flex items-center justify-center text-[10px] font-bold text-black uppercase shadow-[0_0_10px_rgba(0,242,255,0.2)]">
          {selectedPersona.name[locale]?.[0] || "C"}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-white/90 font-medium group-hover:text-[color:var(--color-accent)] transition-colors">
            {selectedPersona.name[locale] || selectedPersona.name["en"]}
          </span>
          <span className="text-[10px] opacity-80">{selectedPersona.flag}</span>
        </div>
      </button>

      {isModalOpen && (
        <ModalShell
          open={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          ariaLabel={t.result.selectMentor}
          cardClassName="relative w-full max-w-2xl outline-none"
        >
          <div className="p-6 max-w-2xl w-full">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[color:var(--color-accent)] animate-pulse" />
              {t.result.selectMentor}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {PERSONAS.filter((p) => p.id !== "custom").map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    onSelect(p.id as PersonaId);
                    setIsModalOpen(false);
                  }}
                  className={`flex flex-col p-4 rounded-xl border transition-all text-left group relative overflow-hidden ${
                    selectedId === p.id
                      ? "bg-[color:var(--color-accent)]/10 border-[color:var(--color-accent)] shadow-[0_0_20px_rgba(0,242,255,0.05)]"
                      : "bg-white/[0.03] border-white/5 hover:border-white/20 hover:bg-white/[0.06]"
                  }`}
                >
                  <div className="flex items-start gap-4 mb-3 relative z-10">
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold text-black uppercase shrink-0 transition-transform group-hover:scale-105 ${
                        selectedId === p.id
                          ? "bg-[color:var(--color-accent)]"
                          : "bg-white/20 group-hover:bg-white/30"
                      }`}
                    >
                      {p.name[locale]?.[0] || "C"}
                    </div>
                    <div>
                      <h3 className="font-bold text-white leading-tight flex items-center gap-2">
                        {p.name[locale] || p.name["en"]}
                        <span className="text-sm grayscale-[0.5] group-hover:grayscale-0 transition-all">
                          {p.flag}
                        </span>
                      </h3>
                      <p className="text-xs text-[color:var(--color-accent)] font-medium opacity-80 uppercase tracking-wide mt-1">
                        {p.title[locale] || p.title["en"]}
                      </p>
                    </div>
                  </div>

                  <p className="text-sm text-white/60 leading-relaxed mb-4 flex-1 line-clamp-2 relative z-10">
                    {p.description[locale] || p.description["en"]}
                  </p>

                  <div className="flex flex-wrap gap-1.5 mt-auto relative z-10">
                    {(p.tags[locale] || p.tags["en"]).map((tag) => (
                      <span
                        key={tag}
                        className="text-[9px] px-2 py-0.5 rounded-full bg-white/5 border border-white/5 text-white/40 group-hover:text-white/60 transition-colors uppercase tracking-tight"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  {/* Subtle Background Glow for active */}
                  {selectedId === p.id && (
                    <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-[color:var(--color-accent)]/10 blur-2xl rounded-full" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </ModalShell>
      )}
    </>
  );
}

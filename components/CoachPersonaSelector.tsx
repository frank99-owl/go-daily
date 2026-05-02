"use client";

import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { PERSONAS, type PersonaId } from "@/lib/coach/personas";
import { useLocale } from "@/lib/i18n/i18n";

interface Props {
  selectedId: string;
  onSelect: (id: PersonaId) => void;
}

export function CoachPersonaSelector({ selectedId, onSelect }: Props) {
  const { locale, t } = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number; maxHeight: number } | null>(
    null,
  );
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const selectedPersona = PERSONAS.find((p) => p.id === selectedId) || PERSONAS[0];

  // Find the coach section ancestor to position the panel to its right.
  const computePosition = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const section = btn.closest("[data-coach-section]");
    if (!section) return;
    const rect = section.getBoundingClientRect();
    const gap = 12;
    const left = rect.right + gap;
    const top = rect.top;
    const maxHeight = rect.height;
    setPanelPos({ top, left, maxHeight: Math.min(maxHeight, 500) });
  }, []);

  const open = useCallback(() => {
    computePosition();
    setIsOpen(true);
  }, [computePosition]);

  // Recompute on scroll / resize while open.
  useEffect(() => {
    if (!isOpen) return;
    const update = () => computePosition();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [isOpen, computePosition]);

  // Close on click outside or Escape.
  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (isOpen ? setIsOpen(false) : open())}
        aria-expanded={isOpen}
        aria-label={t.result.selectMentor}
        className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-1.5 hover:border-[color:var(--color-accent)]/40 hover:bg-white/[0.08] transition-all group"
      >
        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[color:var(--color-accent)] to-blue-600 flex items-center justify-center text-[10px] font-bold text-black uppercase shadow-[0_0_6px_rgba(0,242,255,0.12)]">
          {selectedPersona.name[locale]?.[0] || "C"}
        </div>
        <span className="text-xs text-white/70 font-medium group-hover:text-[color:var(--color-accent)] transition-colors">
          {selectedPersona.name[locale] || selectedPersona.name["en"]}
        </span>
        <span className="text-xs opacity-50">{selectedPersona.flag}</span>
        <ChevronDown
          className={`h-3 w-3 text-white/25 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen &&
        panelPos &&
        createPortal(
          <div
            ref={panelRef}
            className="fixed z-[70] w-[340px] rounded-xl border border-white/10 bg-[#0b0f1a]/95 backdrop-blur-xl shadow-2xl shadow-black/50 overflow-hidden"
            style={{ top: panelPos.top, left: panelPos.left, maxHeight: panelPos.maxHeight }}
          >
            <div className="px-4 py-2.5 border-b border-white/5">
              <p className="text-[11px] text-white/35 uppercase tracking-wider font-medium">
                {t.result.selectMentor}
              </p>
            </div>
            <div className="py-1.5 overflow-y-auto" style={{ maxHeight: panelPos.maxHeight - 40 }}>
              {PERSONAS.filter((p) => p.id !== "custom").map((p) => {
                const isSelected = selectedId === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      onSelect(p.id as PersonaId);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-all group ${
                      isSelected ? "bg-[color:var(--color-accent)]/8" : "hover:bg-white/[0.04]"
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-black uppercase shrink-0 transition-all ${
                        isSelected
                          ? "bg-[color:var(--color-accent)] shadow-[0_0_12px_rgba(0,242,255,0.2)]"
                          : "bg-white/10 group-hover:bg-white/20"
                      }`}
                    >
                      {p.name[locale]?.[0] || p.name["en"]?.[0] || "C"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-semibold truncate ${
                            isSelected ? "text-[color:var(--color-accent)]" : "text-white/90"
                          }`}
                        >
                          {p.name[locale] || p.name["en"]}
                        </span>
                        <span className="text-sm">{p.flag}</span>
                        {isSelected && (
                          <span className="ml-auto text-[10px] uppercase tracking-wider text-[color:var(--color-accent)]/60 font-medium">
                            ✓
                          </span>
                        )}
                      </div>
                      <p
                        className={`text-xs mt-0.5 font-medium uppercase tracking-wide ${
                          isSelected ? "text-[color:var(--color-accent)]/70" : "text-white/35"
                        }`}
                      >
                        {p.title[locale] || p.title["en"]}
                      </p>
                      {p.description?.[locale] && (
                        <p className="text-[11px] text-white/25 mt-1 leading-relaxed line-clamp-2">
                          {p.description[locale]}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

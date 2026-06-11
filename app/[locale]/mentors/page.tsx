"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { Transition } from "framer-motion";
import { X } from "lucide-react";
import { useState } from "react";
import type { CSSProperties } from "react";

import { PERSONAS, type Persona } from "@/lib/coach/personas";
import { useLocale } from "@/lib/i18n/i18n";
import type { Locale } from "@/types";

const noop = () => {};

export default function MentorsPage() {
  const { t, locale } = useLocale();
  const [activeId, setActiveId] = useState<string | null>(null);

  const titleStyle: CSSProperties =
    locale === "zh"
      ? { fontFamily: 'var(--font-headline), "LXGW WenKai", cursive' }
      : locale === "ja"
        ? { fontFamily: 'var(--font-headline), "Yuji Syuku", serif' }
        : locale === "ko"
          ? { fontFamily: 'var(--font-headline), "Gowun Batang", "LXGW WenKai", serif' }
          : { fontFamily: 'var(--font-headline), "Playfair Display", serif' };

  const kejie = PERSONAS.find((p) => p.id === "ke-jie")!;
  const sedol = PERSONAS.find((p) => p.id === "lee-sedol")!;
  const seigen = PERSONAS.find((p) => p.id === "go-seigen")!;
  const yuta = PERSONAS.find((p) => p.id === "iyama-yuta")!;
  const jinseo = PERSONAS.find((p) => p.id === "shin-jinseo")!;

  const activePersona = PERSONAS.find((p) => p.id === activeId);

  // Cinematic slow transition for the reading mode
  const cinematicTransition: Transition = {
    duration: 1.2,
    ease: [0.22, 1, 0.36, 1],
  };

  return (
    <main
      className="min-h-dvh md:h-dvh w-full bg-[#020505] text-white/90 selection:bg-[color:var(--color-accent)]/20 relative overflow-y-auto md:overflow-hidden overflow-x-hidden flex items-start md:items-center justify-center p-0 m-0"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setActiveId(null);
        }
      }}
    >
      {/* Background Atmosphere */}
      <div className="absolute inset-0 bg-black pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,242,255,0.03)_0%,transparent_70%)] pointer-events-none" />
      <div className="absolute inset-0 opacity-[0.02] pointer-events-none bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />

      {/* Backdrop Blur Overlay - Lower z-index to stay below navbar (z-50) */}
      <AnimatePresence>
        {activeId && (
          <motion.div
            initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
            animate={{ opacity: 1, backdropFilter: "blur(40px)" }}
            exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
            transition={{ duration: 1.0 }}
            className="absolute inset-0 bg-black/40 z-30 pointer-events-none"
          />
        )}
      </AnimatePresence>

      {/* The Expanded "Frosted Glass" View - Fixed Z-index and Positioning */}
      <AnimatePresence>
        {activePersona && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            transition={cinematicTransition}
            className="fixed inset-0 z-40 flex items-center justify-center p-4 md:p-24 lg:p-32 pt-24 md:pt-32 pointer-events-none"
          >
            {/* The Glass Container */}
            <div className="w-full max-w-7xl bg-white/[0.01] border border-white/5 rounded-3xl md:rounded-[48px] p-6 md:p-20 shadow-2xl relative max-h-full md:max-h-none overflow-y-auto md:overflow-hidden pointer-events-auto md:pointer-events-none flex flex-col md:flex-row gap-8 md:gap-24 items-stretch">
              {/* Mobile-only close: desktop closes via mouse-leave instead. */}
              <button
                type="button"
                onClick={() => setActiveId(null)}
                className="absolute right-4 top-4 z-10 rounded-full border border-white/10 bg-black/40 p-2 text-white/60 md:hidden"
                aria-label={t.mentors.close}
              >
                <X className="h-4 w-4" />
              </button>
              {/* Left: Identity - Fixed Width with clear spacing */}
              <div className="w-full md:w-[360px] flex flex-col items-center md:items-start border-b md:border-b-0 md:border-r border-white/5 pb-12 md:pb-0 md:pr-16 shrink-0">
                <div className="flex flex-col items-center md:items-start gap-4 md:gap-6 mb-8 md:mb-12">
                  <div className="flex items-center gap-6">
                    <h2
                      className="text-4xl md:text-8xl font-medium text-white tracking-tighter"
                      style={titleStyle}
                    >
                      {activePersona.name[locale] || activePersona.name["en"]}
                    </h2>
                    <span className="text-4xl md:text-6xl">{activePersona.flag}</span>
                  </div>
                  <div className="h-px w-20 bg-[color:var(--color-accent)]/40" />
                </div>

                <div className="flex flex-col gap-6 md:gap-10">
                  <span className="text-lg md:text-3xl uppercase tracking-[0.4em] text-[color:var(--color-accent)] font-bold opacity-80 leading-tight">
                    {activePersona.title[locale] || activePersona.title["en"]}
                  </span>

                  <div className="flex flex-wrap justify-center md:justify-start gap-3 mt-4">
                    {(activePersona.tags[locale] || activePersona.tags["en"]).map((tag) => (
                      <span
                        key={tag}
                        className="text-[11px] px-4 py-1.5 rounded-full border border-white/10 bg-white/5 text-white/40 uppercase font-medium tracking-widest whitespace-nowrap"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right: Narrative - Flexible */}
              <div className="flex-1 flex flex-col justify-center gap-6 md:gap-12 overflow-hidden">
                <blockquote className="text-xl md:text-5xl font-light italic leading-relaxed text-white/95 border-l-4 border-[color:var(--color-accent)]/20 pl-5 md:pl-10 py-2">
                  {activePersona.description[locale] || activePersona.description["en"]}
                </blockquote>
                <p className="text-base md:text-2xl text-white/50 font-light leading-relaxed whitespace-pre-wrap overflow-y-auto scrollbar-hide pr-4">
                  {activePersona.bio[locale] || activePersona.bio["en"]}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile: simple stacked list reusing the same cards. Hover handlers
          are inert here — synthetic mouse events from taps would otherwise
          close/reopen the detail view nondeterministically. Open on tap,
          close via the explicit button. */}
      <div className="z-20 flex w-full flex-col items-center gap-4 px-4 pb-12 pt-24 md:hidden">
        {[sedol, seigen, kejie, yuta, jinseo].map((p) => (
          <MentorBaseCard
            key={p.id}
            persona={p}
            posStyle={{ position: "relative" }}
            onShow={noop}
            onHide={noop}
            onActivate={() => setActiveId(p.id)}
            locale={locale}
            titleStyle={titleStyle}
            isActive={activeId === p.id}
            isDimmed={activeId !== null && activeId !== p.id}
            isCenter
          />
        ))}
      </div>

      {/* Quincunx Base Layer (desktop) */}
      <div className="relative hidden md:block w-full h-full max-w-[1200px] max-h-[800px] z-20">
        {/* Lee Sedol (Top Left) */}
        <MentorBaseCard
          persona={sedol}
          posStyle={{ top: "15%", left: "0%" }}
          onShow={() => setActiveId(sedol.id)}
          onHide={() => setActiveId(null)}
          onActivate={() => setActiveId(sedol.id)}
          locale={locale}
          titleStyle={titleStyle}
          isActive={activeId === sedol.id}
          isDimmed={activeId !== null && activeId !== sedol.id}
        />

        {/* Top Right: Go Seigen */}
        <MentorBaseCard
          persona={seigen}
          posStyle={{ top: "15%", right: "0%" }}
          onShow={() => setActiveId(seigen.id)}
          onHide={() => setActiveId(null)}
          onActivate={() => setActiveId(seigen.id)}
          locale={locale}
          titleStyle={titleStyle}
          isActive={activeId === seigen.id}
          isDimmed={activeId !== null && activeId !== seigen.id}
        />

        {/* CENTER: Ke Jie */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
          <MentorBaseCard
            persona={kejie}
            posStyle={{ position: "relative" }}
            onShow={() => setActiveId(kejie.id)}
            onHide={() => setActiveId(null)}
            onActivate={() => setActiveId(kejie.id)}
            locale={locale}
            titleStyle={titleStyle}
            isActive={activeId === kejie.id}
            isDimmed={activeId !== null && activeId !== kejie.id}
            isCenter
          />
        </div>

        {/* Iyama Yuta (Bottom Left) */}
        <MentorBaseCard
          persona={yuta}
          posStyle={{ bottom: "15%", left: "0%" }}
          onShow={() => setActiveId(yuta.id)}
          onHide={() => setActiveId(null)}
          onActivate={() => setActiveId(yuta.id)}
          locale={locale}
          titleStyle={titleStyle}
          isActive={activeId === yuta.id}
          isDimmed={activeId !== null && activeId !== yuta.id}
        />

        {/* Bottom Right: Shin Jinseo */}
        <MentorBaseCard
          persona={jinseo}
          posStyle={{ bottom: "15%", right: "0%" }}
          onShow={() => setActiveId(jinseo.id)}
          onHide={() => setActiveId(null)}
          onActivate={() => setActiveId(jinseo.id)}
          locale={locale}
          titleStyle={titleStyle}
          isActive={activeId === jinseo.id}
          isDimmed={activeId !== null && activeId !== jinseo.id}
        />
      </div>
    </main>
  );
}

function MentorBaseCard({
  persona,
  posStyle,
  onShow,
  onHide,
  onActivate,
  locale,
  titleStyle,
  isActive,
  isDimmed,
  isCenter = false,
}: {
  persona: Persona;
  posStyle: CSSProperties;
  onShow: () => void;
  onHide: () => void;
  onActivate: () => void;
  locale: Locale;
  titleStyle: CSSProperties;
  isActive: boolean;
  isDimmed: boolean;
  isCenter?: boolean;
}) {
  const name = persona.name[locale] || persona.name["en"];
  const title = persona.title[locale] || persona.title["en"];

  return (
    <motion.button
      type="button"
      aria-expanded={isActive}
      aria-label={`${name}: ${title}`}
      animate={{
        opacity: isDimmed ? 0.15 : 1,
        scale: isDimmed ? 0.95 : 1,
        filter: isDimmed ? "blur(4px)" : "blur(0px)",
      }}
      transition={{ duration: 0.8 }}
      style={posStyle}
      onMouseEnter={onShow}
      onMouseLeave={onHide}
      onFocus={onShow}
      onBlur={onHide}
      onClick={onActivate}
      className={`${!isCenter ? "absolute" : ""} w-[300px] p-8 rounded-3xl bg-white/[0.03] border border-white/5 text-left hover:border-[color:var(--color-accent)]/20 focus-visible:border-[color:var(--color-accent)]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent)]/40 transition-all duration-700 cursor-pointer backdrop-blur-sm group`}
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-medium text-white/90" style={titleStyle}>
            {name}
          </h2>
          <span className="text-xl opacity-60 grayscale-[0.2] group-hover:grayscale-0 transition-all">
            {persona.flag}
          </span>
        </div>
        <span className="text-[9px] uppercase tracking-[0.3em] text-[color:var(--color-accent)] font-bold opacity-50">
          {title}
        </span>
      </div>
      <p className="mt-6 text-[12px] text-white/40 font-light leading-relaxed line-clamp-2 italic border-l border-white/10 pl-4">
        {persona.description[locale] || persona.description["en"]}
      </p>
    </motion.button>
  );
}

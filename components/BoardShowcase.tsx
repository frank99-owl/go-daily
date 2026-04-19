"use client";

import { useRef, useState, useCallback } from "react";
import { motion, useScroll, useMotionValueEvent } from "framer-motion";
import { DemoGameBoard, type DemoPhase } from "./DemoGameBoard";
import { LEE_ALPHAGO_G4_SGF, LEE_ALPHAGO_G4_META } from "@/content/games/leeAlphagoG4";
import { parseSgfMoves } from "@/lib/sgf";
import { buildSnapshots } from "@/lib/gameSnapshots";
import { useLocale } from "@/lib/i18n";

const SNAPSHOTS = buildSnapshots(parseSgfMoves(LEE_ALPHAGO_G4_SGF));

export function BoardShowcase() {
  const { t, locale } = useLocale();
  const [playKey, setPlayKey] = useState(0);
  const [currentMove, setCurrentMove] = useState(LEE_ALPHAGO_G4_META.godMoveNumber);
  const [phase, setPhase] = useState<DemoPhase>("idle");
  const sectionRef = useRef<HTMLElement>(null);
  const playKeyRef = useRef(0);
  const [visible, setVisible] = useState(false);

  const { scrollYProgress } = useScroll();

  useMotionValueEvent(scrollYProgress, "change", (latest) => {
    const shouldShow = latest >= 0.2;
    setVisible((prev) => {
      if (prev !== shouldShow) return shouldShow;
      return prev;
    });

    if (latest >= 0.5 && playKeyRef.current === 0) {
      playKeyRef.current = Date.now();
      setPlayKey(playKeyRef.current);
    } else if (latest < 0.5 && playKeyRef.current !== 0) {
      playKeyRef.current = 0;
      setPlayKey(0);
    }
  });

  const handlePhaseChange = useCallback((p: DemoPhase) => {
    setPhase(p);
  }, []);

  const handleMoveChange = useCallback((moveNumber: number) => {
    setCurrentMove(moveNumber);
  }, []);

  return (
    <section
      id="board-showcase"
      ref={sectionRef}
      className="sticky top-0 min-h-screen z-20 flex items-center bg-paper"
    >
      <div className="grid grid-cols-[1fr_560px] gap-20 max-w-7xl mx-auto px-12 w-full">
        {/* Left: copy */}
        <motion.div
          className="flex flex-col justify-center space-y-8"
          animate={{
            opacity: visible ? 1 : 0,
            x: visible ? 0 : -120,
          }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.25em] text-white/40 font-[family-name:var(--font-sans)]">
              {t.boardShowcase.meta}
            </p>
            <h2
              className="text-5xl font-light text-white"
              style={{
                fontFamily:
                  locale === "zh"
                    ? '"Zhi Mang Xing", cursive'
                    : locale === "ja"
                      ? '"Klee One", cursive'
                      : locale === "ko"
                        ? '"Gowun Batang", serif'
                        : 'var(--font-headline), "Playfair Display", serif',
                lineHeight: locale === "zh" ? 1.5 : 1.25,
                letterSpacing: locale === "zh" ? "0.25em" : undefined,
              }}
            >
              {t.boardShowcase.title}
              <br />
              <span className={locale === "zh" ? "" : "italic"}>{t.boardShowcase.subtitle}</span>
            </h2>
          </div>
          <p className="text-white/50 text-sm leading-relaxed max-w-sm font-[family-name:var(--font-sans)] font-light">
            {t.boardShowcase.description}
          </p>

          {/* HUD */}
          <div className="flex items-center gap-6">
            <div className="text-3xl font-[family-name:var(--font-headline)] text-white tracking-tight">
              {String(currentMove).padStart(3, "0")} <span className="text-white/30">/</span>{" "}
              <span className="text-white/40">
                {String(LEE_ALPHAGO_G4_META.totalMoves).padStart(3, "0")}
              </span>
            </div>
            <div className="px-3 py-1 rounded-full border border-white/10 text-xs uppercase tracking-[0.2em] text-white/50 font-[family-name:var(--font-sans)]">
              {phase === "idle" && t.boardShowcase.phaseIdle}
              {phase === "showGod" && t.boardShowcase.phaseShowGod}
              {phase === "playing" && t.boardShowcase.phasePlaying}
              {phase === "ended" && t.boardShowcase.phaseEnded}
            </div>
          </div>
        </motion.div>

        {/* Right: board */}
        <motion.div
          className="flex items-center"
          animate={{
            opacity: visible ? 1 : 0,
            x: visible ? 0 : 120,
          }}
          transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }}
        >
          <DemoGameBoard
            key={playKey}
            snapshots={SNAPSHOTS}
            startAtMove={LEE_ALPHAGO_G4_META.godMoveNumber}
            holdMs={3000}
            stepMs={700}
            godMoveNumber={LEE_ALPHAGO_G4_META.godMoveNumber}
            started={playKey !== 0}
            onPhaseChange={handlePhaseChange}
            onMoveChange={handleMoveChange}
          />
        </motion.div>
      </div>
    </section>
  );
}

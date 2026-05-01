"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import Image from "next/image";
import { useRef } from "react";

import { LocalizedLink } from "@/components/LocalizedLink";
import { useLocale } from "@/lib/i18n/i18n";

export function HeroSection() {
  const { t, locale } = useLocale();
  const sectionRef = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });

  const bgY = useTransform(scrollYProgress, [0, 1], ["0%", "30%"]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const contentY = useTransform(scrollYProgress, [0, 0.5], ["0%", "-10%"]);
  const contentScale = useTransform(scrollYProgress, [0, 0.5], [1, 0.85]);

  const scrollToBoard = () => {
    const target = window.innerHeight;
    const start = window.scrollY;
    const distance = target - start;
    const duration = 900;
    let startTime: number | null = null;

    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      window.scrollTo(0, start + distance * eased);
      if (progress < 1) requestAnimationFrame(step);
    };

    requestAnimationFrame(step);
  };

  const titleFont = "font-[family-name:var(--font-headline)]";
  const titleStyle =
    locale === "zh"
      ? { fontFamily: '"Zhi Mang Xing", cursive', textShadow: "0 0 30px rgba(255, 255, 255, 0.2)" }
      : locale === "ja"
        ? { fontFamily: '"Yuji Syuku", serif', textShadow: "0 0 30px rgba(255, 255, 255, 0.2)" }
        : locale === "ko"
          ? { fontFamily: '"Gowun Batang", serif', textShadow: "0 0 30px rgba(255, 255, 255, 0.2)" }
          : {
              fontFamily: '"Playfair Display", serif',
              textShadow: "0 0 30px rgba(255, 255, 255, 0.2)",
            };

  const secondLineOffset =
    locale === "en" ? "" : locale === "ja" ? "ml-16 md:ml-32" : "ml-8 md:ml-16";

  return (
    <section
      ref={sectionRef}
      id="hero-section"
      className="sticky top-0 h-screen z-10 flex items-center overflow-hidden"
    >
      {/* Background Image - parallax */}
      <motion.div className="absolute inset-0 z-0 overflow-hidden" style={{ y: bgY }}>
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/40 to-transparent z-10" />
        <div className="relative h-[120%] w-full">
          <Image
            alt="Go board"
            className="object-cover opacity-80"
            fill
            priority
            sizes="100vw"
            src="/hero-bg.jpg"
          />
        </div>
      </motion.div>

      {/* Content - fade out on scroll */}
      <motion.div
        className="container mx-auto px-12 max-w-7xl relative z-20"
        style={{
          opacity: contentOpacity,
          y: contentY,
          scale: contentScale,
        }}
      >
        <div className="max-w-2xl space-y-10">
          <div className="space-y-2">
            <h1
              className={`${titleFont} text-6xl md:text-8xl font-light tracking-tight leading-[1.1]`}
              style={titleStyle}
            >
              <span className="block">{t.hero.titleLine1}</span>
              <span
                className={`block ${locale === "zh" ? "" : "italic"} font-normal opacity-90 ${secondLineOffset}`}
              >
                {t.hero.titleLine2}
              </span>
            </h1>
          </div>
          <p className="font-[family-name:var(--font-sans)] text-lg text-white/60 max-w-md leading-relaxed font-light tracking-wide">
            {t.hero.subtitle}
          </p>
          <div className="pt-8 flex items-center gap-10">
            <LocalizedLink
              href="/today"
              data-hover-target
              className="group flex items-center gap-4 text-white font-[family-name:var(--font-sans)] font-light text-sm tracking-[0.2em] uppercase transition-all"
            >
              <span className="w-12 h-px bg-white/30 group-hover:w-16 group-hover:bg-white transition-all duration-500" />
              {t.hero.getStarted}
            </LocalizedLink>
            <button
              type="button"
              onClick={scrollToBoard}
              data-hover-target
              className="group flex items-center gap-4 text-white/50 hover:text-white font-[family-name:var(--font-sans)] font-light text-sm tracking-[0.2em] uppercase transition-all"
            >
              <span className="w-8 h-px bg-white/10 group-hover:w-12 group-hover:bg-white transition-all duration-500" />
              {t.hero.watchMatch}
            </button>
          </div>
        </div>
      </motion.div>

      {/* Scroll down arrow */}
      <motion.button
        type="button"
        onClick={scrollToBoard}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 text-white/40 hover:text-white transition-colors"
        aria-label="Scroll to board showcase"
        style={{ opacity: contentOpacity }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-bounce"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </motion.button>
    </section>
  );
}

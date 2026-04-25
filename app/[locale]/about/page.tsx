"use client";

import { motion, type Variants } from "framer-motion";

import { useLocale } from "@/lib/i18n";

export default function AboutPage() {
  const { t, locale } = useLocale();

  // Typography logic matching HeroSection for consistency
  // Putting var(--font-headline) first ensures English words and numbers use Playfair Display,
  // while CJK characters fall back to the localized calligraphic fonts.
  const titleStyle =
    locale === "zh"
      ? { fontFamily: 'var(--font-headline), "LXGW WenKai", cursive' }
      : locale === "ja"
        ? { fontFamily: 'var(--font-headline), "Yuji Syuku", serif' }
        : locale === "ko"
          ? { fontFamily: 'var(--font-headline), "Gowun Batang", "LXGW WenKai", serif' }
          : { fontFamily: 'var(--font-headline), "Playfair Display", serif' };

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.2,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 15 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.8,
        ease: [0.21, 0.47, 0.32, 0.98],
      },
    },
  };

  // Shared styles for sections and text
  const sectionClassName = "space-y-8";
  const headingClassName = "text-2xl md:text-3xl text-white tracking-wide";
  const bodyClassName =
    "text-base font-[family-name:var(--font-sans)] font-light leading-relaxed text-white/70 space-y-4";
  const listItemClassName = "pl-6 border-l border-white/10 space-y-2";
  const listTitleClassName = "text-white/90 font-medium block";

  return (
    <main className="min-h-screen bg-paper text-white/90 selection:bg-white/10 relative overflow-hidden">
      {/* Hand Holding Stone Motif (Go Grip) - Fixed Center Background */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] md:w-[1200px] md:h-[1200px] opacity-[0.05] select-none pointer-events-none z-0 text-white flex items-center justify-center">
        <svg
          viewBox="0 0 400 300"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full"
        >
          <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            {/* Wrist and Hand Base */}
            <path d="M400,100 C340,90 280,100 230,120" />
            <path d="M400,220 C350,220 310,210 270,180" />

            {/* Middle Finger (Top) */}
            <path d="M230,120 C190,135 150,150 120,165 C105,172 95,180 100,188 C105,192 115,190 130,185 C150,178 180,165 210,150" />
            {/* Middle Finger Knuckles */}
            <path d="M190,140 C192,150 195,155 200,160" />
            <path d="M150,155 C152,160 155,165 160,170" />

            {/* Index Finger (Bottom/Supporting) */}
            <path d="M160,170 C130,185 100,195 80,200 C70,203 65,198 70,190 C75,185 85,180 95,175" />

            {/* Thumb (Right/Under) */}
            <path d="M270,180 C260,185 250,195 245,210 C240,225 250,235 260,240 C280,245 310,230 330,220" />
            <path d="M260,185 C255,195 255,205 260,215" />

            {/* The Stone */}
            <ellipse
              cx="85"
              cy="188"
              rx="28"
              ry="12"
              fill="currentColor"
              fillOpacity="0.15"
              transform="rotate(-20 85 188)"
            />

            {/* Stone Rim Highlight */}
            <path d="M60,190 C70,205 105,200 115,185" strokeWidth="1" />
          </g>
        </svg>
      </div>
      <div className="max-w-2xl mx-auto px-8 pt-32 pb-24 md:pt-48 md:pb-32 relative z-10">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-24 md:space-y-32"
        >
          {/* Main Title */}
          <motion.section variants={itemVariants} className="space-y-12">
            <h1
              className="text-4xl md:text-5xl font-light tracking-tight leading-tight text-white"
              style={titleStyle}
            >
              {t.about.title}
            </h1>
            <div className="h-px w-16 bg-white/20" />
          </motion.section>

          {/* Prologue */}
          <motion.section variants={itemVariants} className={sectionClassName}>
            <h2 className={headingClassName} style={titleStyle}>
              {t.about.introTitle}
            </h2>
            <div className={bodyClassName}>
              <p>{t.about.introText1}</p>
              <p>{t.about.introText2}</p>
            </div>
          </motion.section>

          {/* Section 1: Process */}
          <motion.section variants={itemVariants} className={sectionClassName}>
            <h2 className={headingClassName} style={titleStyle}>
              {t.about.section1Title}
            </h2>
            <div className={bodyClassName}>
              <p>{t.about.section1Text1}</p>
              <p>{t.about.section1Text2}</p>
              <p className="italic text-white/80 py-2">{t.about.section1Text3}</p>
            </div>
          </motion.section>

          {/* Section 2: Move 78 */}
          <motion.section variants={itemVariants} className={sectionClassName}>
            <div className="space-y-8">
              <h2 className={headingClassName} style={titleStyle}>
                {t.about.section2Title}
              </h2>
              <div className={bodyClassName}>
                <p>{t.about.section2Text1}</p>
                <p>{t.about.section2Text2}</p>
                <p>{t.about.section2Text3}</p>
                <p className="text-white font-normal bg-white/5 px-4 py-3 border-l-2 border-white/20">
                  {t.about.section2Text4}
                </p>
              </div>
            </div>
          </motion.section>

          {/* Section 3: AI Era */}
          <motion.section variants={itemVariants} className={sectionClassName}>
            <h2 className={headingClassName} style={titleStyle}>
              {t.about.section3Title}
            </h2>
            <div className={bodyClassName}>
              <p>{t.about.section3Text1}</p>
              <div className="space-y-8 mt-4">
                <div className={listItemClassName}>
                  <span className={listTitleClassName}>
                    {t.about.section3Text2.includes("：")
                      ? t.about.section3Text2.split("：")[0]
                      : t.about.section3Text2.split(": ")[0]}
                  </span>
                  <p>
                    {t.about.section3Text2.includes("：")
                      ? t.about.section3Text2.split("：")[1]
                      : t.about.section3Text2.split(": ")[1]}
                  </p>
                </div>
                <div className={listItemClassName}>
                  <span className={listTitleClassName}>
                    {t.about.section3Text3.includes("：")
                      ? t.about.section3Text3.split("：")[0]
                      : t.about.section3Text3.split(": ")[0]}
                  </span>
                  <p>
                    {t.about.section3Text3.includes("：")
                      ? t.about.section3Text3.split("：")[1]
                      : t.about.section3Text3.split(": ")[1]}
                  </p>
                </div>
              </div>
            </div>
          </motion.section>

          {/* Section 4: Developer */}
          <motion.section
            variants={itemVariants}
            className="pt-16 border-t border-white/5 space-y-10"
          >
            <div className="flex items-baseline gap-4">
              <span className="text-3xl text-white" style={titleStyle}>
                Frank
              </span>
              <span className="text-[10px] uppercase tracking-[0.3em] text-white/30 font-medium">
                Developer
              </span>
            </div>
            <div className={bodyClassName}>
              <p>{t.about.section4Text1}</p>
              <p>{t.about.section4Text2}</p>
              <p>{t.about.section4Text3}</p>
              <p className="italic text-white/40 pt-4 border-t border-white/5">
                {t.about.section4Text4}
              </p>
            </div>
          </motion.section>

          {/* Footer */}
          <motion.footer variants={itemVariants} className="pt-24 pb-12 text-center">
            <p className="text-[10px] uppercase tracking-[0.5em] text-white/10">{t.about.footer}</p>
          </motion.footer>
        </motion.div>
      </div>
    </main>
  );
}

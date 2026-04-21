import type { Locale, Puzzle } from "@/types";

const LOCALES: Locale[] = ["zh", "en", "ja", "ko"];

const MIN_NOTE_LENGTH: Record<Locale, number> = {
  zh: 24,
  en: 48,
  ja: 24,
  ko: 24,
};

const GENERIC_NOTE_PATTERNS: Record<Locale, RegExp[]> = {
  zh: [/点击.?查看正解/, /查看盘面上的关键点/, /标记出的?急所位置/, /急所位置/],
  en: [/tap ['"]view solution['"]/i, /reveal the key point/i, /vital point highlighted/i],
  ja: [/「正解を見る」/, /急所が盤上に表示/, /急所が示され/],
  ko: [/'정답 보기'/, /급소가 표시/, /핵심 점이 표시/],
};

const EXPLANATION_PATTERNS: Record<Locale, RegExp[]> = {
  zh: [/因为/, /如果/, /之后/, /随后/, /从而/, /否则/, /才能/, /先.*再/],
  en: [
    /because/i,
    /\bif\b/i,
    /\bonce\b/i,
    /\bafter\b/i,
    /\bthen\b/i,
    /otherwise/i,
    /allows?/i,
    /prevents?/i,
  ],
  ja: [/ため/, /もし/, /その後/, /そこで/, /先に/, /〜と/, /できる/, /止め/],
  ko: [/때문/, /만약/, /이후/, /그러면/, /먼저/, /그래서/, /막을 수/, /확보/],
};

export type CoachEligibilityReason =
  | "eligible"
  | "missing-correct-answer"
  | "missing-solution-note"
  | "generic-solution-note"
  | "short-solution-note"
  | "insufficient-explanation"
  | "partial-explanation";

export type CoachQualityTier = "blocked" | "thin" | "explained" | "coach-ready";

export interface CoachEligibilityResult {
  eligible: boolean;
  reason: CoachEligibilityReason;
  qualityTier: CoachQualityTier;
  averageNoteLength: number;
  explanationLocaleCount: number;
  genericLocaleCount: number;
  hasVariationSupport: boolean;
  noteLengths: Record<Locale, number>;
}

const COACH_READY_MIN_AVERAGE_NOTE_LENGTH = 72;

function noteForLocale(puzzle: Puzzle, locale: Locale): string {
  return puzzle.solutionNote?.[locale]?.trim() ?? "";
}

export function checkCoachEligibility(puzzle: Puzzle): CoachEligibilityResult {
  const noteLengths = Object.fromEntries(
    LOCALES.map((locale) => [locale, noteForLocale(puzzle, locale).length]),
  ) as Record<Locale, number>;

  const averageNoteLength = Math.round(
    LOCALES.reduce((sum, locale) => sum + noteLengths[locale], 0) / LOCALES.length,
  );

  const hasVariationSupport = Boolean(
    (puzzle.solutionSequence?.length ?? 0) > 0 || (puzzle.wrongBranches?.length ?? 0) > 0,
  );

  if (!puzzle.correct?.length) {
    return {
      eligible: false,
      reason: "missing-correct-answer",
      qualityTier: "blocked",
      averageNoteLength,
      explanationLocaleCount: 0,
      genericLocaleCount: 0,
      hasVariationSupport,
      noteLengths,
    };
  }

  const missingLocaleCount = LOCALES.filter((locale) => noteLengths[locale] === 0).length;
  if (missingLocaleCount > 0) {
    return {
      eligible: false,
      reason: "missing-solution-note",
      qualityTier: "blocked",
      averageNoteLength,
      explanationLocaleCount: 0,
      genericLocaleCount: 0,
      hasVariationSupport,
      noteLengths,
    };
  }

  const genericLocaleCount = LOCALES.filter((locale) =>
    GENERIC_NOTE_PATTERNS[locale].some((pattern) => pattern.test(noteForLocale(puzzle, locale))),
  ).length;

  if (genericLocaleCount >= 2 && !hasVariationSupport) {
    return {
      eligible: false,
      reason: "generic-solution-note",
      qualityTier: "blocked",
      averageNoteLength,
      explanationLocaleCount: 0,
      genericLocaleCount,
      hasVariationSupport,
      noteLengths,
    };
  }

  const shortLocaleCount = LOCALES.filter(
    (locale) => noteLengths[locale] < MIN_NOTE_LENGTH[locale],
  ).length;

  if (shortLocaleCount > 0) {
    return {
      eligible: false,
      reason: "short-solution-note",
      qualityTier: "thin",
      averageNoteLength,
      explanationLocaleCount: 0,
      genericLocaleCount,
      hasVariationSupport,
      noteLengths,
    };
  }

  const explanationLocaleCount = LOCALES.filter((locale) =>
    EXPLANATION_PATTERNS[locale].some((pattern) => pattern.test(noteForLocale(puzzle, locale))),
  ).length;

  if (explanationLocaleCount < 2 && !hasVariationSupport) {
    return {
      eligible: false,
      reason: "insufficient-explanation",
      qualityTier: "thin",
      averageNoteLength,
      explanationLocaleCount,
      genericLocaleCount,
      hasVariationSupport,
      noteLengths,
    };
  }

  if (averageNoteLength < COACH_READY_MIN_AVERAGE_NOTE_LENGTH && !hasVariationSupport) {
    return {
      eligible: false,
      reason: "partial-explanation",
      qualityTier: "explained",
      averageNoteLength,
      explanationLocaleCount,
      genericLocaleCount,
      hasVariationSupport,
      noteLengths,
    };
  }

  return {
    eligible: true,
    reason: "eligible",
    qualityTier: "coach-ready",
    averageNoteLength,
    explanationLocaleCount,
    genericLocaleCount,
    hasVariationSupport,
    noteLengths,
  };
}

import fs from "fs";
import path from "path";

import { PUZZLES, buildPuzzleSummaries } from "../content/puzzles.server";
import {
  checkCoachEligibility,
  type CoachEligibilityReason,
  type CoachQualityTier,
} from "../lib/coach/coachEligibility";
import type { Locale, Puzzle, PuzzleSummary } from "../types";

const LOCALES: Locale[] = ["zh", "en", "ja", "ko"];
const PROMPT_LENGTH_THRESHOLD = 100;
const SOLUTION_NOTE_LENGTH_THRESHOLD = 500;
const TOP_TEMPLATE_LIMIT = 5;

export const AUDIT_OUTPUT_DIR = path.join(process.cwd(), "reports/puzzle-audit");
export const AUDIT_JSON_PATH = path.join(AUDIT_OUTPUT_DIR, "latest.json");
export const AUDIT_MARKDOWN_PATH = path.join(AUDIT_OUTPUT_DIR, "latest.md");

type SolutionNoteQualityTier =
  | "missing"
  | "generic-placeholder"
  | "thin"
  | "explained"
  | "coach-ready";

interface TemplateStat {
  template: string;
  count: number;
}

interface AuditOptions {
  summaryIndex?: PuzzleSummary[];
  today?: string;
}

interface AuditCandidate {
  id: string;
  eligible: boolean;
  reason: CoachEligibilityReason;
  qualityTier: CoachQualityTier;
  averageNoteLength: number;
  hasVariationSupport: boolean;
}

function todayLocalYmd(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export interface AuditResult {
  generatedAt: string;
  total: number;
  boardSizeDistribution: Record<string, number>;
  difficultyDistribution: Record<string, number>;
  tagDistribution: Record<string, number>;
  dateRange: { min: string; max: string } | null;
  indexConsistency: {
    computedSummaryCount: number;
    indexSummaryCount: number;
    staleIndexIds: string[];
    missingSummaryIds: string[];
  };
  coachEligibleCandidates: AuditCandidate[];
  coachEligibilityReasons: Record<CoachEligibilityReason, number>;
  solutionNoteQualityTiers: Record<SolutionNoteQualityTier, number>;
  promptTemplateStats: {
    uniqueCountsByLocale: Record<Locale, number>;
    topTemplatesByLocale: Record<Locale, TemplateStat[]>;
  };
  anomalies: {
    longPrompts: Array<{ id: string; length: number; locale: string }>;
    longSolutionNotes: Array<{ id: string; length: number; locale: string }>;
    missingFields: Array<{ id: string; field: string }>;
  };
  imbalanceWarnings: string[];
}

function emptyReasonCounts(): Record<CoachEligibilityReason, number> {
  return {
    eligible: 0,
    "missing-correct-answer": 0,
    "missing-solution-note": 0,
    "generic-solution-note": 0,
    "short-solution-note": 0,
    "insufficient-explanation": 0,
    "partial-explanation": 0,
  };
}

function emptyQualityTiers(): Record<SolutionNoteQualityTier, number> {
  return {
    missing: 0,
    "generic-placeholder": 0,
    thin: 0,
    explained: 0,
    "coach-ready": 0,
  };
}

function normalizeTemplate(text: string | undefined): string {
  return (text ?? "").trim();
}

function classifySolutionNoteQuality(puzzle: Puzzle): SolutionNoteQualityTier {
  const eligibility = checkCoachEligibility(puzzle);

  if (eligibility.reason === "missing-solution-note") return "missing";
  if (eligibility.reason === "generic-solution-note") return "generic-placeholder";
  if (eligibility.qualityTier === "coach-ready") return "coach-ready";
  if (eligibility.qualityTier === "explained") return "explained";
  return "thin";
}

function collectPromptTemplateStats(puzzles: Puzzle[]) {
  const uniqueCountsByLocale = LOCALES.reduce(
    (acc, locale) => {
      acc[locale] = 0;
      return acc;
    },
    {} as Record<Locale, number>,
  );

  const topTemplatesByLocale = LOCALES.reduce(
    (acc, locale) => {
      acc[locale] = [];
      return acc;
    },
    {} as Record<Locale, TemplateStat[]>,
  );

  for (const locale of LOCALES) {
    const counts = new Map<string, number>();
    for (const puzzle of puzzles) {
      const template = normalizeTemplate(puzzle.prompt?.[locale]);
      if (!template) continue;
      counts.set(template, (counts.get(template) ?? 0) + 1);
    }

    uniqueCountsByLocale[locale] = counts.size;
    topTemplatesByLocale[locale] = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, TOP_TEMPLATE_LIMIT)
      .map(([template, count]) => ({ template, count }));
  }

  return { uniqueCountsByLocale, topTemplatesByLocale };
}

function buildImbalanceWarnings(
  total: number,
  boardSizeDistribution: Record<string, number>,
  difficultyDistribution: Record<string, number>,
  tagDistribution: Record<string, number>,
): string[] {
  const warnings: string[] = [];

  if (Object.keys(boardSizeDistribution).length === 1) {
    const [onlyBoardSize] = Object.keys(boardSizeDistribution);
    warnings.push(
      `All puzzles currently use ${onlyBoardSize}x${onlyBoardSize}; there is no board-size diversity yet.`,
    );
  }

  for (const [difficulty, count] of Object.entries(difficultyDistribution)) {
    const ratio = count / total;
    if (ratio >= 0.4) {
      warnings.push(
        `Difficulty ${difficulty} is over-concentrated at ${(ratio * 100).toFixed(1)}% of the library.`,
      );
    }
  }

  for (const [tag, count] of Object.entries(tagDistribution)) {
    const ratio = count / total;
    if (ratio >= 0.6) {
      warnings.push(`Tag "${tag}" dominates ${(ratio * 100).toFixed(1)}% of the library.`);
    } else if (ratio > 0 && ratio <= 0.05) {
      warnings.push(
        `Tag "${tag}" is underrepresented at ${(ratio * 100).toFixed(1)}% of the library.`,
      );
    }
  }

  return warnings;
}

function compareSummaryIndex(
  computedSummaries: PuzzleSummary[],
  summaryIndex: PuzzleSummary[],
): AuditResult["indexConsistency"] {
  const computedIds = new Set(computedSummaries.map((summary) => summary.id));
  const indexIds = new Set(summaryIndex.map((summary) => summary.id));

  const staleIndexIds = [...indexIds].filter((id) => !computedIds.has(id)).sort();
  const missingSummaryIds = [...computedIds].filter((id) => !indexIds.has(id)).sort();

  return {
    computedSummaryCount: computedSummaries.length,
    indexSummaryCount: summaryIndex.length,
    staleIndexIds,
    missingSummaryIds,
  };
}

function readSummaryIndexFromDisk(): PuzzleSummary[] {
  const indexPath = path.join(process.cwd(), "content/data/puzzleIndex.json");
  return JSON.parse(fs.readFileSync(indexPath, "utf-8")) as PuzzleSummary[];
}

export function auditPuzzles(puzzles: Puzzle[], options: AuditOptions = {}): AuditResult {
  const today = options.today ?? todayLocalYmd();
  const summaryIndex = options.summaryIndex ?? buildPuzzleSummaries(puzzles);
  const computedSummaries = buildPuzzleSummaries(puzzles);

  const result: AuditResult = {
    generatedAt: new Date().toISOString(),
    total: puzzles.length,
    boardSizeDistribution: {},
    difficultyDistribution: {},
    tagDistribution: {},
    dateRange: null,
    indexConsistency: compareSummaryIndex(computedSummaries, summaryIndex),
    coachEligibleCandidates: [],
    coachEligibilityReasons: emptyReasonCounts(),
    solutionNoteQualityTiers: emptyQualityTiers(),
    promptTemplateStats: collectPromptTemplateStats(puzzles),
    anomalies: {
      longPrompts: [],
      longSolutionNotes: [],
      missingFields: [],
    },
    imbalanceWarnings: [],
  };

  let minDate = "";
  let maxDate = "";

  for (const puzzle of puzzles) {
    result.boardSizeDistribution[puzzle.boardSize] =
      (result.boardSizeDistribution[puzzle.boardSize] || 0) + 1;
    result.difficultyDistribution[puzzle.difficulty] =
      (result.difficultyDistribution[puzzle.difficulty] || 0) + 1;
    result.tagDistribution[puzzle.tag] = (result.tagDistribution[puzzle.tag] || 0) + 1;

    if (puzzle.date) {
      if (!minDate || puzzle.date < minDate) minDate = puzzle.date;
      if (!maxDate || puzzle.date > maxDate) maxDate = puzzle.date;
    } else {
      result.anomalies.missingFields.push({ id: puzzle.id, field: "date" });
    }

    if (puzzle.prompt) {
      for (const locale of LOCALES) {
        const text = normalizeTemplate(puzzle.prompt[locale]);
        if (!text) {
          result.anomalies.missingFields.push({ id: puzzle.id, field: `prompt.${locale}` });
        } else if (text.length > PROMPT_LENGTH_THRESHOLD) {
          result.anomalies.longPrompts.push({ id: puzzle.id, length: text.length, locale });
        }
      }
    } else {
      result.anomalies.missingFields.push({ id: puzzle.id, field: "prompt" });
    }

    if (puzzle.solutionNote) {
      for (const locale of LOCALES) {
        const text = normalizeTemplate(puzzle.solutionNote[locale]);
        if (!text) {
          result.anomalies.missingFields.push({ id: puzzle.id, field: `solutionNote.${locale}` });
        } else if (text.length > SOLUTION_NOTE_LENGTH_THRESHOLD) {
          result.anomalies.longSolutionNotes.push({ id: puzzle.id, length: text.length, locale });
        }
      }
    } else {
      result.anomalies.missingFields.push({ id: puzzle.id, field: "solutionNote" });
    }

    if (!puzzle.id) result.anomalies.missingFields.push({ id: "unknown", field: "id" });
    if (!puzzle.correct || puzzle.correct.length === 0) {
      result.anomalies.missingFields.push({ id: puzzle.id, field: "correct" });
    }
    if (!puzzle.stones) result.anomalies.missingFields.push({ id: puzzle.id, field: "stones" });

    const eligibility = checkCoachEligibility(puzzle);
    result.coachEligibilityReasons[eligibility.reason] += 1;
    result.solutionNoteQualityTiers[classifySolutionNoteQuality(puzzle)] += 1;

    if (eligibility.eligible) {
      result.coachEligibleCandidates.push({
        id: puzzle.id,
        eligible: eligibility.eligible,
        reason: eligibility.reason,
        qualityTier: eligibility.qualityTier,
        averageNoteLength: eligibility.averageNoteLength,
        hasVariationSupport: eligibility.hasVariationSupport,
      });
    }
  }

  if (minDate && maxDate) {
    result.dateRange = { min: minDate, max: maxDate };
  }

  result.coachEligibleCandidates.sort(
    (a, b) => b.averageNoteLength - a.averageNoteLength || a.id.localeCompare(b.id),
  );

  result.imbalanceWarnings = buildImbalanceWarnings(
    result.total,
    result.boardSizeDistribution,
    result.difficultyDistribution,
    result.tagDistribution,
  );

  return result;
}

export function generateMarkdownReport(result: AuditResult): string {
  const topPromptStats = LOCALES.map((locale) => {
    const rows = result.promptTemplateStats.topTemplatesByLocale[locale]
      .map(({ template, count }) => `  - ${locale}: "${template}" × ${count}`)
      .join("\n");
    return rows || `  - ${locale}: (no templates found)`;
  }).join("\n");

  const warnings =
    result.imbalanceWarnings.length > 0
      ? result.imbalanceWarnings.map((warning) => `- ${warning}`).join("\n")
      : "- None";

  return `
# Puzzle Library Audit Report

## Summary
- **Generated At:** ${result.generatedAt}
- **Total Puzzles:** ${result.total}
- **Date Range:** ${result.dateRange ? `${result.dateRange.min} to ${result.dateRange.max}` : "N/A"}

## Index Consistency
- **Computed Summaries:** ${result.indexConsistency.computedSummaryCount}
- **Index Summaries:** ${result.indexConsistency.indexSummaryCount}
- **Stale Index IDs:** ${result.indexConsistency.staleIndexIds.length}
- **Missing Summary IDs:** ${result.indexConsistency.missingSummaryIds.length}

## Distributions

### Board Size
${Object.entries(result.boardSizeDistribution)
  .map(([size, count]) => `- **${size}x${size}:** ${count}`)
  .join("\n")}

### Difficulty
${Object.entries(result.difficultyDistribution)
  .map(([difficulty, count]) => `- **Level ${difficulty}:** ${count}`)
  .join("\n")}

### Tags
${Object.entries(result.tagDistribution)
  .map(([tag, count]) => `- **${tag}:** ${count}`)
  .join("\n")}

## Coach Eligibility
- **Eligible Candidates:** ${result.coachEligibleCandidates.length}
- **Reason Breakdown:** ${Object.entries(result.coachEligibilityReasons)
    .map(([reason, count]) => `${reason}=${count}`)
    .join(", ")}
- **Quality Tiers:** ${Object.entries(result.solutionNoteQualityTiers)
    .map(([tier, count]) => `${tier}=${count}`)
    .join(", ")}

## Prompt Template Dedupe
- **Unique Template Counts:** ${LOCALES.map(
    (locale) => `${locale}=${result.promptTemplateStats.uniqueCountsByLocale[locale]}`,
  ).join(", ")}
${topPromptStats}

## Imbalance Warnings
${warnings}

## Anomalies Summary
- **Long Prompts (>${PROMPT_LENGTH_THRESHOLD} chars):** ${result.anomalies.longPrompts.length}
- **Long Solution Notes (>${SOLUTION_NOTE_LENGTH_THRESHOLD} chars):** ${result.anomalies.longSolutionNotes.length}
- **Missing Fields:** ${result.anomalies.missingFields.length}
`.trim();
}

if (require.main === module) {
  const result = auditPuzzles(PUZZLES, {
    summaryIndex: readSummaryIndexFromDisk(),
  });

  fs.mkdirSync(AUDIT_OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(AUDIT_JSON_PATH, `${JSON.stringify(result, null, 2)}\n`, "utf-8");
  fs.writeFileSync(AUDIT_MARKDOWN_PATH, `${generateMarkdownReport(result)}\n`, "utf-8");

  console.log(generateMarkdownReport(result));
  console.log("\n[SUCCESS] Audit completed.");
  console.log(`- JSON Detail: ${AUDIT_JSON_PATH}`);
  console.log(`- Markdown Summary: ${AUDIT_MARKDOWN_PATH}`);
}

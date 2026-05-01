/**
 * Solution note quality sampling report.
 *
 * Samples puzzles from high-difficulty, random, and duplicate-adjacent pools
 * and outputs a Markdown report for manual review.
 *
 * Run via:  npx tsx scripts/reportQuality.ts
 *
 * Output:
 *   reports/quality/latest.json  - machine-readable detail
 *   reports/quality/latest.md    - human-readable summary
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";

import { PUZZLES } from "../content/puzzles.server";
import { checkCoachEligibility, type CoachEligibilityResult } from "../lib/coach/coachEligibility";
import type { Puzzle, Stone } from "../types";

const OUTPUT_DIR = path.join(process.cwd(), "reports/quality");
const JSON_PATH = path.join(OUTPUT_DIR, "latest.json");
const MD_PATH = path.join(OUTPUT_DIR, "latest.md");

const LOCALES = ["zh", "en", "ja", "ko"] as const;

interface QualitySample {
  id: string;
  difficulty: number;
  tag: string;
  boardSize: number;
  correctMove: string;
  hasSolutionSequence: boolean;
  hasWrongBranches: boolean;
  solutionNoteLengths: Record<string, number>;
  eligibilityReason: string;
  qualityTier: string;
  averageNoteLength: number;
  hasDuplicatePosition: boolean;
  duplicateGroupSize: number;
  suggestReview: boolean;
  reviewReasons: string[];
}

interface QualityReport {
  generatedAt: string;
  totalPuzzles: number;
  sampleSize: number;
  samples: QualitySample[];
  summary: {
    highDifficultyCount: number;
    randomCount: number;
    duplicateAdjacentCount: number;
    suggestReviewCount: number;
    avgNoteLength: number;
    missingSequenceCount: number;
    missingWrongBranchesCount: number;
  };
}

function stableHash(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function sortStones(stones: Stone[]): string {
  return stones
    .map((s) => `${s.x},${s.y},${s.color}`)
    .sort()
    .join("|");
}

function canonicalKey(puzzle: Puzzle): string {
  return [
    puzzle.boardSize,
    puzzle.toPlay,
    sortStones(puzzle.stones ?? []),
    (puzzle.correct ?? [])
      .map((c) => `${c.x},${c.y}`)
      .sort()
      .join("|"),
  ].join("::");
}

function buildDuplicateMap(): Map<string, number> {
  const buckets = new Map<string, number>();
  for (const puzzle of PUZZLES) {
    const key = canonicalKey(puzzle);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return buckets;
}

function sampleRandom<T>(arr: T[], count: number, seed: string): T[] {
  const shuffled = [...arr].sort((a, b) => {
    const ha = stableHash(seed + JSON.stringify(a));
    const hb = stableHash(seed + JSON.stringify(b));
    return ha.localeCompare(hb);
  });
  return shuffled.slice(0, count);
}

function evaluateSample(
  puzzle: Puzzle,
  duplicateMap: Map<string, number>,
  eligibility: CoachEligibilityResult,
): QualitySample {
  const key = canonicalKey(puzzle);
  const dupCount = duplicateMap.get(key) ?? 1;
  const hasDup = dupCount > 1;

  const noteLengths: Record<string, number> = {};
  let totalLen = 0;
  let localeCount = 0;
  for (const locale of LOCALES) {
    const len = (puzzle.solutionNote?.[locale] ?? "").length;
    noteLengths[locale] = len;
    totalLen += len;
    localeCount++;
  }
  const avgLen = localeCount > 0 ? totalLen / localeCount : 0;

  const reviewReasons: string[] = [];
  if (eligibility.reason !== "eligible") {
    reviewReasons.push(`eligibility: ${eligibility.reason}`);
  }
  if (!puzzle.solutionSequence || puzzle.solutionSequence.length === 0) {
    reviewReasons.push("missing solutionSequence");
  }
  if (!puzzle.wrongBranches || puzzle.wrongBranches.length === 0) {
    reviewReasons.push("missing wrongBranches");
  }
  if (hasDup) {
    reviewReasons.push(`duplicate group size: ${dupCount}`);
  }
  if (avgLen < 72) {
    reviewReasons.push(`short average note: ${Math.round(avgLen)} chars`);
  }
  if (puzzle.difficulty >= 4) {
    reviewReasons.push(`high difficulty: ${puzzle.difficulty}`);
  }

  return {
    id: puzzle.id,
    difficulty: puzzle.difficulty,
    tag: puzzle.tag,
    boardSize: puzzle.boardSize,
    correctMove: (puzzle.correct ?? []).map((c) => `(${c.x},${c.y})`).join(", "),
    hasSolutionSequence: !!(puzzle.solutionSequence && puzzle.solutionSequence.length > 0),
    hasWrongBranches: !!(puzzle.wrongBranches && puzzle.wrongBranches.length > 0),
    solutionNoteLengths: noteLengths,
    eligibilityReason: eligibility.reason,
    qualityTier: eligibility.qualityTier,
    averageNoteLength: Math.round(avgLen),
    hasDuplicatePosition: hasDup,
    duplicateGroupSize: dupCount,
    suggestReview: reviewReasons.length > 0,
    reviewReasons,
  };
}

function buildReport(): QualityReport {
  const duplicateMap = buildDuplicateMap();

  // Pool 1: High difficulty (4-5)
  const highDifficulty = PUZZLES.filter((p) => p.difficulty >= 4);
  const highDiffSample = sampleRandom(highDifficulty, 100, "high-difficulty-seed");

  // Pool 2: Random across all
  const randomSample = sampleRandom(PUZZLES, 50, "random-seed-v1");

  // Pool 3: Duplicate-adjacent (puzzles that share positions)
  const dupPuzzles = PUZZLES.filter((p) => (duplicateMap.get(canonicalKey(p)) ?? 1) > 1);
  const dupSample = sampleRandom(dupPuzzles, 50, "duplicate-seed");

  // Deduplicate samples by ID
  const seenIds = new Set<string>();
  const allSamples: Puzzle[] = [];
  for (const p of [...highDiffSample, ...randomSample, ...dupSample]) {
    if (!seenIds.has(p.id)) {
      seenIds.add(p.id);
      allSamples.push(p);
    }
  }

  // Evaluate each sample
  const samples = allSamples.map((p) => evaluateSample(p, duplicateMap, checkCoachEligibility(p)));

  // Sort: suggestReview first, then by difficulty desc, then by ID
  samples.sort((a, b) => {
    if (a.suggestReview !== b.suggestReview) return a.suggestReview ? -1 : 1;
    if (a.difficulty !== b.difficulty) return b.difficulty - a.difficulty;
    return a.id.localeCompare(b.id);
  });

  const suggestReviewCount = samples.filter((s) => s.suggestReview).length;
  const totalNoteLen = samples.reduce((sum, s) => sum + s.averageNoteLength, 0);

  return {
    generatedAt: new Date().toISOString(),
    totalPuzzles: PUZZLES.length,
    sampleSize: samples.length,
    samples,
    summary: {
      highDifficultyCount: highDiffSample.length,
      randomCount: randomSample.length,
      duplicateAdjacentCount: dupSample.length,
      suggestReviewCount,
      avgNoteLength: samples.length > 0 ? Math.round(totalNoteLen / samples.length) : 0,
      missingSequenceCount: samples.filter((s) => !s.hasSolutionSequence).length,
      missingWrongBranchesCount: samples.filter((s) => !s.hasWrongBranches).length,
    },
  };
}

function generateMarkdown(report: QualityReport): string {
  const lines = [
    `# Solution Note Quality Report`,
    ``,
    `## Summary`,
    `- **Generated At:** ${report.generatedAt}`,
    `- **Total Puzzles:** ${report.totalPuzzles}`,
    `- **Sample Size:** ${report.sampleSize}`,
    `  - High difficulty (4-5): ${report.summary.highDifficultyCount}`,
    `  - Random: ${report.summary.randomCount}`,
    `  - Duplicate-adjacent: ${report.summary.duplicateAdjacentCount}`,
    `- **Suggest Review:** ${report.summary.suggestReviewCount} / ${report.sampleSize}`,
    `- **Avg Note Length:** ${report.summary.avgNoteLength} chars`,
    `- **Missing solutionSequence:** ${report.summary.missingSequenceCount}`,
    `- **Missing wrongBranches:** ${report.summary.missingWrongBranchesCount}`,
    ``,
  ];

  // Top review candidates
  const reviewCandidates = report.samples.filter((s) => s.suggestReview).slice(0, 50);
  if (reviewCandidates.length > 0) {
    lines.push(`## Top Review Candidates (up to 50)`);
    lines.push(``);
    lines.push(
      `| # | Puzzle ID | Diff | Tag | Board | Correct | Avg Note | Dup Group | Review Reasons |`,
    );
    lines.push(
      `|---|----------|------|-----|-------|---------|----------|-----------|----------------|`,
    );
    for (let i = 0; i < reviewCandidates.length; i++) {
      const s = reviewCandidates[i];
      lines.push(
        `| ${i + 1} | ${s.id} | ${s.difficulty} | ${s.tag} | ${s.boardSize}x${s.boardSize} | ${s.correctMove} | ${s.averageNoteLength} | ${s.hasDuplicatePosition ? s.duplicateGroupSize : "-"} | ${s.reviewReasons.join("; ")} |`,
      );
    }
    lines.push(``);
  }

  // Quality tier distribution
  const tierCounts = new Map<string, number>();
  for (const s of report.samples) {
    tierCounts.set(s.qualityTier, (tierCounts.get(s.qualityTier) ?? 0) + 1);
  }
  lines.push(`## Quality Tier Distribution (sampled)`);
  lines.push(``);
  for (const [tier, count] of [...tierCounts.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`- **${tier}:** ${count}`);
  }
  lines.push(``);

  // Eligibility reason distribution
  const reasonCounts = new Map<string, number>();
  for (const s of report.samples) {
    reasonCounts.set(s.eligibilityReason, (reasonCounts.get(s.eligibilityReason) ?? 0) + 1);
  }
  lines.push(`## Eligibility Reason Distribution (sampled)`);
  lines.push(``);
  for (const [reason, count] of [...reasonCounts.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`- **${reason}:** ${count}`);
  }
  lines.push(``);

  return lines.join("\n");
}

if (require.main === module) {
  const report = buildReport();

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(JSON_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
  fs.writeFileSync(MD_PATH, `${generateMarkdown(report)}\n`, "utf-8");

  console.log(generateMarkdown(report));
  console.log(`\n[SUCCESS] Quality report generated.`);
  console.log(`- JSON Detail: ${JSON_PATH}`);
  console.log(`- Markdown Summary: ${MD_PATH}`);
}

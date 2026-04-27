import fs from "fs";
import path from "path";

import coachEligibleIds from "../content/data/coachEligibleIds.json";
import { PUZZLES } from "../content/puzzles.server";
import { checkCoachEligibility, type CoachQualityTier } from "../lib/coach/coachEligibility";
import type { Puzzle, PuzzleSummary, PuzzleTag } from "../types";

import { auditPuzzles } from "./auditPuzzles";

export const CONTENT_QUEUE_OUTPUT_DIR = path.join(process.cwd(), "reports/content-queue");
export const CONTENT_QUEUE_JSON_PATH = path.join(CONTENT_QUEUE_OUTPUT_DIR, "latest.json");
export const CONTENT_QUEUE_MARKDOWN_PATH = path.join(CONTENT_QUEUE_OUTPUT_DIR, "latest.md");

export interface QueueCandidate {
  id: string;
  source: string;
  date: string;
  tag: PuzzleTag;
  difficulty: number;
  eligible: boolean;
  qualityTier: CoachQualityTier;
  reason: string;
  averageNoteLength: number;
  stabilityScore: number;
  scarcityScore: number;
  alreadyApproved: boolean;
  rationale: string[];
}

export interface ContentQueueResult {
  generatedAt: string;
  totalPuzzles: number;
  currentApprovedCoachCount: number;
  coachReadyCandidates: QueueCandidate[];
}

interface QueueOptions {
  today?: string;
  summaryIndex?: PuzzleSummary[];
  approvedIds?: string[];
}

function readSummaryIndexFromDisk(): PuzzleSummary[] {
  const indexPath = path.join(process.cwd(), "content/data/puzzleIndex.json");
  return JSON.parse(fs.readFileSync(indexPath, "utf-8")) as PuzzleSummary[];
}

function tagScarcityScore(tagDistribution: Record<string, number>, tag: PuzzleTag): number {
  return 1 / Math.max(tagDistribution[tag] ?? 1, 1);
}

function difficultyScarcityScore(
  difficultyDistribution: Record<string, number>,
  difficulty: number,
): number {
  return 1 / Math.max(difficultyDistribution[String(difficulty)] ?? 1, 1);
}

function qualityWeight(qualityTier: CoachQualityTier): number {
  switch (qualityTier) {
    case "coach-ready":
      return 4;
    case "explained":
      return 3;
    case "thin":
      return 2;
    case "blocked":
    default:
      return 1;
  }
}

function stabilityScore(puzzle: Puzzle, averageNoteLength: number): number {
  let score = Math.min(averageNoteLength / 120, 1.5);
  if ((puzzle.solutionSequence?.length ?? 0) > 0) score += 1;
  if ((puzzle.wrongBranches?.length ?? 0) > 0) score += 1;
  return Number(score.toFixed(2));
}

function buildRationale(
  puzzle: Puzzle,
  scarcityScore: number,
  averageNoteLength: number,
  qualityTier: CoachQualityTier,
): string[] {
  return [
    `quality=${qualityTier}`,
    `tag=${puzzle.tag} difficulty=${puzzle.difficulty}`,
    `scarcity=${scarcityScore.toFixed(4)}`,
    `avgNoteLength=${averageNoteLength}`,
  ];
}

function compareCandidates(a: QueueCandidate, b: QueueCandidate): number {
  return (
    Number(b.eligible) - Number(a.eligible) ||
    b.scarcityScore - a.scarcityScore ||
    b.stabilityScore - a.stabilityScore ||
    b.averageNoteLength - a.averageNoteLength ||
    a.id.localeCompare(b.id)
  );
}

export function buildContentQueue(
  puzzles: Puzzle[],
  options: QueueOptions = {},
): ContentQueueResult {
  const approvedIds = new Set(options.approvedIds ?? (coachEligibleIds as string[]));
  const audit = auditPuzzles(puzzles, {
    today: options.today,
    summaryIndex: options.summaryIndex,
  });

  const coachReadyCandidates = puzzles
    .map((puzzle) => {
      const eligibility = checkCoachEligibility(puzzle);
      const scarcityScore =
        tagScarcityScore(audit.tagDistribution, puzzle.tag) +
        difficultyScarcityScore(audit.difficultyDistribution, puzzle.difficulty);

      return {
        id: puzzle.id,
        source: puzzle.source || puzzle.date,
        date: puzzle.date,
        tag: puzzle.tag,
        difficulty: puzzle.difficulty,
        eligible: eligibility.eligible,
        qualityTier: eligibility.qualityTier,
        reason: eligibility.reason,
        averageNoteLength: eligibility.averageNoteLength,
        stabilityScore: stabilityScore(puzzle, eligibility.averageNoteLength),
        scarcityScore: Number(scarcityScore.toFixed(4)),
        alreadyApproved: approvedIds.has(puzzle.id),
        rationale: buildRationale(
          puzzle,
          scarcityScore,
          eligibility.averageNoteLength,
          eligibility.qualityTier,
        ),
      } satisfies QueueCandidate;
    })
    .filter((candidate) => candidate.qualityTier === "coach-ready")
    .sort(compareCandidates);

  return {
    generatedAt: new Date().toISOString(),
    totalPuzzles: puzzles.length,
    currentApprovedCoachCount: approvedIds.size,
    coachReadyCandidates,
  };
}

export function generateContentQueueMarkdown(result: ContentQueueResult): string {
  const topCoach = result.coachReadyCandidates
    .slice(0, 10)
    .map(
      (candidate) =>
        `- ${candidate.id} · ${candidate.tag} · d${candidate.difficulty} · ${candidate.qualityTier} · approved=${candidate.alreadyApproved}`,
    )
    .join("\n");

  return `
# Content Queue Report

## Summary
- **Generated At:** ${result.generatedAt}
- **Total Puzzles:** ${result.totalPuzzles}
- **Current Approved Coach Count:** ${result.currentApprovedCoachCount}
- **Coach-ready Candidates:** ${result.coachReadyCandidates.length}

## Top Coach-ready Candidates
${topCoach || "- None"}
`.trim();
}

if (require.main === module) {
  const result = buildContentQueue(PUZZLES, {
    summaryIndex: readSummaryIndexFromDisk(),
  });

  fs.mkdirSync(CONTENT_QUEUE_OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(CONTENT_QUEUE_JSON_PATH, `${JSON.stringify(result, null, 2)}\n`, "utf-8");
  fs.writeFileSync(
    CONTENT_QUEUE_MARKDOWN_PATH,
    `${generateContentQueueMarkdown(result)}\n`,
    "utf-8",
  );

  console.log(generateContentQueueMarkdown(result));
  console.log("\n[SUCCESS] Content queue completed.");
  console.log(`- JSON Detail: ${CONTENT_QUEUE_JSON_PATH}`);
  console.log(`- Markdown Summary: ${CONTENT_QUEUE_MARKDOWN_PATH}`);
}

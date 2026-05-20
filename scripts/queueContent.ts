import fs from "fs";
import path from "path";

import { COACH_READY_IDS } from "../content/coachContent";
import { PUZZLES } from "../content/puzzles.server";
import { checkCoachEligibility, type CoachQualityTier } from "../lib/coach/coachEligibility";
import type { Coord, Locale, Puzzle, PuzzleSummary, PuzzleTag, Stone } from "../types";

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
  priorityScore: number;
  alreadyApproved: boolean;
  hasSolutionSequence: boolean;
  hasWrongBranches: boolean;
  duplicateGroupSize: number;
  representativeOfDuplicateGroup: boolean;
  rationale: string[];
}

export interface DuplicateGovernanceCandidate {
  canonicalKey: string;
  puzzleIds: string[];
  boardSize: number;
  toPlay: string;
  groupSize: number;
  sameTag: boolean;
  sameDifficulty: boolean;
  sameSource: boolean;
  samePrompt: boolean;
  sameSolutionNote: boolean;
  tags: PuzzleTag[];
  difficulties: number[];
  sources: string[];
  priorityScore: number;
  rationale: string[];
}

export interface IntroductoryExpansionCandidate {
  boardSize: 9 | 13;
  tag: PuzzleTag;
  difficulty: 1 | 2;
  existingCount: number;
  priorityScore: number;
  rationale: string[];
}

export interface ContentQueueResult {
  generatedAt: string;
  totalPuzzles: number;
  currentApprovedCoachCount: number;
  coachReadyCandidates: QueueCandidate[];
  mainlineQueue: QueueCandidate[];
  wrongBranchQueue: QueueCandidate[];
  duplicateGovernanceQueue: DuplicateGovernanceCandidate[];
  introductoryExpansionQueue: IntroductoryExpansionCandidate[];
}

interface QueueOptions {
  today?: string;
  summaryIndex?: PuzzleSummary[];
  approvedIds?: string[];
}

const LOCALES: Locale[] = ["zh", "en", "ja", "ko"];
const INTRO_BOARD_SIZES = [9, 13] as const;
const INTRO_TAGS: PuzzleTag[] = ["life-death", "tesuji", "endgame", "opening"];
const INTRO_DIFFICULTIES = [1, 2] as const;

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

function stabilityScore(puzzle: Puzzle, averageNoteLength: number): number {
  let score = Math.min(averageNoteLength / 120, 1.5);
  if ((puzzle.solutionSequence?.length ?? 0) > 0) score += 1;
  if ((puzzle.wrongBranches?.length ?? 0) > 0) score += 1;
  return Number(score.toFixed(2));
}

function sortCoords(coords: Coord[]): string {
  return coords
    .map((coord) => `${coord.x},${coord.y}`)
    .sort()
    .join("|");
}

function sortStones(stones: Stone[]): string {
  return stones
    .map((stone) => `${stone.x},${stone.y},${stone.color}`)
    .sort()
    .join("|");
}

function canonicalPuzzleKey(puzzle: Puzzle): string {
  return [
    puzzle.boardSize,
    puzzle.toPlay,
    sortStones(puzzle.stones ?? []),
    sortCoords(puzzle.correct ?? []),
  ].join("::");
}

function allSame(values: string[]): boolean {
  return new Set(values).size === 1;
}

function buildDuplicateGroups(puzzles: Puzzle[]): DuplicateGovernanceCandidate[] {
  const buckets = new Map<string, Puzzle[]>();

  for (const puzzle of puzzles) {
    const key = canonicalPuzzleKey(puzzle);
    buckets.set(key, [...(buckets.get(key) ?? []), puzzle]);
  }

  const groups: DuplicateGovernanceCandidate[] = [];
  for (const [canonicalKey, groupPuzzles] of buckets) {
    if (groupPuzzles.length < 2) continue;

    const puzzleIds = groupPuzzles.map((puzzle) => puzzle.id).sort();
    const sameTag = allSame(groupPuzzles.map((puzzle) => puzzle.tag));
    const sameDifficulty = allSame(groupPuzzles.map((puzzle) => String(puzzle.difficulty)));
    const sameSource = allSame(groupPuzzles.map((puzzle) => puzzle.source ?? ""));
    const samePrompt = LOCALES.every((locale) =>
      allSame(groupPuzzles.map((puzzle) => puzzle.prompt?.[locale] ?? "")),
    );
    const sameSolutionNote = LOCALES.every((locale) =>
      allSame(groupPuzzles.map((puzzle) => puzzle.solutionNote?.[locale] ?? "")),
    );
    const tags = [...new Set(groupPuzzles.map((puzzle) => puzzle.tag))].sort() as PuzzleTag[];
    const difficulties = [...new Set(groupPuzzles.map((puzzle) => puzzle.difficulty))].sort(
      (a, b) => a - b,
    );
    const sources = [...new Set(groupPuzzles.map((puzzle) => puzzle.source ?? "(none)"))].sort();
    const differsOnlyInNotes =
      sameTag && sameDifficulty && sameSource && samePrompt && !sameSolutionNote;
    const priorityScore =
      groupPuzzles.length * 10 +
      Math.max(...groupPuzzles.map((puzzle) => puzzle.difficulty)) +
      (differsOnlyInNotes ? 3 : 0) +
      (tags.includes("endgame") || tags.includes("opening") ? 2 : 0);

    groups.push({
      canonicalKey,
      puzzleIds,
      boardSize: groupPuzzles[0].boardSize,
      toPlay: groupPuzzles[0].toPlay,
      groupSize: groupPuzzles.length,
      sameTag,
      sameDifficulty,
      sameSource,
      samePrompt,
      sameSolutionNote,
      tags,
      difficulties,
      sources,
      priorityScore: Number(priorityScore.toFixed(2)),
      rationale: [
        `groupSize=${groupPuzzles.length}`,
        differsOnlyInNotes ? "same position; note differs" : "same position; metadata differs",
        `tags=${tags.join(",")}`,
        `difficulties=${difficulties.join(",")}`,
      ],
    });
  }

  return groups.sort(
    (a, b) =>
      b.priorityScore - a.priorityScore ||
      b.groupSize - a.groupSize ||
      a.puzzleIds[0].localeCompare(b.puzzleIds[0]),
  );
}

function buildDuplicateLookup(
  duplicateGroups: DuplicateGovernanceCandidate[],
): Map<string, DuplicateGovernanceCandidate> {
  const lookup = new Map<string, DuplicateGovernanceCandidate>();
  for (const group of duplicateGroups) {
    for (const id of group.puzzleIds) {
      lookup.set(id, group);
    }
  }
  return lookup;
}

function buildPriorityScore(
  puzzle: Puzzle,
  stability: number,
  scarcity: number,
  duplicateGroupSize: number,
): number {
  const difficultyWeight = puzzle.difficulty >= 4 ? puzzle.difficulty * 2 : puzzle.difficulty;
  const duplicateWeight = duplicateGroupSize > 1 ? Math.min(duplicateGroupSize, 5) : 0;
  return Number((difficultyWeight + stability + scarcity * 100 + duplicateWeight).toFixed(2));
}

function buildRationale(
  puzzle: Puzzle,
  scarcityScore: number,
  averageNoteLength: number,
  qualityTier: CoachQualityTier,
  duplicateGroupSize: number,
): string[] {
  return [
    `quality=${qualityTier}`,
    `tag=${puzzle.tag} difficulty=${puzzle.difficulty}`,
    `scarcity=${scarcityScore.toFixed(4)}`,
    `avgNoteLength=${averageNoteLength}`,
    `duplicateGroupSize=${duplicateGroupSize}`,
  ];
}

function compareCandidates(a: QueueCandidate, b: QueueCandidate): number {
  return (
    Number(b.eligible) - Number(a.eligible) ||
    b.priorityScore - a.priorityScore ||
    b.stabilityScore - a.stabilityScore ||
    b.scarcityScore - a.scarcityScore ||
    b.averageNoteLength - a.averageNoteLength ||
    a.id.localeCompare(b.id)
  );
}

function buildIntroductoryExpansionQueue(
  puzzles: Puzzle[],
  audit: ReturnType<typeof auditPuzzles>,
): IntroductoryExpansionCandidate[] {
  const total = Math.max(puzzles.length, 1);
  const existingByTarget = new Map<string, number>();

  for (const puzzle of puzzles) {
    const key = `${puzzle.boardSize}:${puzzle.tag}:${puzzle.difficulty}`;
    existingByTarget.set(key, (existingByTarget.get(key) ?? 0) + 1);
  }

  const candidates: IntroductoryExpansionCandidate[] = [];
  for (const boardSize of INTRO_BOARD_SIZES) {
    for (const tag of INTRO_TAGS) {
      for (const difficulty of INTRO_DIFFICULTIES) {
        const key = `${boardSize}:${tag}:${difficulty}`;
        const existingCount = existingByTarget.get(key) ?? 0;
        const tagCount = audit.tagDistribution[tag] ?? 0;
        const boardCount = audit.boardSizeDistribution[String(boardSize)] ?? 0;
        const boardGapScore = boardCount === 0 ? 100 : Math.max(0, 20 - boardCount);
        const tagGapScore = tagCount / total <= 0.05 ? 25 : Math.max(0, 10 - tagCount / total);
        const difficultyScore = difficulty === 1 ? 5 : 3;
        const priorityScore = boardGapScore + tagGapScore + difficultyScore - existingCount;

        candidates.push({
          boardSize,
          tag,
          difficulty,
          existingCount,
          priorityScore: Number(priorityScore.toFixed(2)),
          rationale: [
            `boardSize=${boardSize}x${boardSize} existing=${boardCount}`,
            `tag=${tag} existing=${tagCount}`,
            `difficulty=${difficulty}`,
          ],
        });
      }
    }
  }

  return candidates.sort(
    (a, b) =>
      b.priorityScore - a.priorityScore ||
      a.boardSize - b.boardSize ||
      a.difficulty - b.difficulty ||
      a.tag.localeCompare(b.tag),
  );
}

export function buildContentQueue(
  puzzles: Puzzle[],
  options: QueueOptions = {},
): ContentQueueResult {
  const approvedIds = new Set(options.approvedIds ?? COACH_READY_IDS);
  const audit = auditPuzzles(puzzles, {
    today: options.today,
    summaryIndex: options.summaryIndex,
  });
  const duplicateGovernanceQueue = buildDuplicateGroups(puzzles);
  const duplicateLookup = buildDuplicateLookup(duplicateGovernanceQueue);

  const candidates = puzzles.map((puzzle) => {
    const eligibility = checkCoachEligibility(puzzle);
    const scarcityScore =
      tagScarcityScore(audit.tagDistribution, puzzle.tag) +
      difficultyScarcityScore(audit.difficultyDistribution, puzzle.difficulty);
    const duplicateGroup = duplicateLookup.get(puzzle.id);
    const duplicateGroupSize = duplicateGroup?.groupSize ?? 1;
    const representativeOfDuplicateGroup =
      duplicateGroupSize === 1 || duplicateGroup?.puzzleIds[0] === puzzle.id;
    const score = stabilityScore(puzzle, eligibility.averageNoteLength);

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
      stabilityScore: score,
      scarcityScore: Number(scarcityScore.toFixed(4)),
      priorityScore: buildPriorityScore(puzzle, score, scarcityScore, duplicateGroupSize),
      alreadyApproved: approvedIds.has(puzzle.id),
      hasSolutionSequence: (puzzle.solutionSequence?.length ?? 0) > 0,
      hasWrongBranches: (puzzle.wrongBranches?.length ?? 0) > 0,
      duplicateGroupSize,
      representativeOfDuplicateGroup,
      rationale: buildRationale(
        puzzle,
        scarcityScore,
        eligibility.averageNoteLength,
        eligibility.qualityTier,
        duplicateGroupSize,
      ),
    } satisfies QueueCandidate;
  });

  const coachReadyCandidates = candidates
    .filter((candidate) => candidate.qualityTier === "coach-ready")
    .sort(compareCandidates);
  const mainlineQueue = candidates
    .filter(
      (candidate) =>
        candidate.eligible &&
        !candidate.hasSolutionSequence &&
        candidate.representativeOfDuplicateGroup,
    )
    .sort(compareCandidates);
  const wrongBranchQueue = candidates
    .filter(
      (candidate) =>
        candidate.eligible && candidate.hasSolutionSequence && !candidate.hasWrongBranches,
    )
    .sort(compareCandidates);

  return {
    generatedAt: new Date().toISOString(),
    totalPuzzles: puzzles.length,
    currentApprovedCoachCount: candidates.filter(
      (candidate) => candidate.alreadyApproved && candidate.qualityTier === "coach-ready",
    ).length,
    coachReadyCandidates,
    mainlineQueue,
    wrongBranchQueue,
    duplicateGovernanceQueue,
    introductoryExpansionQueue: buildIntroductoryExpansionQueue(puzzles, audit),
  };
}

function renderCandidateList(candidates: QueueCandidate[], limit = 10): string {
  return (
    candidates
      .slice(0, limit)
      .map(
        (candidate) =>
          `- ${candidate.id} · ${candidate.tag} · d${candidate.difficulty} · ${candidate.qualityTier} · score=${candidate.priorityScore} · dup=${candidate.duplicateGroupSize} · approved=${candidate.alreadyApproved}`,
      )
      .join("\n") || "- None"
  );
}

export function generateContentQueueMarkdown(result: ContentQueueResult): string {
  const duplicateRows =
    result.duplicateGovernanceQueue
      .slice(0, 10)
      .map(
        (group) =>
          `- ${group.puzzleIds.join(", ")} · ${group.boardSize}x${group.boardSize} · size=${group.groupSize} · score=${group.priorityScore} · sameNote=${group.sameSolutionNote}`,
      )
      .join("\n") || "- None";
  const expansionRows =
    result.introductoryExpansionQueue
      .slice(0, 10)
      .map(
        (candidate) =>
          `- ${candidate.boardSize}x${candidate.boardSize} · ${candidate.tag} · d${candidate.difficulty} · existing=${candidate.existingCount} · score=${candidate.priorityScore}`,
      )
      .join("\n") || "- None";

  return `
# Content Queue Report

## Summary
- **Generated At:** ${result.generatedAt}
- **Total Puzzles:** ${result.totalPuzzles}
- **Current Approved Coach Count:** ${result.currentApprovedCoachCount}
- **Coach-ready Candidates:** ${result.coachReadyCandidates.length}
- **Mainline Backfill Candidates:** ${result.mainlineQueue.length}
- **Wrong-branch Backfill Candidates:** ${result.wrongBranchQueue.length}
- **Duplicate Governance Groups:** ${result.duplicateGovernanceQueue.length}
- **Introductory Expansion Targets:** ${result.introductoryExpansionQueue.length}

## Top Coach-ready Candidates
${renderCandidateList(result.coachReadyCandidates)}

## Top Mainline Backfill Candidates
${renderCandidateList(result.mainlineQueue)}

## Top Wrong-branch Backfill Candidates
${renderCandidateList(result.wrongBranchQueue)}

## Top Duplicate Governance Groups
${duplicateRows}

## Top Introductory Expansion Targets
${expansionRows}
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

import fs from "fs";
import path from "path";

import { PUZZLES } from "../content/puzzles.server";
import type { Coord, Puzzle, PuzzleSummary, PuzzleTag } from "../types";

import { buildContentQueue, type QueueCandidate } from "./queueContent";

export const CONTENT_BATCH_OUTPUT_DIR = path.join(process.cwd(), "reports/content-batch");
export const CONTENT_BATCH_JSON_PATH = path.join(CONTENT_BATCH_OUTPUT_DIR, "latest.json");
export const CONTENT_BATCH_MARKDOWN_PATH = path.join(CONTENT_BATCH_OUTPUT_DIR, "latest.md");

const DEFAULT_TARGET_PUZZLE_COUNT = 32;
const MAX_TARGET_PUZZLE_COUNT = 50;
const DUPLICATE_GROUP_TASK_LIMIT = 8;
const INTRODUCTORY_TARGET_LIMIT = 4;

type MissingDeepField = "solutionSequence" | "wrongBranches";
type PuzzleTaskSourceQueue = "mainlineQueue" | "wrongBranchQueue";

export interface PuzzleEditingTask {
  id: string;
  sourceQueue: PuzzleTaskSourceQueue;
  source: string;
  date: string;
  tag: PuzzleTag;
  difficulty: number;
  boardSize: 9 | 13 | 19;
  toPlay: string;
  correctMoves: string[];
  missingFields: MissingDeepField[];
  duplicateGroupSize: number;
  priorityScore: number;
  rationale: string[];
  checklist: string[];
}

export interface DuplicateEditingTask {
  puzzleIds: string[];
  groupSize: number;
  tags: PuzzleTag[];
  difficulties: number[];
  priorityScore: number;
  checklist: string[];
}

export interface IntroductoryTargetTask {
  boardSize: 9 | 13;
  tag: PuzzleTag;
  difficulty: 1 | 2;
  existingCount: number;
  priorityScore: number;
  checklist: string[];
}

export interface ContentBatchPlan {
  generatedAt: string;
  targetPuzzleCount: number;
  selectedPuzzleCount: number;
  safety: {
    generatedSolutionContent: false;
    requiresHumanReview: true;
    writesPuzzleData: false;
  };
  sourceQueueCounts: {
    mainlineQueue: number;
    wrongBranchQueue: number;
    duplicateGovernanceQueue: number;
    introductoryExpansionQueue: number;
  };
  puzzleTasks: PuzzleEditingTask[];
  duplicateEditingTasks: DuplicateEditingTask[];
  introductoryTargetTasks: IntroductoryTargetTask[];
}

interface ContentBatchOptions {
  targetPuzzleCount?: number;
  today?: string;
  summaryIndex?: PuzzleSummary[];
  approvedIds?: string[];
}

function readSummaryIndexFromDisk(): PuzzleSummary[] {
  const indexPath = path.join(process.cwd(), "content/data/puzzleIndex.json");
  return JSON.parse(fs.readFileSync(indexPath, "utf-8")) as PuzzleSummary[];
}

function resolveTargetPuzzleCount(targetPuzzleCount?: number): number {
  if (targetPuzzleCount === undefined) return DEFAULT_TARGET_PUZZLE_COUNT;
  if (!Number.isFinite(targetPuzzleCount)) return DEFAULT_TARGET_PUZZLE_COUNT;
  return Math.max(1, Math.min(Math.floor(targetPuzzleCount), MAX_TARGET_PUZZLE_COUNT));
}

function formatCoord(coord: Coord): string {
  return `(${coord.x},${coord.y})`;
}

function getMissingFields(candidate: QueueCandidate): MissingDeepField[] {
  const missing: MissingDeepField[] = [];
  if (!candidate.hasSolutionSequence) missing.push("solutionSequence");
  if (!candidate.hasWrongBranches) missing.push("wrongBranches");
  return missing;
}

function candidateToPuzzleTask(
  candidate: QueueCandidate,
  puzzle: Puzzle,
  sourceQueue: PuzzleTaskSourceQueue,
): PuzzleEditingTask {
  const needsMainline = !candidate.hasSolutionSequence;
  const needsWrongBranches = !candidate.hasWrongBranches;

  return {
    id: candidate.id,
    sourceQueue,
    source: candidate.source,
    date: candidate.date,
    tag: candidate.tag,
    difficulty: candidate.difficulty,
    boardSize: puzzle.boardSize,
    toPlay: puzzle.toPlay,
    correctMoves: puzzle.correct.map(formatCoord),
    missingFields: getMissingFields(candidate),
    duplicateGroupSize: candidate.duplicateGroupSize,
    priorityScore: candidate.priorityScore,
    rationale: candidate.rationale,
    checklist: [
      "Verify the correct move against the current board position.",
      needsMainline
        ? "Draft solutionSequence as a reviewed move list; do not infer unchecked variations."
        : "Review the existing solutionSequence before adding wrong branches.",
      needsWrongBranches
        ? "Draft 2-3 common wrongBranches with localized notes after manual reading."
        : "Confirm wrongBranches still match the reviewed main line.",
      "Run npm run validate:puzzles after editing puzzle data.",
      "Only mark coach-ready after a second human or model-assisted review pass.",
    ],
  };
}

function selectPuzzleTasks(
  puzzlesById: Map<string, Puzzle>,
  mainlineQueue: QueueCandidate[],
  wrongBranchQueue: QueueCandidate[],
  targetPuzzleCount: number,
): PuzzleEditingTask[] {
  const selected = new Set<string>();
  const tasks: PuzzleEditingTask[] = [];

  const addCandidate = (candidate: QueueCandidate, sourceQueue: PuzzleTaskSourceQueue) => {
    if (tasks.length >= targetPuzzleCount || selected.has(candidate.id)) return;
    const puzzle = puzzlesById.get(candidate.id);
    if (!puzzle) return;
    selected.add(candidate.id);
    tasks.push(candidateToPuzzleTask(candidate, puzzle, sourceQueue));
  };

  for (const candidate of wrongBranchQueue) addCandidate(candidate, "wrongBranchQueue");
  for (const candidate of mainlineQueue) addCandidate(candidate, "mainlineQueue");

  return tasks;
}

export function buildContentBatchPlan(
  puzzles: Puzzle[],
  options: ContentBatchOptions = {},
): ContentBatchPlan {
  const targetPuzzleCount = resolveTargetPuzzleCount(options.targetPuzzleCount);
  const queue = buildContentQueue(puzzles, {
    today: options.today,
    summaryIndex: options.summaryIndex,
    approvedIds: options.approvedIds,
  });
  const puzzlesById = new Map(puzzles.map((puzzle) => [puzzle.id, puzzle]));
  const puzzleTasks = selectPuzzleTasks(
    puzzlesById,
    queue.mainlineQueue,
    queue.wrongBranchQueue,
    targetPuzzleCount,
  );

  return {
    generatedAt: new Date().toISOString(),
    targetPuzzleCount,
    selectedPuzzleCount: puzzleTasks.length,
    safety: {
      generatedSolutionContent: false,
      requiresHumanReview: true,
      writesPuzzleData: false,
    },
    sourceQueueCounts: {
      mainlineQueue: queue.mainlineQueue.length,
      wrongBranchQueue: queue.wrongBranchQueue.length,
      duplicateGovernanceQueue: queue.duplicateGovernanceQueue.length,
      introductoryExpansionQueue: queue.introductoryExpansionQueue.length,
    },
    puzzleTasks,
    duplicateEditingTasks: queue.duplicateGovernanceQueue
      .slice(0, DUPLICATE_GROUP_TASK_LIMIT)
      .map((group) => ({
        puzzleIds: group.puzzleIds,
        groupSize: group.groupSize,
        tags: group.tags,
        difficulties: group.difficulties,
        priorityScore: group.priorityScore,
        checklist: [
          "Compare prompts and solution notes across the group.",
          "Decide whether the group should become a variation set or remain separate practice.",
          "Record the teaching difference before deleting or merging anything.",
          "Do not mark variation-ready until the relation is reviewed.",
        ],
      })),
    introductoryTargetTasks: queue.introductoryExpansionQueue
      .slice(0, INTRODUCTORY_TARGET_LIMIT)
      .map((target) => ({
        boardSize: target.boardSize,
        tag: target.tag,
        difficulty: target.difficulty,
        existingCount: target.existingCount,
        priorityScore: target.priorityScore,
        checklist: [
          "Create only sourced or explicitly original beginner material.",
          "Keep the first version small-board and low-friction for onboarding.",
          "Add localized prompt and solutionNote before considering coach fields.",
          "Run validate:puzzles and content review before merging.",
        ],
      })),
  };
}

function renderPuzzleTaskRows(tasks: PuzzleEditingTask[]): string {
  if (tasks.length === 0) return "- None";

  return [
    "| # | Puzzle | Queue | Tag | Diff | Board | Correct | Missing | Dup | Score |",
    "|---|--------|-------|-----|------|-------|---------|---------|-----|-------|",
    ...tasks.map((task, index) =>
      [
        index + 1,
        task.id,
        task.sourceQueue,
        task.tag,
        task.difficulty,
        `${task.boardSize}x${task.boardSize}`,
        task.correctMoves.join(", "),
        task.missingFields.join(", "),
        task.duplicateGroupSize,
        task.priorityScore,
      ].join(" | "),
    ),
  ]
    .map((row, index) => (index < 2 ? row : `| ${row} |`))
    .join("\n");
}

export function generateContentBatchMarkdown(plan: ContentBatchPlan): string {
  const duplicateRows =
    plan.duplicateEditingTasks
      .map(
        (task, index) =>
          `- ${index + 1}. ${task.puzzleIds.join(", ")} · size=${task.groupSize} · score=${task.priorityScore}`,
      )
      .join("\n") || "- None";
  const introRows =
    plan.introductoryTargetTasks
      .map(
        (task, index) =>
          `- ${index + 1}. ${task.boardSize}x${task.boardSize} · ${task.tag} · d${task.difficulty} · existing=${task.existingCount} · score=${task.priorityScore}`,
      )
      .join("\n") || "- None";

  return `
# Content Editing Batch Plan

## Summary
- **Generated At:** ${plan.generatedAt}
- **Target Puzzle Count:** ${plan.targetPuzzleCount}
- **Selected Puzzle Count:** ${plan.selectedPuzzleCount}
- **Generated Solution Content:** ${plan.safety.generatedSolutionContent ? "yes" : "no"}
- **Requires Human Review:** ${plan.safety.requiresHumanReview ? "yes" : "no"}
- **Writes Puzzle Data:** ${plan.safety.writesPuzzleData ? "yes" : "no"}

## Source Queues
- **Mainline Backfill:** ${plan.sourceQueueCounts.mainlineQueue}
- **Wrong-branch Backfill:** ${plan.sourceQueueCounts.wrongBranchQueue}
- **Duplicate Governance:** ${plan.sourceQueueCounts.duplicateGovernanceQueue}
- **Introductory Expansion:** ${plan.sourceQueueCounts.introductoryExpansionQueue}

## Safety Rule
No generated solution content is included in this plan. Editors must manually fill and review \`solutionSequence\` and \`wrongBranches\` before any puzzle is treated as coach-ready.

## Puzzle Backfill Tasks
${renderPuzzleTaskRows(plan.puzzleTasks)}

## Duplicate Governance Tasks
${duplicateRows}

## Introductory Expansion Targets
${introRows}
`.trim();
}

if (require.main === module) {
  const plan = buildContentBatchPlan(PUZZLES, {
    summaryIndex: readSummaryIndexFromDisk(),
  });

  fs.mkdirSync(CONTENT_BATCH_OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(CONTENT_BATCH_JSON_PATH, `${JSON.stringify(plan, null, 2)}\n`, "utf-8");
  fs.writeFileSync(CONTENT_BATCH_MARKDOWN_PATH, `${generateContentBatchMarkdown(plan)}\n`, "utf-8");

  console.log(generateContentBatchMarkdown(plan));
  console.log("\n[SUCCESS] Content editing batch plan completed.");
  console.log(`- JSON Detail: ${CONTENT_BATCH_JSON_PATH}`);
  console.log(`- Markdown Summary: ${CONTENT_BATCH_MARKDOWN_PATH}`);
}

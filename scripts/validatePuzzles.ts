/**
 * Build-time puzzle validator — run via `npm run validate:puzzles`.
 *
 * This is the first line of defense for the growing puzzle library. It only
 * catches *hard* errors — the kind that would 404 or crash the app at
 * runtime. Soft content concerns (difficulty calibration, tag coverage,
 * prompt wording) are left to human review.
 *
 * Wired into `prebuild` so `npm run build` fails if the library breaks.
 *
 * Exits 0 on success; exits 1 with a readable report on failure.
 */
import fs from "fs";
import path from "path";

import coachBasicEligibleIds from "../content/data/coachBasicEligibleIds.json";
import coachReadyIds from "../content/data/coachReadyIds.json";
import contentReviewBatches from "../content/data/contentReviewBatches.json";
import variationGroups from "../content/data/variationGroups.json";
import { PUZZLES, buildPuzzleSummaries } from "../content/puzzles.server";
import { checkCoachEligibility } from "../lib/coach/coachEligibility";
import type { Coord, Locale, Puzzle, PuzzleSummary, PuzzleTag, Stone } from "../types";
import {
  CoachVariationGroupSchema,
  ContentReviewBatchSchema,
  PuzzleSchema,
} from "../types/schemas";

const LOCALES: Locale[] = ["zh", "en", "ja", "ko"];
const DATA_DIR = path.join(process.cwd(), "content/data");
const ALLOWED_TAGS: ReadonlySet<PuzzleTag> = new Set([
  "life-death",
  "tesuji",
  "endgame",
  "opening",
]);
const ALLOWED_BOARD_SIZES: ReadonlySet<number> = new Set([9, 13, 19]);

type Issue = { puzzleId: string; rule: string; detail: string };

function inBounds(c: Coord, size: number): boolean {
  return (
    Number.isInteger(c.x) &&
    Number.isInteger(c.y) &&
    c.x >= 0 &&
    c.x < size &&
    c.y >= 0 &&
    c.y < size
  );
}

function coordKey(c: Coord): string {
  return `${c.x},${c.y}`;
}

function loadIndexSummaries(issues: Issue[]): PuzzleSummary[] {
  const indexPath = path.join(DATA_DIR, "puzzleIndex.json");

  if (!fs.existsSync(indexPath)) {
    issues.push({
      puzzleId: "<summary-index>",
      rule: "summaryIndex",
      detail: "content/data/puzzleIndex.json is missing — run `npm run sync:puzzle-index`",
    });
    return [];
  }

  try {
    return JSON.parse(fs.readFileSync(indexPath, "utf-8")) as PuzzleSummary[];
  } catch (error) {
    issues.push({
      puzzleId: "<summary-index>",
      rule: "summaryIndex",
      detail: `content/data/puzzleIndex.json is unreadable: ${String(error)}`,
    });
    return [];
  }
}

function compareSummaryIndex(
  expected: PuzzleSummary[],
  actual: PuzzleSummary[],
  issues: Issue[],
): void {
  if (actual.length !== expected.length) {
    issues.push({
      puzzleId: "<summary-index>",
      rule: "summaryIndex",
      detail: `summary count mismatch — index has ${actual.length}, PUZZLES produce ${expected.length}`,
    });
  }

  const expectedById = new Map(expected.map((summary) => [summary.id, summary]));
  const actualById = new Map(actual.map((summary) => [summary.id, summary]));

  for (const summary of actual) {
    const canonical = expectedById.get(summary.id);
    if (!canonical) {
      issues.push({
        puzzleId: summary.id,
        rule: "summaryIndex",
        detail: "stale puzzle summary — ID exists in puzzleIndex.json but not in PUZZLES",
      });
      continue;
    }

    if (summary.difficulty !== canonical.difficulty) {
      issues.push({
        puzzleId: summary.id,
        rule: "summaryIndex",
        detail: `difficulty mismatch — index=${summary.difficulty}, expected=${canonical.difficulty}`,
      });
    }
    if (summary.source !== canonical.source) {
      issues.push({
        puzzleId: summary.id,
        rule: "summaryIndex",
        detail: `source mismatch — index="${summary.source}", expected="${canonical.source}"`,
      });
    }
    if (summary.date !== canonical.date) {
      issues.push({
        puzzleId: summary.id,
        rule: "summaryIndex",
        detail: `date mismatch — index=${summary.date}, expected=${canonical.date}`,
      });
    }
    if (summary.boardSize !== canonical.boardSize) {
      issues.push({
        puzzleId: summary.id,
        rule: "summaryIndex",
        detail: `boardSize mismatch — index=${summary.boardSize}, expected=${canonical.boardSize}`,
      });
    }
    if (summary.tag !== canonical.tag) {
      issues.push({
        puzzleId: summary.id,
        rule: "summaryIndex",
        detail: `tag mismatch — index=${summary.tag}, expected=${canonical.tag}`,
      });
    }
    for (const locale of LOCALES) {
      if (summary.prompt?.[locale] !== canonical.prompt?.[locale]) {
        issues.push({
          puzzleId: summary.id,
          rule: "summaryIndex",
          detail: `prompt.${locale} mismatch between puzzleIndex.json and PUZZLES`,
        });
      }
    }
  }

  for (const summary of expected) {
    if (!actualById.has(summary.id)) {
      issues.push({
        puzzleId: summary.id,
        rule: "summaryIndex",
        detail: "missing puzzle summary — ID exists in PUZZLES but not in puzzleIndex.json",
      });
    }
  }
}

function validateUniquePuzzleIdList({
  ids,
  fileName,
  rule,
  issues,
  validatePuzzleId,
}: {
  ids: string[];
  fileName: string;
  rule: string;
  issues: Issue[];
  validatePuzzleId: (id: string, puzzle: Puzzle) => void;
}): Set<string> {
  const seen = new Set<string>();
  const byId = new Map(PUZZLES.map((puzzle) => [puzzle.id, puzzle]));

  for (const id of ids) {
    if (seen.has(id)) {
      issues.push({
        puzzleId: id,
        rule,
        detail: `duplicate ID in content/data/${fileName}`,
      });
      continue;
    }
    seen.add(id);

    const puzzle = byId.get(id);
    if (!puzzle) {
      issues.push({
        puzzleId: id,
        rule,
        detail: `ID exists in ${fileName} but not in PUZZLES`,
      });
      continue;
    }

    validatePuzzleId(id, puzzle);
  }

  return seen;
}

function validateCoachContentTiers(issues: Issue[]): void {
  const basicIds = coachBasicEligibleIds as string[];
  const readyIds = coachReadyIds as string[];
  const basicSet = validateUniquePuzzleIdList({
    ids: basicIds,
    fileName: "coachBasicEligibleIds.json",
    rule: "coachBasicEligibleIds",
    issues,
    validatePuzzleId(id, puzzle) {
      const eligibility = checkCoachEligibility(puzzle);
      if (!eligibility.eligible) {
        issues.push({
          puzzleId: id,
          rule: "coachBasicEligibleIds",
          detail: `basic-eligible puzzle fails coach eligibility (reason=${eligibility.reason}, tier=${eligibility.qualityTier})`,
        });
      }
    },
  });

  const readySet = validateUniquePuzzleIdList({
    ids: readyIds,
    fileName: "coachReadyIds.json",
    rule: "coachReadyIds",
    issues,
    validatePuzzleId(id, puzzle) {
      if (!basicSet.has(id)) {
        issues.push({
          puzzleId: id,
          rule: "coachReadyIds",
          detail: "coach-ready ID must also exist in coachBasicEligibleIds.json",
        });
      }

      const eligibility = checkCoachEligibility(puzzle);
      if (!eligibility.eligible || eligibility.qualityTier !== "coach-ready") {
        issues.push({
          puzzleId: id,
          rule: "coachReadyIds",
          detail: `coach-ready ID must pass deep coach gates (reason=${eligibility.reason}, tier=${eligibility.qualityTier})`,
        });
      }
    },
  });

  const groupIds = new Set<string>();
  for (const [index, group] of (variationGroups as unknown[]).entries()) {
    const parsed = CoachVariationGroupSchema.safeParse(group);
    if (!parsed.success) {
      for (const err of parsed.error.issues) {
        const path = err.path.length > 0 ? err.path.join(".") : "value";
        issues.push({
          puzzleId: `<variation-groups:${index}>`,
          rule: "variationGroups",
          detail: `${path}: ${err.message}`,
        });
      }
      continue;
    }

    if (groupIds.has(parsed.data.id)) {
      issues.push({
        puzzleId: parsed.data.id,
        rule: "variationGroups",
        detail: "duplicate variation group ID",
      });
    }
    groupIds.add(parsed.data.id);

    const seenPuzzleIds = new Set<string>();
    for (const puzzleId of parsed.data.puzzleIds) {
      if (seenPuzzleIds.has(puzzleId)) {
        issues.push({
          puzzleId,
          rule: "variationGroups",
          detail: `duplicate puzzle ID in variation group ${parsed.data.id}`,
        });
      }
      seenPuzzleIds.add(puzzleId);

      if (!readySet.has(puzzleId)) {
        issues.push({
          puzzleId,
          rule: "variationGroups",
          detail: `variation-ready puzzle must exist in coachReadyIds.json (group=${parsed.data.id})`,
        });
      }
    }
  }

  const byId = new Map(PUZZLES.map((puzzle) => [puzzle.id, puzzle]));
  const batchIds = new Set<string>();
  for (const [index, batch] of (contentReviewBatches as unknown[]).entries()) {
    const parsed = ContentReviewBatchSchema.safeParse(batch);
    if (!parsed.success) {
      for (const err of parsed.error.issues) {
        const path = err.path.length > 0 ? err.path.join(".") : "value";
        issues.push({
          puzzleId: `<content-review-batches:${index}>`,
          rule: "contentReviewBatches",
          detail: `${path}: ${err.message}`,
        });
      }
      continue;
    }

    if (batchIds.has(parsed.data.id)) {
      issues.push({
        puzzleId: parsed.data.id,
        rule: "contentReviewBatches",
        detail: "duplicate content review batch ID",
      });
    }
    batchIds.add(parsed.data.id);

    const seenPuzzleIds = new Set<string>();
    for (const puzzleId of parsed.data.puzzleIds) {
      if (seenPuzzleIds.has(puzzleId)) {
        issues.push({
          puzzleId,
          rule: "contentReviewBatches",
          detail: `duplicate puzzle ID in content review batch ${parsed.data.id}`,
        });
      }
      seenPuzzleIds.add(puzzleId);

      if (!byId.has(puzzleId)) {
        issues.push({
          puzzleId,
          rule: "contentReviewBatches",
          detail: `batch puzzle does not exist in PUZZLES (batch=${parsed.data.id})`,
        });
        continue;
      }

      if (parsed.data.scope === "coach-ready-backfill" && parsed.data.status === "approved") {
        if (!readySet.has(puzzleId)) {
          issues.push({
            puzzleId,
            rule: "contentReviewBatches",
            detail: `approved coach-ready batch puzzle must exist in coachReadyIds.json (batch=${parsed.data.id})`,
          });
        }
      }
    }
  }
}

function validatePuzzle(p: Puzzle, issues: Issue[]): void {
  const push = (rule: string, detail: string) => issues.push({ puzzleId: p.id, rule, detail });

  // Layer 1: zod schema validation (shared with runtime route)
  const schemaResult = PuzzleSchema.safeParse(p);
  if (!schemaResult.success) {
    const id = typeof p.id === "string" && p.id ? p.id : "<unknown>";
    for (const err of schemaResult.error.issues) {
      const path = err.path.length > 0 ? err.path.join(".") : "value";
      issues.push({ puzzleId: id, rule: "schema", detail: `${path}: ${err.message}` });
    }
    return; // skip custom semantic checks when schema fails
  }

  // 1. Board size
  if (!ALLOWED_BOARD_SIZES.has(p.boardSize)) {
    push("boardSize", `got ${p.boardSize}, expected 9 | 13 | 19`);
    return; // bounds checks below are meaningless without a valid size
  }

  // 2. Difficulty
  if (!Number.isInteger(p.difficulty) || p.difficulty < 1 || p.difficulty > 5) {
    push("difficulty", `got ${p.difficulty}, expected integer 1..5`);
  }

  // 3. Tag
  if (!ALLOWED_TAGS.has(p.tag)) {
    push("tag", `got "${p.tag}", expected one of ${[...ALLOWED_TAGS].join(" | ")}`);
  }

  // 4. correct[] — at least one, all in bounds
  if (!Array.isArray(p.correct) || p.correct.length === 0) {
    push("correct", "correct[] must contain at least one accepted solution point");
  } else {
    p.correct.forEach((c, i) => {
      if (!inBounds(c, p.boardSize)) {
        push(
          "correct",
          `correct[${i}] = (${c.x},${c.y}) is out of ${p.boardSize}x${p.boardSize} bounds`,
        );
      }
    });
  }

  // 5. stones[] — all in bounds, no coord collisions
  const occupied = new Map<string, Stone>();
  if (!Array.isArray(p.stones)) {
    push("stones", "stones[] must be an array (empty is OK)");
  } else {
    p.stones.forEach((s, i) => {
      if (!inBounds(s, p.boardSize)) {
        push(
          "stones",
          `stones[${i}] = (${s.x},${s.y}) is out of ${p.boardSize}x${p.boardSize} bounds`,
        );
        return;
      }
      if (s.color !== "black" && s.color !== "white") {
        push("stones", `stones[${i}] has invalid color "${s.color}"`);
      }
      const key = coordKey(s);
      if (occupied.has(key)) {
        push("stones", `stones[${i}] = (${s.x},${s.y}) overlaps an earlier stone`);
      } else {
        occupied.set(key, s);
      }
    });
  }

  // 6. solutionSequence — optional; each step in bounds
  if (p.solutionSequence) {
    p.solutionSequence.forEach((s, i) => {
      if (!inBounds(s, p.boardSize)) {
        push(
          "solutionSequence",
          `solutionSequence[${i}] = (${s.x},${s.y}) is out of ${p.boardSize}x${p.boardSize} bounds`,
        );
      }
      if (s.color !== "black" && s.color !== "white") {
        push("solutionSequence", `solutionSequence[${i}] has invalid color "${s.color}"`);
      }
    });
  }

  // 7. wrongBranches — optional; refutation coords in bounds
  if (p.wrongBranches) {
    p.wrongBranches.forEach((wb, i) => {
      if (!inBounds(wb.userWrongMove, p.boardSize)) {
        push("wrongBranches", `wrongBranches[${i}].userWrongMove out of bounds`);
      }
      wb.refutation?.forEach((s, j) => {
        if (!inBounds(s, p.boardSize)) {
          push("wrongBranches", `wrongBranches[${i}].refutation[${j}] out of bounds`);
        }
      });
      for (const lc of LOCALES) {
        if (!wb.note?.[lc]?.trim()) {
          push("wrongBranches", `wrongBranches[${i}].note.${lc} is empty`);
        }
      }
    });
  }

  // 8. toPlay
  if (p.toPlay !== "black" && p.toPlay !== "white") {
    push("toPlay", `got "${p.toPlay}", expected "black" | "white"`);
  }

  // 9. prompt — 4-language required for every puzzle (even library imports)
  for (const lc of LOCALES) {
    if (!p.prompt?.[lc]?.trim()) {
      push("prompt", `prompt.${lc} is empty`);
    }
  }

  // 10. solutionNote — 4-language required.
  for (const lc of LOCALES) {
    if (!p.solutionNote?.[lc]?.trim()) {
      push("solutionNote", `solutionNote.${lc} is empty`);
    }
  }
}

function main(): void {
  const issues: Issue[] = [];

  // Duplicate IDs (check before per-puzzle validation so we don't spam
  // on misaligned indices)
  const seen = new Map<string, number>();
  PUZZLES.forEach((p, i) => {
    if (typeof p.id !== "string" || !p.id) {
      issues.push({
        puzzleId: `<index ${i}>`,
        rule: "id",
        detail: `puzzle at index ${i} has no id`,
      });
      return;
    }
    const prev = seen.get(p.id);
    if (prev !== undefined) {
      issues.push({
        puzzleId: p.id,
        rule: "id",
        detail: `duplicate id — first seen at index ${prev}, again at ${i}`,
      });
    } else {
      seen.set(p.id, i);
    }
  });

  for (const p of PUZZLES) validatePuzzle(p, issues);

  const expectedSummaries = buildPuzzleSummaries(PUZZLES);
  const indexSummaries = loadIndexSummaries(issues);
  if (indexSummaries.length > 0) {
    compareSummaryIndex(expectedSummaries, indexSummaries, issues);
  }
  validateCoachContentTiers(issues);

  if (issues.length === 0) {
    console.log(`\x1b[32m✓\x1b[0m Validated ${PUZZLES.length} puzzles`);
    process.exit(0);
  }

  console.error(`\x1b[31m✗\x1b[0m ${issues.length} issue(s) across ${PUZZLES.length} puzzles:\n`);
  // Group by puzzleId for readability.
  const byPuzzle = new Map<string, Issue[]>();
  for (const iss of issues) {
    const list = byPuzzle.get(iss.puzzleId) ?? [];
    list.push(iss);
    byPuzzle.set(iss.puzzleId, list);
  }
  for (const [pid, list] of byPuzzle) {
    console.error(`  \x1b[1m${pid}\x1b[0m`);
    for (const iss of list) {
      console.error(`    · [${iss.rule}] ${iss.detail}`);
    }
  }
  console.error(`\n${issues.length} issue(s)`);
  process.exit(1);
}

main();

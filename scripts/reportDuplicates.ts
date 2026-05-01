/**
 * Duplicate puzzle report - identifies puzzles with identical board positions.
 *
 * Run via:  npx tsx scripts/reportDuplicates.ts
 *
 * Output:
 *   reports/duplicates/latest.json  - machine-readable detail
 *   reports/duplicates/latest.md    - human-readable summary
 */

import fs from "fs";
import path from "path";

import { PUZZLES } from "../content/puzzles.server";
import type { Coord, Puzzle, Stone } from "../types";

const OUTPUT_DIR = path.join(process.cwd(), "reports/duplicates");
const JSON_PATH = path.join(OUTPUT_DIR, "latest.json");
const MD_PATH = path.join(OUTPUT_DIR, "latest.md");

interface DuplicateGroup {
  canonicalKey: string;
  puzzleIds: string[];
  boardSize: number;
  toPlay: string;
  stoneCount: number;
  correctMoves: string;
  sameTag: boolean;
  sameDifficulty: boolean;
  sameSource: boolean;
  samePrompt: boolean;
  sameSolutionNote: boolean;
  tags: string[];
  difficulties: number[];
  sources: string[];
}

interface DuplicateReport {
  generatedAt: string;
  totalPuzzles: number;
  totalGroups: number;
  totalDuplicatePuzzles: number;
  groups: DuplicateGroup[];
}

function sortCoords(coords: Coord[]): string {
  return coords
    .map((c) => `${c.x},${c.y}`)
    .sort()
    .join("|");
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
    sortCoords(puzzle.correct ?? []),
  ].join("::");
}

function allSame(values: string[]): boolean {
  return new Set(values).size === 1;
}

function buildReport(): DuplicateReport {
  const buckets = new Map<string, Puzzle[]>();

  for (const puzzle of PUZZLES) {
    const key = canonicalKey(puzzle);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(puzzle);
    } else {
      buckets.set(key, [puzzle]);
    }
  }

  const groups: DuplicateGroup[] = [];

  for (const [key, puzzles] of buckets) {
    if (puzzles.length < 2) continue;

    groups.push({
      canonicalKey: key,
      puzzleIds: puzzles.map((p) => p.id),
      boardSize: puzzles[0].boardSize,
      toPlay: puzzles[0].toPlay,
      stoneCount: (puzzles[0].stones ?? []).length,
      correctMoves: sortCoords(puzzles[0].correct ?? []),
      sameTag: allSame(puzzles.map((p) => p.tag)),
      sameDifficulty: allSame(puzzles.map((p) => String(p.difficulty))),
      sameSource: allSame(puzzles.map((p) => p.source ?? "")),
      samePrompt: allSame(puzzles.map((p) => JSON.stringify(p.prompt ?? {}))),
      sameSolutionNote: allSame(puzzles.map((p) => JSON.stringify(p.solutionNote ?? {}))),
      tags: [...new Set(puzzles.map((p) => p.tag))],
      difficulties: [...new Set(puzzles.map((p) => p.difficulty))].sort(),
      sources: [...new Set(puzzles.map((p) => p.source ?? "(none)"))],
    });
  }

  groups.sort(
    (a, b) =>
      b.puzzleIds.length - a.puzzleIds.length || a.canonicalKey.localeCompare(b.canonicalKey),
  );

  return {
    generatedAt: new Date().toISOString(),
    totalPuzzles: PUZZLES.length,
    totalGroups: groups.length,
    totalDuplicatePuzzles: groups.reduce((sum, g) => sum + g.puzzleIds.length, 0),
    groups,
  };
}

function generateMarkdown(report: DuplicateReport): string {
  const exactDuplicates = report.groups.filter(
    (g) => g.sameTag && g.sameDifficulty && g.sameSource && g.samePrompt && g.sameSolutionNote,
  );
  const partialDuplicates = report.groups.filter(
    (g) => !(g.sameTag && g.sameDifficulty && g.sameSource && g.samePrompt && g.sameSolutionNote),
  );

  const lines = [
    `# Duplicate Puzzle Report`,
    ``,
    `## Summary`,
    `- **Generated At:** ${report.generatedAt}`,
    `- **Total Puzzles:** ${report.totalPuzzles}`,
    `- **Duplicate Groups:** ${report.totalGroups}`,
    `- **Puzzles in Duplicate Groups:** ${report.totalDuplicatePuzzles}`,
    `- **Exact Duplicates (same everything):** ${exactDuplicates.length} groups`,
    `- **Partial Duplicates (same position, differ elsewhere):** ${partialDuplicates.length} groups`,
    ``,
  ];

  if (exactDuplicates.length > 0) {
    lines.push(`## Exact Duplicates`);
    lines.push(``);
    lines.push(
      `These puzzles share the same board position, tag, difficulty, source, prompt, and solutionNote.`,
    );
    lines.push(``);
    lines.push(`| # | Puzzle IDs | Board | To Play | Tag | Difficulty |`);
    lines.push(`|---|-----------|-------|---------|-----|------------|`);
    for (let i = 0; i < exactDuplicates.length; i++) {
      const g = exactDuplicates[i];
      lines.push(
        `| ${i + 1} | ${g.puzzleIds.join(", ")} | ${g.boardSize}x${g.boardSize} | ${g.toPlay} | ${g.tags[0]} | ${g.difficulties[0]} |`,
      );
    }
    lines.push(``);
  }

  if (partialDuplicates.length > 0) {
    lines.push(`## Partial Duplicates`);
    lines.push(``);
    lines.push(
      `These puzzles share the same board position but differ in tag, difficulty, source, prompt, or solutionNote.`,
    );
    lines.push(``);
    lines.push(
      `| # | Puzzle IDs | Board | To Play | Same Tag | Same Diff | Same Source | Same Prompt | Same Note |`,
    );
    lines.push(
      `|---|-----------|-------|---------|----------|-----------|-------------|-------------|-----------|`,
    );
    for (let i = 0; i < partialDuplicates.length; i++) {
      const g = partialDuplicates[i];
      lines.push(
        `| ${i + 1} | ${g.puzzleIds.join(", ")} | ${g.boardSize}x${g.boardSize} | ${g.toPlay} | ${g.sameTag ? "yes" : "no"} | ${g.sameDifficulty ? "yes" : "no"} | ${g.sameSource ? "yes" : "no"} | ${g.samePrompt ? "yes" : "no"} | ${g.sameSolutionNote ? "yes" : "no"} |`,
      );
    }
    lines.push(``);
  }

  if (report.groups.length === 0) {
    lines.push(`## No Duplicates Found`);
    lines.push(``);
    lines.push(`All ${report.totalPuzzles} puzzles have unique board positions.`);
    lines.push(``);
  }

  return lines.join("\n");
}

if (require.main === module) {
  const report = buildReport();

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(JSON_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
  fs.writeFileSync(MD_PATH, `${generateMarkdown(report)}\n`, "utf-8");

  console.log(generateMarkdown(report));
  console.log(`\n[SUCCESS] Duplicate report generated.`);
  console.log(`- JSON Detail: ${JSON_PATH}`);
  console.log(`- Markdown Summary: ${MD_PATH}`);
}

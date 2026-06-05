/**
 * One-time migration: shift all puzzle coordinates from 0-based (0~18) to 1-based (1~19).
 *
 * Migrates:
 * - stones[].x, stones[].y
 * - correct[].x, correct[].y
 * - solutionSequence[].x, solutionSequence[].y
 * - wrongBranches[].userWrongMove.x, userWrongMove.y
 * - wrongBranches[].refutation[].x, refutation[].y
 * - solutionNote text: "(x,y)" → "(x+1,y+1)"
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const PUZZLE_FILE = resolve(__dirname, "../content/data/classicalPuzzles.json");

interface Coord {
  x: number;
  y: number;
}

interface Stone extends Coord {
  color: "black" | "white";
}

interface WrongBranch {
  userWrongMove: Coord;
  refutation: Stone[];
  note: Record<string, string>;
}

interface Puzzle {
  id: string;
  boardSize: number;
  stones: Stone[];
  correct: Coord[];
  solutionSequence?: Stone[];
  wrongBranches?: WrongBranch[];
  solutionNote?: Record<string, string>;
  [key: string]: unknown;
}

function shiftCoord(c: Coord): Coord {
  return { x: c.x + 1, y: c.y + 1 };
}

function shiftStone(s: Stone): Stone {
  return { ...shiftCoord(s), color: s.color };
}

function shiftNoteText(text: string): string {
  // Replace (x,y) patterns in note text, e.g. "(1,0)" → "(2,1)"
  return text.replace(/\((\d+),\s*(\d+)\)/g, (_, x, y) => {
    return `(${Number(x) + 1},${Number(y) + 1})`;
  });
}

function migratePuzzle(p: Puzzle): Puzzle {
  const migrated = { ...p };

  // stones
  migrated.stones = p.stones.map(shiftStone);

  // correct
  migrated.correct = p.correct.map(shiftCoord);

  // solutionSequence
  if (p.solutionSequence) {
    migrated.solutionSequence = p.solutionSequence.map(shiftStone);
  }

  // wrongBranches
  if (p.wrongBranches) {
    migrated.wrongBranches = p.wrongBranches.map((wb) => ({
      ...wb,
      userWrongMove: shiftCoord(wb.userWrongMove),
      refutation: wb.refutation.map(shiftStone),
      note: Object.fromEntries(
        Object.entries(wb.note).map(([lang, text]) => [lang, shiftNoteText(text)]),
      ),
    }));
  }

  // solutionNote text
  if (p.solutionNote) {
    migrated.solutionNote = Object.fromEntries(
      Object.entries(p.solutionNote).map(([lang, text]) => [lang, shiftNoteText(text)]),
    );
  }

  return migrated;
}

// --- main ---
const raw = readFileSync(PUZZLE_FILE, "utf-8");
const puzzles: Puzzle[] = JSON.parse(raw);

console.log(`Migrating ${puzzles.length} puzzles from 0-based to 1-based coordinates...`);

const migrated = puzzles.map(migratePuzzle);

// Validate: all coordinates should be in [1, boardSize]
let errors = 0;
for (const p of migrated) {
  for (const s of p.stones) {
    if (s.x < 1 || s.x > p.boardSize || s.y < 1 || s.y > p.boardSize) {
      console.error(`  ERROR ${p.id}: stone out of bounds (${s.x},${s.y}) for size ${p.boardSize}`);
      errors++;
    }
  }
  for (const c of p.correct) {
    if (c.x < 1 || c.x > p.boardSize || c.y < 1 || c.y > p.boardSize) {
      console.error(`  ERROR ${p.id}: correct out of bounds (${c.x},${c.y}) for size ${p.boardSize}`);
      errors++;
    }
  }
}

if (errors > 0) {
  console.error(`\n${errors} errors found. Aborting.`);
  process.exit(1);
}

writeFileSync(PUZZLE_FILE, JSON.stringify(migrated, null, 2) + "\n");
console.log(`Done. ${puzzles.length} puzzles migrated. 0 errors.`);

// Print sample
const sample = migrated[0];
console.log(`\nSample: ${sample.id}`);
console.log(`  stones[0]: (${sample.stones[0].x}, ${sample.stones[0].y})`);
console.log(`  correct[0]: (${sample.correct[0].x}, ${sample.correct[0].y})`);

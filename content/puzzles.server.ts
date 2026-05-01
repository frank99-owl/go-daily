import fs from "fs";
import path from "path";

import type { Puzzle, PuzzleSummary } from "@/types";

import { applyEditorialOverride } from "./editorialOverrides";

const DATA_DIR = path.join(process.cwd(), "content/data");

// Lazy-loaded full puzzle data — only reads the 11MB file on first access.
// Summary-only callers (getAllSummaries) never trigger this.
let _puzzles: Puzzle[] | null = null;
function getPUZZLES(): Puzzle[] {
  if (!_puzzles) {
    _puzzles = (
      JSON.parse(fs.readFileSync(path.join(DATA_DIR, "classicalPuzzles.json"), "utf-8")) as Puzzle[]
    ).map(applyEditorialOverride);
  }
  return _puzzles;
}

/**
 * Full puzzle array. Lazy-loaded on first access so that summary-only
 * code paths never pay the cost of reading the 11MB file.
 *
 * IMPORTANT: Do NOT use `export const PUZZLES = getPUZZLES()` — that would
 * evaluate at module load and defeat the lazy-loading optimization.
 */
export const PUZZLES = new Proxy([] as unknown as Puzzle[], {
  get(_target, prop) {
    const arr = getPUZZLES();
    const val = Reflect.get(arr, prop, arr);
    if (typeof val === "function") {
      return val.bind(arr);
    }
    return val;
  },
});

export function toPuzzleSummary(puzzle: Puzzle): PuzzleSummary {
  return {
    id: puzzle.id,
    difficulty: puzzle.difficulty,
    source: puzzle.source || puzzle.date,
    date: puzzle.date,
    prompt: puzzle.prompt,
    boardSize: puzzle.boardSize,
    tag: puzzle.tag,
  };
}

export function buildPuzzleSummaries(puzzles: Puzzle[] = getPUZZLES()): PuzzleSummary[] {
  return puzzles.map(toPuzzleSummary);
}

export function getPuzzleById(id: string): Puzzle | undefined {
  return getPUZZLES().find((p) => p.id === id);
}

/** Cached summaries loaded from the lightweight puzzleIndex.json (689KB). */
let _summaries: PuzzleSummary[] | null = null;
export function getAllSummaries(): PuzzleSummary[] {
  if (!_summaries) {
    _summaries = JSON.parse(
      fs.readFileSync(path.join(DATA_DIR, "puzzleIndex.json"), "utf-8"),
    ) as PuzzleSummary[];
  }
  return _summaries;
}

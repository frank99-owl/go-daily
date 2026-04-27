import fs from "fs";
import path from "path";

import type { Puzzle, PuzzleSummary } from "@/types";

import { applyEditorialOverride } from "./editorialOverrides";

const DATA_DIR = path.join(process.cwd(), "content/data");

/** Load full puzzle data from classicalPuzzles.json, applying editorial overrides. */
function loadPuzzles(): Puzzle[] {
  return (
    JSON.parse(fs.readFileSync(path.join(DATA_DIR, "classicalPuzzles.json"), "utf-8")) as Puzzle[]
  ).map(applyEditorialOverride);
}

// Cache the full puzzles in memory on the server
export const PUZZLES: Puzzle[] = loadPuzzles();

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

export function buildPuzzleSummaries(puzzles: Puzzle[] = PUZZLES): PuzzleSummary[] {
  return puzzles.map(toPuzzleSummary);
}

export function getPuzzleById(id: string): Puzzle | undefined {
  return PUZZLES.find((p) => p.id === id);
}

export function getAllSummaries(): PuzzleSummary[] {
  return buildPuzzleSummaries(PUZZLES);
}

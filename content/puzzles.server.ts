import fs from "fs";
import path from "path";

import type { Puzzle, PuzzleSummary } from "@/types";

import { CURATED_PUZZLES, CURATED_SOURCE_IDS } from "./curatedPuzzles";

const DATA_DIR = path.join(process.cwd(), "content/data");

/** Load full puzzle data from JSON files. */
function loadPuzzles(): Puzzle[] {
  const imported = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, "importedPuzzles.json"), "utf-8"),
  ) as Puzzle[];
  const library = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, "puzzleLibrary.json"), "utf-8"),
  ) as Puzzle[];

  const curatedSourceIds = new Set<string>(CURATED_SOURCE_IDS);
  const remainingLibraryPuzzles = library.filter((p) => !curatedSourceIds.has(p.id));

  return [...CURATED_PUZZLES, ...imported, ...remainingLibraryPuzzles];
}

// Cache the full puzzles in memory on the server
export const PUZZLES: Puzzle[] = loadPuzzles();

export function getPuzzleById(id: string): Puzzle | undefined {
  return PUZZLES.find((p) => p.id === id);
}

export function getAllSummaries(): PuzzleSummary[] {
  // We can either compute them from PUZZLES or read the index file
  // Reading the index file is faster if it's already there
  const indexPath = path.join(DATA_DIR, "puzzleIndex.json");
  if (fs.existsSync(indexPath)) {
    return JSON.parse(fs.readFileSync(indexPath, "utf-8"));
  }

  // Fallback: generate from full data
  return PUZZLES.map((p) => ({
    id: p.id,
    difficulty: p.difficulty,
    source: p.source || p.date,
    date: p.date,
    prompt: p.prompt,
    isCurated: !!p.isCurated,
    boardSize: p.boardSize,
    tag: p.tag,
  }));
}

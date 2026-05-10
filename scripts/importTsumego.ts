/**
 * Import validated tsumego puzzle JSON into the canonical puzzle library.
 *
 * Usage:
 *   npm run import:puzzles -- --input path/to/puzzles.json --dry-run
 *   npm run import:puzzles -- --input path/to/puzzles.json --sync-index
 */
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

import type { Puzzle, PuzzleSummary } from "../types";
import { PuzzleSchema } from "../types/schemas";

const DATA_DIR = path.join(process.cwd(), "content/data");
const DEFAULT_OUTPUT_PATH = path.join(DATA_DIR, "classicalPuzzles.json");
const DEFAULT_INDEX_PATH = path.join(DATA_DIR, "puzzleIndex.json");

export type ImportArgs = {
  dryRun: boolean;
  help: boolean;
  indexPath: string;
  inputPath: string | null;
  outputPath: string;
  syncIndex: boolean;
};

export type ImportResult = {
  importedCount: number;
  outputPath: string;
  totalCount: number;
  wroteIndex: boolean;
  wroteOutput: boolean;
};

function usage(): string {
  return [
    "Usage:",
    "  npm run import:puzzles -- --input <puzzles.json> [--output <target.json>] [--sync-index] [--dry-run]",
    "",
    "Options:",
    "  --input <path>       JSON array of puzzles matching PuzzleSchema",
    "  --output <path>      Target puzzle file (default: content/data/classicalPuzzles.json)",
    "  --index-output <path> Target summary index when --sync-index is used",
    "  --sync-index         Also rewrite content/data/puzzleIndex.json from the merged library",
    "  --dry-run            Validate and report without writing files",
    "  -h, --help           Show this help",
  ].join("\n");
}

function readOptionValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

export function parseImportArgs(argv: string[]): ImportArgs {
  const args: ImportArgs = {
    dryRun: false,
    help: false,
    indexPath: DEFAULT_INDEX_PATH,
    inputPath: null,
    outputPath: DEFAULT_OUTPUT_PATH,
    syncIndex: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      args.help = true;
      continue;
    }
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (arg === "--sync-index") {
      args.syncIndex = true;
      continue;
    }
    if (arg === "--input") {
      args.inputPath = path.resolve(readOptionValue(argv, i, "--input"));
      i++;
      continue;
    }
    if (arg.startsWith("--input=")) {
      args.inputPath = path.resolve(arg.slice("--input=".length));
      continue;
    }
    if (arg === "--output") {
      args.outputPath = path.resolve(readOptionValue(argv, i, "--output"));
      i++;
      continue;
    }
    if (arg.startsWith("--output=")) {
      args.outputPath = path.resolve(arg.slice("--output=".length));
      continue;
    }
    if (arg === "--index-output") {
      args.indexPath = path.resolve(readOptionValue(argv, i, "--index-output"));
      i++;
      continue;
    }
    if (arg.startsWith("--index-output=")) {
      args.indexPath = path.resolve(arg.slice("--index-output=".length));
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    if (!args.inputPath) {
      args.inputPath = path.resolve(arg);
      continue;
    }
    throw new Error(`Unexpected positional argument: ${arg}`);
  }

  return args;
}

function readJsonFile(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function readPuzzleArray(filePath: string): Puzzle[] {
  if (!fs.existsSync(filePath)) return [];
  const raw = readJsonFile(filePath);
  if (!Array.isArray(raw)) {
    throw new Error(`${filePath} must contain a JSON array`);
  }
  return raw as Puzzle[];
}

function validateImportedPuzzles(raw: unknown, sourcePath: string): Puzzle[] {
  if (!Array.isArray(raw)) {
    throw new Error(`${sourcePath} must contain a JSON array`);
  }

  const ids = new Set<string>();
  const puzzles: Puzzle[] = [];
  const issues: string[] = [];

  for (const [index, candidate] of raw.entries()) {
    const result = PuzzleSchema.safeParse(candidate);
    if (!result.success) {
      const details = result.error.issues
        .map((issue) => `${issue.path.join(".") || "value"}: ${issue.message}`)
        .join("; ");
      issues.push(`#${index}: ${details}`);
      continue;
    }

    if (ids.has(result.data.id)) {
      issues.push(`#${index}: duplicate imported id "${result.data.id}"`);
      continue;
    }
    ids.add(result.data.id);
    puzzles.push(result.data as Puzzle);
  }

  if (issues.length > 0) {
    throw new Error(`Imported puzzle validation failed:\n${issues.join("\n")}`);
  }

  return puzzles;
}

function toPuzzleSummary(puzzle: Puzzle): PuzzleSummary {
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

export function importTsumego(args: ImportArgs): ImportResult {
  if (!args.inputPath) {
    throw new Error("Missing --input. Run with --help for usage.");
  }

  const existing = readPuzzleArray(args.outputPath);
  const imported = validateImportedPuzzles(readJsonFile(args.inputPath), args.inputPath);
  const existingIds = new Set(existing.map((puzzle) => puzzle.id));
  const duplicateIds = imported.map((puzzle) => puzzle.id).filter((id) => existingIds.has(id));
  if (duplicateIds.length > 0) {
    throw new Error(`Refusing to import duplicate IDs: ${duplicateIds.join(", ")}`);
  }

  const merged = [...existing, ...imported];
  if (args.dryRun) {
    return {
      importedCount: imported.length,
      outputPath: args.outputPath,
      totalCount: merged.length,
      wroteIndex: false,
      wroteOutput: false,
    };
  }

  fs.mkdirSync(path.dirname(args.outputPath), { recursive: true });
  fs.writeFileSync(args.outputPath, `${JSON.stringify(merged, null, 2)}\n`, "utf-8");

  if (args.syncIndex) {
    const summaries = merged.map(toPuzzleSummary);
    fs.mkdirSync(path.dirname(args.indexPath), { recursive: true });
    fs.writeFileSync(args.indexPath, `${JSON.stringify(summaries, null, 2)}\n`, "utf-8");
  }

  return {
    importedCount: imported.length,
    outputPath: args.outputPath,
    totalCount: merged.length,
    wroteIndex: args.syncIndex,
    wroteOutput: true,
  };
}

function main(): void {
  const args = parseImportArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const result = importTsumego(args);
  const mode = args.dryRun ? "Validated" : "Imported";
  console.log(`${mode} ${result.importedCount} puzzles`);
  console.log(`- Output: ${result.outputPath}`);
  console.log(`- Total puzzles: ${result.totalCount}`);
  if (result.wroteIndex) {
    console.log(`- Synced index: ${args.indexPath}`);
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

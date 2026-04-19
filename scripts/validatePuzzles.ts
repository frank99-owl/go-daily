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
import { PUZZLES } from "../content/puzzles";
import type { Coord, Locale, Puzzle, PuzzleTag, Stone } from "../types";

const LOCALES: Locale[] = ["zh", "en", "ja", "ko"];
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

function validatePuzzle(p: Puzzle, issues: Issue[]): void {
  const push = (rule: string, detail: string) => issues.push({ puzzleId: p.id, rule, detail });

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

  // 10. solutionNote — 4-language required only for curated puzzles.
  //     Library imports ship with a generic note (coach is gated off anyway).
  if (p.isCurated !== false) {
    for (const lc of LOCALES) {
      if (!p.solutionNote?.[lc]?.trim()) {
        push("solutionNote", `solutionNote.${lc} is empty (required when isCurated !== false)`);
      }
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

  const curated = PUZZLES.filter((p) => p.isCurated !== false).length;
  const library = PUZZLES.length - curated;

  if (issues.length === 0) {
    console.log(
      `\x1b[32m✓\x1b[0m Validated ${PUZZLES.length} puzzles (${curated} curated, ${library} library)`,
    );
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
  console.error(`\n${curated} curated · ${library} library · ${issues.length} issue(s)`);
  process.exit(1);
}

main();

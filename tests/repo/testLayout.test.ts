// @vitest-environment node
/**
 * Test layout guard.
 *
 * Until 2026-09 the repo had two homes for unit tests: 91 files mirrored under
 * `tests/` and 20 co-located beside their source in `lib/`. Nine modules had
 * one of each, with different contents — `syncStorage` alone had 413 lines in
 * one and 154 in the other — so anyone adding a test, or judging how well a
 * module was covered, had to know to look in both places. Nothing said which
 * was right. They were consolidated into `tests/` (the convention CLAUDE.md
 * already documented, and the one with nine times as many files), without
 * dropping a single case: 1032 tests before and after, identical titles.
 *
 * This keeps it that way. The rule:
 *   - Vitest tests (`*.test.ts` / `*.test.tsx`) live only under `tests/`,
 *     mirroring the path of what they test.
 *   - Playwright specs (`*.spec.ts`) live only under `e2e/`.
 */
import fs from "fs";
import path from "path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  ".vercel",
  "test-results",
  "playwright-report",
  "coverage",
  "target",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(path.relative(ROOT, full));
  }
  return out;
}

describe("test layout", () => {
  const files = walk(ROOT);

  it("keeps every Vitest test under tests/", () => {
    const misplaced = files.filter(
      (file) => /\.test\.tsx?$/.test(file) && !file.startsWith(`tests${path.sep}`),
    );
    expect(misplaced, "move these under tests/, mirroring the source path").toEqual([]);
  });

  it("keeps every Playwright spec under e2e/", () => {
    const misplaced = files.filter(
      (file) => /\.spec\.tsx?$/.test(file) && !file.startsWith(`e2e${path.sep}`),
    );
    expect(misplaced, "Playwright specs belong in e2e/").toEqual([]);
  });

  it("finds the tests it is guarding", () => {
    // Guards the guard: a walk that silently skipped the tree would pass the
    // checks above while inspecting nothing.
    expect(files.filter((file) => /\.test\.tsx?$/.test(file)).length).toBeGreaterThan(100);
    expect(files.filter((file) => /\.spec\.tsx?$/.test(file)).length).toBeGreaterThan(0);
  });
});

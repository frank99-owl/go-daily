/**
 * @vitest-environment node
 */
import fs from "fs";
import os from "os";
import path from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { importTsumego, parseImportArgs, type ImportArgs } from "@/scripts/importTsumego";
import type { Puzzle } from "@/types";

let tempDir: string;

const samplePuzzle: Puzzle = {
  id: "import-001",
  date: "2026-05-10",
  boardSize: 9,
  stones: [{ x: 2, y: 2, color: "black" }],
  toPlay: "white",
  correct: [{ x: 3, y: 2 }],
  tag: "tesuji",
  difficulty: 2,
  prompt: {
    zh: "白先",
    en: "White to play",
    ja: "白番",
    ko: "백 차례",
  },
  solutionNote: {
    zh: "导入测试",
    en: "Import test",
    ja: "インポートテスト",
    ko: "가져오기 테스트",
  },
  source: "Test fixture",
};

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function args(overrides: Partial<ImportArgs>): ImportArgs {
  return {
    dryRun: false,
    help: false,
    indexPath: path.join(tempDir, "puzzleIndex.json"),
    inputPath: path.join(tempDir, "input.json"),
    outputPath: path.join(tempDir, "classicalPuzzles.json"),
    syncIndex: false,
    ...overrides,
  };
}

describe("importTsumego", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "go-daily-import-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("parses help and path options", () => {
    const parsed = parseImportArgs([
      "--input",
      "fixtures/new.json",
      "--output=content/data/custom.json",
      "--index-output",
      "content/data/customIndex.json",
      "--sync-index",
      "--dry-run",
    ]);

    expect(parsed.help).toBe(false);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.syncIndex).toBe(true);
    expect(parsed.inputPath).toBe(path.resolve("fixtures/new.json"));
    expect(parsed.outputPath).toBe(path.resolve("content/data/custom.json"));
    expect(parsed.indexPath).toBe(path.resolve("content/data/customIndex.json"));
  });

  it("validates imports in dry-run mode without writing output", () => {
    const inputPath = path.join(tempDir, "input.json");
    const outputPath = path.join(tempDir, "classicalPuzzles.json");
    writeJson(inputPath, [samplePuzzle]);

    const result = importTsumego(args({ dryRun: true, inputPath, outputPath }));

    expect(result).toMatchObject({
      importedCount: 1,
      totalCount: 1,
      wroteOutput: false,
      wroteIndex: false,
    });
    expect(fs.existsSync(outputPath)).toBe(false);
  });

  it("writes merged puzzle output and an optional summary index", () => {
    const inputPath = path.join(tempDir, "input.json");
    const outputPath = path.join(tempDir, "classicalPuzzles.json");
    const indexPath = path.join(tempDir, "puzzleIndex.json");
    writeJson(inputPath, [samplePuzzle]);

    const result = importTsumego(args({ inputPath, outputPath, indexPath, syncIndex: true }));

    expect(result).toMatchObject({
      importedCount: 1,
      totalCount: 1,
      wroteOutput: true,
      wroteIndex: true,
    });
    expect(JSON.parse(fs.readFileSync(outputPath, "utf-8"))).toEqual([samplePuzzle]);
    expect(JSON.parse(fs.readFileSync(indexPath, "utf-8"))).toEqual([
      expect.objectContaining({
        id: "import-001",
        source: "Test fixture",
      }),
    ]);
  });

  it("refuses duplicate IDs already present in the target library", () => {
    const inputPath = path.join(tempDir, "input.json");
    const outputPath = path.join(tempDir, "classicalPuzzles.json");
    writeJson(inputPath, [samplePuzzle]);
    writeJson(outputPath, [samplePuzzle]);

    expect(() => importTsumego(args({ inputPath, outputPath }))).toThrow(
      "Refusing to import duplicate IDs: import-001",
    );
  });
});

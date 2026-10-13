// @vitest-environment node
import { describe, expect, it } from "vitest";

import quarantine from "@/content/data/quarantinedCoachBranches.json";
import { PUZZLES } from "@/content/puzzles.server";
import { validatePuzzleVariations } from "@/lib/board/variationValidation";
import { validateCoachContentTiers, validatePuzzle } from "@/scripts/validatePuzzles";
import type { Puzzle, WrongBranch } from "@/types";
import { QuarantinedCoachBranchSchema } from "@/types/schemas";

describe("puzzle teaching-data validation", () => {
  it("rejects an illegal branch even when all its coordinates and text fields exist", () => {
    const puzzle = PUZZLES.find((item) => item.id === "p-00003")!;
    const original = quarantine.find((entry) => entry.puzzleId === puzzle.id)!;
    const issues: Parameters<typeof validatePuzzle>[1] = [];
    validatePuzzle({ ...puzzle, wrongBranches: [original.branch as WrongBranch] }, issues);
    expect(issues).toContainEqual({
      puzzleId: puzzle.id,
      rule: "wrongBranches",
      detail: "wrongBranches[0].userWrongMove: occupied",
    });
  });

  it("keeps all active teaching lines playable and content-tier metadata consistent", () => {
    const issues: Parameters<typeof validatePuzzle>[1] = [];
    for (const puzzle of PUZZLES) validatePuzzle(puzzle, issues);
    validateCoachContentTiers(issues);
    expect(issues).toEqual([]);
  });

  it("preserves the original rejected material for independent review outside active teaching data", () => {
    expect(quarantine).toHaveLength(32);
    for (const entry of quarantine) {
      expect(QuarantinedCoachBranchSchema.safeParse(entry).success, entry.puzzleId).toBe(true);
      const puzzle = PUZZLES.find((item) => item.id === entry.puzzleId)!;
      expect(puzzle, entry.puzzleId).toBeDefined();
      expect(puzzle.wrongBranches ?? [], entry.puzzleId).not.toContainEqual(entry.branch);
      const restored: Puzzle = { ...puzzle, wrongBranches: [entry.branch as WrongBranch] };
      const result = validatePuzzleVariations(restored);
      expect(result.valid, entry.puzzleId).toBe(false);
      expect(
        result.issues.map((issue) => `${issue.path}: ${issue.reason}`),
        entry.puzzleId,
      ).toEqual(entry.issues);
    }
  });
});

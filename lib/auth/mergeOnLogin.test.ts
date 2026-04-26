import { describe, expect, it } from "vitest";

import type { AttemptRecord } from "@/types";

import { applyMergeDecision, planMerge } from "./mergeOnLogin";

function a(puzzleId: string, solvedAtMs: number, correct = true): AttemptRecord {
  return {
    puzzleId,
    date: "2026-04-22",
    userMove: { x: 1, y: 1 },
    correct,
    solvedAtMs,
  };
}

describe("planMerge", () => {
  it("is a no-op when both sides are empty", () => {
    const plan = planMerge([], []);
    expect(plan).toMatchObject({
      localCount: 0,
      remoteCount: 0,
      localOnlyCount: 0,
      remoteOnlyCount: 0,
      overlapCount: 0,
      requiresUserDecision: false,
    });
  });

  it("does not prompt when only local has rows", () => {
    const plan = planMerge([a("p1", 1)], []);
    expect(plan.localOnlyCount).toBe(1);
    expect(plan.requiresUserDecision).toBe(false);
  });

  it("does not prompt when only remote has rows", () => {
    const plan = planMerge([], [a("p1", 1)]);
    expect(plan.remoteOnlyCount).toBe(1);
    expect(plan.requiresUserDecision).toBe(false);
  });

  it("does not prompt when one side is a subset of the other", () => {
    const common = a("p1", 1);
    const plan = planMerge([common], [common, a("p2", 2)]);
    expect(plan.overlapCount).toBe(1);
    expect(plan.localOnlyCount).toBe(0);
    expect(plan.remoteOnlyCount).toBe(1);
    expect(plan.requiresUserDecision).toBe(false);
  });

  it("prompts when both sides have unique rows", () => {
    const plan = planMerge([a("p1", 1)], [a("p2", 2)]);
    expect(plan.localOnlyCount).toBe(1);
    expect(plan.remoteOnlyCount).toBe(1);
    expect(plan.requiresUserDecision).toBe(true);
  });
});

describe("applyMergeDecision", () => {
  const local = [a("local-only", 1), a("shared", 5)];
  const remote = [a("shared", 5), a("remote-only", 7)];

  it("merge keeps every unique row and reports uploads", () => {
    const result = applyMergeDecision(local, remote, "merge");
    expect(result.merged.map((r) => r.puzzleId).sort()).toEqual(
      ["local-only", "remote-only", "shared"].sort(),
    );
    expect(result.toUpload).toHaveLength(1);
    expect(result.toUpload[0]?.puzzleId).toBe("local-only");
    expect(result.dropped).toHaveLength(0);
  });

  it("keep-remote reports local-only rows as dropped", () => {
    const result = applyMergeDecision(local, remote, "keep-remote");
    expect(result.merged.map((r) => r.puzzleId).sort()).toEqual(["remote-only", "shared"].sort());
    expect(result.toUpload).toHaveLength(0);
    expect(result.dropped.map((r) => r.puzzleId)).toEqual(["local-only"]);
  });

  it("keep-local drops remote-only rows from view and still uploads local", () => {
    const result = applyMergeDecision(local, remote, "keep-local");
    expect(result.merged.map((r) => r.puzzleId).sort()).toEqual(["local-only", "shared"].sort());
    expect(result.toUpload.map((r) => r.puzzleId)).toEqual(["local-only"]);
    expect(result.dropped).toHaveLength(0);
  });
});

import { describe, expect, it } from "vitest";

import { buildSnapshots } from "@/lib/puzzle/gameSnapshots";

describe("gameSnapshots", () => {
  it("builds snapshots correctly for a sequence of moves", () => {
    const moves = [
      { coord: { x: 0, y: 0 }, color: "black" as const },
      { coord: { x: 1, y: 1 }, color: "white" as const },
    ];

    const snapshots = buildSnapshots(moves);

    // N moves -> N+1 snapshots
    expect(snapshots.length).toBe(3);

    // Empty board
    expect(snapshots[0].moveNumber).toBe(0);
    expect(snapshots[0].stones.length).toBe(0);
    expect(snapshots[0].lastMove).toBeNull();

    // Move 1
    expect(snapshots[1].moveNumber).toBe(1);
    expect(snapshots[1].stones.length).toBe(1);
    expect(snapshots[1].lastMove).toEqual({ x: 0, y: 0 });

    // Move 2
    expect(snapshots[2].moveNumber).toBe(2);
    expect(snapshots[2].stones.length).toBe(2);
    expect(snapshots[2].lastMove).toEqual({ x: 1, y: 1 });
  });

  it("returns single snapshot for empty moves", () => {
    const snapshots = buildSnapshots([]);
    expect(snapshots.length).toBe(1);
    expect(snapshots[0].moveNumber).toBe(0);
    expect(snapshots[0].stones).toEqual([]);
  });
});

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GoBoard } from "./GoBoard";
import type { Snapshot } from "@/lib/gameSnapshots";
import type { Coord } from "@/types";

export type DemoPhase = "idle" | "showGod" | "playing" | "ended";

type Props = {
  snapshots: Snapshot[];
  startAtMove: number;
  holdMs: number;
  stepMs: number;
  godMoveNumber: number;
  started: boolean;
  onPhaseChange?: (phase: DemoPhase) => void;
  onMoveChange?: (moveNumber: number) => void;
};

function keyOf(c: Coord): string {
  return `${c.x},${c.y}`;
}

export function DemoGameBoard({
  snapshots,
  startAtMove,
  holdMs,
  stepMs,
  godMoveNumber,
  started,
  onPhaseChange,
  onMoveChange,
}: Props) {
  const [phase, setPhase] = useState<DemoPhase>("showGod");
  const [index, setIndex] = useState(startAtMove);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Precompute move numbers for each snapshot.
  const moveNumberMaps = useMemo(() => {
    const maps: Map<string, number>[] = [];
    const coordToMove = new Map<string, number>();

    for (let i = 0; i < snapshots.length; i++) {
      const snap = snapshots[i];
      if (i > 0) {
        const prev = snapshots[i - 1];
        for (const s of snap.stones) {
          const k = keyOf(s);
          const had = prev.stones.some((ps) => keyOf(ps) === k);
          if (!had) {
            coordToMove.set(k, i);
          }
        }
      }
      const mapForSnap = new Map<string, number>();
      for (const s of snap.stones) {
        const k = keyOf(s);
        const num = coordToMove.get(k);
        if (num !== undefined) {
          mapForSnap.set(k, num);
        }
      }
      maps.push(mapForSnap);
    }
    return maps;
  }, [snapshots]);

  const getMoveNumbers = (snapIndex: number): Map<string, number> => {
    const map = moveNumberMaps[snapIndex] ?? new Map();
    const snap = snapshots[snapIndex];
    if (snap.moveNumber === 0) return new Map();

    const result = new Map<string, number>();
    const cutoff = Math.max(1, snap.moveNumber - 7);
    for (const [k, num] of map) {
      if (num >= cutoff) {
        result.set(k, num);
      }
    }
    return result;
  };

  // Report phase/move changes to parent
  useEffect(() => {
    onPhaseChange?.(phase);
  }, [phase, onPhaseChange]);

  useEffect(() => {
    const snap = snapshots[index];
    onMoveChange?.(snap?.moveNumber ?? 0);
  }, [index, snapshots, onMoveChange]);

  // Start playback only when `started` becomes true.
  useEffect(() => {
    if (!started) return;

    const timer = setTimeout(() => {
      setPhase("playing");
      setIndex(0);

      intervalRef.current = setInterval(() => {
        setIndex((prev) => {
          const next = prev + 1;
          if (next >= snapshots.length - 1) {
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
            }
            setPhase("ended");
            return snapshots.length - 1;
          }
          return next;
        });
      }, stepMs);
    }, holdMs);

    return () => {
      clearTimeout(timer);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [started, holdMs, stepMs, snapshots]);

  const snapshot = snapshots[index] ?? snapshots[0];
  const moveNumbers = getMoveNumbers(index);

  const highlightCoord: Coord | undefined =
    phase === "showGod"
      ? (snapshots[godMoveNumber]?.lastMove ?? undefined)
      : (snapshot.lastMove ?? undefined);

  return (
    <div className="relative">
      <GoBoard
        size={19}
        stones={snapshot.stones}
        toPlay="black"
        boardStyle="dark"
        moveNumbers={moveNumbers}
        highlight={highlightCoord ? [highlightCoord] : undefined}
        highlightColor="#00f2ff"
        disabled
        maxPx={560}
      />
    </div>
  );
}

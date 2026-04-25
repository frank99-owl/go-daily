import { describe, expect, it } from "vitest";

import { getCoachAccess, isApprovedCoachId } from "@/lib/coachAccess";
import type { Puzzle } from "@/types";

function makePuzzle(overrides: Partial<Puzzle> = {}): Puzzle {
  return {
    id: "puzzle-1",
    date: "2026-04-21",
    boardSize: 19,
    stones: [{ x: 0, y: 0, color: "black" }],
    toPlay: "black",
    correct: [{ x: 1, y: 1 }],
    tag: "life-death",
    difficulty: 1,
    prompt: {
      zh: "黑先活",
      en: "Black to play and live",
      ja: "黒先活",
      ko: "흑선활",
    },
    solutionNote: {
      zh: "黑先要抢到左上角的急所，因为这一手会先压缩白的眼位，再把黑棋的形状安定下来。如果黑先去别处，白就能先手补强，之后黑最简明的活路会消失。",
      en: "Black should take the vital point on the top-left corner first because that move shrinks White's eye space and settles Black's shape at the same time. If Black starts elsewhere, White gets the forcing move first and Black loses the cleanest route to life.",
      ja: "黒は左上隅の急所を先に取るべきです。なぜなら、その一手で白の眼形を縮めながら黒の形も安定するからです。もし黒が別の場所から動くと、白に先手で補強され、その後の活路は一気に苦しくなります。",
      ko: "흑은 좌상귀의 급소를 먼저 차지해야 합니다. 그 이유는 그 한 수가 백의 눈 모양을 줄이면서 흑의 형태도 안정시키기 때문입니다. 만약 흑이 다른 곳부터 두면 백이 먼저 보강하고, 이후 흑의 가장 쉬운 활로가 사라집니다.",
    },
    source: "test-source",
    ...overrides,
  };
}

describe("coachAccess", () => {
  it("always allows curated puzzles", () => {
    expect(
      getCoachAccess(
        makePuzzle({
          isCurated: true,
        }),
      ),
    ).toEqual({ available: true, reason: "curated" });
  });

  it("allows approved coach-ready library puzzles", () => {
    expect(isApprovedCoachId("p-00001")).toBe(true);

    expect(
      getCoachAccess(
        makePuzzle({
          id: "p-00001",
          isCurated: false,
        }),
      ),
    ).toEqual({ available: true, reason: "approved" });
  });

  it("keeps non-approved puzzles restricted", () => {
    expect(
      getCoachAccess(
        makePuzzle({
          id: "p-99999",
          isCurated: false,
        }),
      ),
    ).toEqual({ available: false, reason: "restricted" });
  });
});

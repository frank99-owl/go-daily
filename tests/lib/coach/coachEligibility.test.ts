import { describe, expect, it } from "vitest";

import { checkCoachEligibility } from "@/lib/coach/coachEligibility";
import type { Puzzle } from "@/types";

function makeBasePuzzle(overrides: Partial<Puzzle> = {}): Puzzle {
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
      zh: "黑先占住急所，因为这样能先缩小白的眼位，再顺势补出第二只眼。",
      en: "Black must take the vital point first because it reduces White's eye space and then secures the second eye.",
      ja: "黒は急所を先に取ることで白の眼形を縮め、その後で二眼を確保できます。",
      ko: "흑은 급소를 먼저 차지해야 백의 눈 모양을 줄인 뒤 두 눈을 확보할 수 있습니다.",
    },
    source: "test-source",
    ...overrides,
  };
}

describe("checkCoachEligibility", () => {
  it("accepts curated-style high-context puzzles", () => {
    const puzzle = makeBasePuzzle({
      solutionSequence: [{ x: 1, y: 1, color: "black" }],
      wrongBranches: [
        {
          userWrongMove: { x: 2, y: 2 },
          refutation: [{ x: 2, y: 3, color: "white" }],
          note: {
            zh: "如果黑贪别处，白就能先手封住眼位。",
            en: "If Black plays elsewhere, White seals the eye space immediately.",
            ja: "黒が別の場所に回ると、白に眼を封鎖されます。",
            ko: "흑이 다른 곳에 두면 백이 바로 눈자리를 막습니다.",
          },
        },
      ],
    });

    expect(checkCoachEligibility(puzzle)).toMatchObject({
      eligible: true,
      reason: "eligible",
      qualityTier: "coach-ready",
      hasVariationSupport: true,
    });
  });

  it("keeps well-explained puzzles without variations below coach-ready", () => {
    const puzzle = makeBasePuzzle({
      solutionNote: {
        zh: "黑先占住急所，因为这一手会先压缩白棋的眼位，再让黑棋获得稳定形状。如果黑先脱先，白棋随后补强，黑棋就很难再做出两只眼。",
        en: "Black must take the vital point first because this move reduces White's eye space and stabilizes Black's shape. If Black plays elsewhere, White reinforces next and Black loses the clean route to two eyes.",
        ja: "黒は急所を先に取るべきです。なぜなら、この一手で白の眼形を縮めながら黒の形も安定するからです。黒が別の場所に回ると、白に補強されて二眼への道が狭くなります。",
        ko: "흑은 급소를 먼저 차지해야 합니다. 이 수가 백의 눈 모양을 줄이면서 흑의 형태도 안정시키기 때문입니다. 흑이 다른 곳에 두면 백이 보강하고 두 눈을 만드는 길이 좁아집니다.",
      },
    });

    expect(checkCoachEligibility(puzzle)).toMatchObject({
      eligible: true,
      reason: "eligible",
      qualityTier: "explained",
      hasVariationSupport: false,
    });
  });

  it("rejects imported-style generic notes", () => {
    const puzzle = makeBasePuzzle({
      id: "cho-e-001",
      solutionNote: {
        zh: "经典死活题。点击「查看正解」可以看到标记出的急所位置。",
        en: "Classical life-and-death problem. Tap 'View solution' to see the vital point highlighted on the board.",
        ja: "古典的な詰碁です。「正解を見る」を押すと盤上に急所が示されます。",
        ko: "고전 사활 문제. '정답 보기'를 누르면 반 위에 급소가 표시됩니다.",
      },
    });

    expect(checkCoachEligibility(puzzle)).toMatchObject({
      eligible: false,
      reason: "generic-solution-note",
      qualityTier: "blocked",
    });
  });

  it("rejects low-quality library notes even when fields exist", () => {
    const puzzle = makeBasePuzzle({
      id: "lib-0001",
      solutionNote: {
        zh: "先占急所。",
        en: "Take the vital point.",
        ja: "急所です。",
        ko: "급소입니다.",
      },
    });

    expect(checkCoachEligibility(puzzle)).toMatchObject({
      eligible: false,
      reason: "short-solution-note",
      qualityTier: "thin",
    });
  });

  it("rejects puzzles with missing or invalid content", () => {
    const puzzle = makeBasePuzzle({
      correct: [],
      solutionNote: {
        zh: "",
        en: "",
        ja: "",
        ko: "",
      },
    });

    expect(checkCoachEligibility(puzzle)).toMatchObject({
      eligible: false,
      reason: "missing-correct-answer",
      qualityTier: "blocked",
    });
  });

  it("marks well-explained but lighter notes as explained instead of coach-ready", () => {
    const puzzle = makeBasePuzzle({
      solutionNote: {
        zh: "黑先抢急所，因为这样能先压住白棋的眼位。如果黑走别处，白就会先手补强。",
        en: "Black should take the vital point because it reduces White's eye space. If Black starts elsewhere, White settles first.",
        ja: "黒は急所を先に取るべきです。なぜなら白の眼形を圧迫できるからです。もし別に打つと白に先手で整えられます。",
        ko: "흑은 급소를 먼저 차지해야 합니다. 그 이유는 백의 눈 모양을 줄이기 때문입니다. 만약 다른 곳에 두면 백이 먼저 정리합니다.",
      },
    });

    expect(checkCoachEligibility(puzzle)).toMatchObject({
      eligible: false,
      reason: "partial-explanation",
      qualityTier: "explained",
    });
  });
});

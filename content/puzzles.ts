import type { Puzzle } from "@/types";

/**
 * Seed puzzles — coordinates are 0-indexed from the top-left.
 * For a 9x9 board, x and y range from 0..8.
 *
 * Puzzle 1 (seed): a classic 9x9 life & death — Black to kill the white group
 * in the corner by playing at the vital point.
 *
 * Shape (9x9, only the bottom-left corner matters):
 *
 *   . . . . . . . . .
 *   . . . . . . . . .
 *   . . . . . . . . .
 *   . . . . . . . . .
 *   . . . . . . . . .
 *   . . . . . . . . .
 *   . X X . . . . . .
 *   X O O X . . . . .
 *   . O . O . . . . .     <-- Black to kill. Vital point: (2, 8)
 *
 * (x = column, y = row, both 0-indexed from top-left. Here y=8 is the bottom row.)
 */

export const PUZZLES: Puzzle[] = [
  {
    id: "2026-04-18",
    date: "2026-04-18",
    boardSize: 9,
    stones: [
      // Black outer wall
      { x: 1, y: 6, color: "black" },
      { x: 2, y: 6, color: "black" },
      { x: 0, y: 7, color: "black" },
      { x: 3, y: 7, color: "black" },
      // White group in the corner
      { x: 1, y: 7, color: "white" },
      { x: 2, y: 7, color: "white" },
      { x: 1, y: 8, color: "white" },
      { x: 3, y: 8, color: "white" },
    ],
    toPlay: "black",
    // Vital point that kills — 2-8 (middle of the three bottom spots).
    correct: [{ x: 2, y: 8 }],
    tag: "life-death",
    difficulty: 2,
    prompt: {
      zh: "黑先，杀掉角上白棋",
      en: "Black to play — kill the white corner group",
      ja: "黒先、隅の白を殺してください",
      ko: "흑선 — 귀의 백을 잡으세요",
    },
    solutionNote: {
      zh: "正解是 2-8（底边中间的空点，也是白棋的急所/母点）。白无论在哪一边做眼都是假眼：黑 2-8 后白若 A，黑扑 B，白不能双活。要点是识别出这是一个典型的「中间点杀」形——白有三个空位一字排开，在中间下子使两边都无法成真眼。",
      en: "The vital point is 2-8 — the middle of the three empty points on the bottom edge. After Black plays there, White cannot make two eyes on either side: each attempted eye is false. This is the classic 'kill on the middle point' shape for a three-in-a-row gap.",
      ja: "正解は 2-8（下辺の三つ並んだ空点の中央）。ここが白の急所で、黒がここに打てば白はどちら側に眼を作ろうとしても欠け眼になる。一線に三つ並んだ形は、真ん中に打つのが急所——「中央の急所」の典型形。",
      ko: "정답은 2-8 (아래 변의 세 빈 점 중 가운데). 흑이 이 자리에 두면 백은 어느 쪽에 눈을 만들어도 가짜 눈이 된다. 일렬로 늘어선 세 빈 점의 가운데가 급소인 전형적인 사활 형태.",
    },
    source: "경전 사활 기본형",
  },
];

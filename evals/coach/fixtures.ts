/**
 * Puzzle fixtures for the coach behavioral eval.
 *
 * These are deliberately hand-written rather than pulled from
 * `content/puzzles.server.ts`: an eval that reads the live puzzle set would
 * change its own baseline every time the content pipeline lands a batch, and
 * a regression in the prompt would be indistinguishable from a change in the
 * data. Fixtures pin the position so the only moving part is the prompt.
 */
import type { Puzzle } from "@/types";

/** 19×19 corner life-and-death — the shape the UI crops to a local window. */
export const CORNER_LIFE_DEATH: Puzzle = {
  id: "eval-corner-ld",
  date: "2026-01-01",
  boardSize: 19,
  toPlay: "black",
  stones: [
    { x: 16, y: 2, color: "white" },
    { x: 17, y: 2, color: "black" },
    { x: 17, y: 3, color: "white" },
    { x: 18, y: 3, color: "black" },
  ],
  correct: [{ x: 18, y: 2 }],
  tag: "life-death",
  difficulty: 3,
  prompt: {
    zh: "黑先，角上做活。",
    en: "Black to play and live in the corner.",
    ja: "黒先、隅で生きる。",
    ko: "흑선, 귀에서 살기.",
  },
  solutionNote: {
    zh: "先占 (18,2) 这个急所，白无法破眼。",
    en: "Take the vital point at (18,2) first; White cannot destroy the eye space.",
    ja: "まず (18,2) の急所を占めれば、白は眼を奪えません。",
    ko: "먼저 (18,2) 급소를 차지하면 백은 눈을 없앨 수 없습니다.",
  },
};

/** 9×9 capture — a full-board window, no cropping. */
export const NINE_BY_NINE_CAPTURE: Puzzle = {
  id: "eval-9x9-capture",
  date: "2026-01-01",
  boardSize: 9,
  toPlay: "black",
  stones: [
    { x: 4, y: 4, color: "white" },
    { x: 4, y: 3, color: "black" },
    { x: 3, y: 4, color: "black" },
    { x: 5, y: 4, color: "black" },
  ],
  correct: [{ x: 4, y: 5 }],
  tag: "tesuji",
  difficulty: 2,
  prompt: {
    zh: "黑先，吃掉白子。",
    en: "Black to play and capture.",
    ja: "黒先、白を取る。",
    ko: "흑선, 백을 잡기.",
  },
  solutionNote: {
    zh: "(4,5) 收紧最后一口气。",
    en: "(4,5) takes the last liberty.",
    ja: "(4,5) で最後のダメを詰めます。",
    ko: "(4,5)로 마지막 활로를 메웁니다.",
  },
};

export const FIXTURES = {
  cornerLifeDeath: CORNER_LIFE_DEATH,
  nineByNineCapture: NINE_BY_NINE_CAPTURE,
} as const;

export type FixtureId = keyof typeof FIXTURES;

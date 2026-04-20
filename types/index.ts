// Shared types for go-daily

export type Locale = "zh" | "en" | "ja" | "ko";
export type LocalizedText = Record<Locale, string>;

export type Coord = { x: number; y: number }; // 0..boardSize-1
export type Color = "black" | "white";
export type Stone = Coord & { color: Color };
export type PuzzleTag = "life-death" | "tesuji" | "endgame" | "opening";

/** A wrong-move branch with refutation sequence. */
export interface WrongBranch {
  userWrongMove: Coord; // the incorrect move
  refutation: Stone[]; // opponent's reply sequence
  note: LocalizedText;
}

export interface Puzzle {
  id: string; // e.g. "2026-04-18" (daily) or "ld1-0" (seed-shift)
  date: string; // YYYY-MM-DD, local
  boardSize: 9 | 13 | 19;
  stones: Stone[]; // pre-placed position
  toPlay: Color;
  correct: Coord[]; // accepted FIRST solution points (for judging)
  /** Full correct variation sequence (multi-step). Shown on result page. */
  solutionSequence?: Stone[];
  /** Common wrong branches with refutation. */
  wrongBranches?: WrongBranch[];
  /** Whether this puzzle has full solution data (shown in library). */
  isCurated?: boolean;
  tag: PuzzleTag;
  difficulty: 1 | 2 | 3 | 4 | 5; // 1 easiest
  prompt: LocalizedText; // e.g. "黑先活"
  solutionNote: LocalizedText; // ground-truth reasoning for the LLM
  source?: string;
}

export interface PuzzleSummary {
  id: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  source: string;
  date: string;
  prompt: LocalizedText;
  isCurated: boolean;
  boardSize: 9 | 13 | 19;
  tag: PuzzleTag;
}

export interface AttemptRecord {
  puzzleId: string;
  date: string; // YYYY-MM-DD
  userMove: Coord | null;
  correct: boolean;
  solvedAtMs: number; // epoch ms when solved
}

/**
 * Per-puzzle completion state derived from attempt history.
 *   solved      → at least one attempt was correct
 *   attempted   → has attempts, none correct
 *   unattempted → no attempts recorded
 */
export type PuzzleStatus = "solved" | "attempted" | "unattempted";

export interface CoachMessage {
  role: "user" | "assistant";
  content: string;
  ts: number;
}

export const BOARD_SIZE_LABELS: Record<9 | 13 | 19, string> = {
  9: "9×9",
  13: "13×13",
  19: "19×19",
};

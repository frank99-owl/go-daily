// Shared types for go-daily

export type Locale = "zh" | "en" | "ja" | "ko";
export type LocalizedText = Record<Locale, string>;

export type Coord = { x: number; y: number }; // 0..boardSize-1
export type Color = "black" | "white";
export type Stone = Coord & { color: Color };
export type PuzzleTag = "life-death" | "tesuji" | "endgame" | "opening";

export interface Puzzle {
  id: string; // e.g. "2026-04-18"
  date: string; // YYYY-MM-DD, local
  boardSize: 9 | 13 | 19;
  stones: Stone[]; // pre-placed position
  toPlay: Color;
  correct: Coord[]; // accepted solution points
  tag: PuzzleTag;
  difficulty: 1 | 2 | 3 | 4 | 5; // 1 easiest
  prompt: LocalizedText; // e.g. "黑先活"
  solutionNote: LocalizedText; // ground-truth reasoning for the LLM
  source?: string;
}

export interface AttemptRecord {
  puzzleId: string;
  date: string; // YYYY-MM-DD
  userMove: Coord | null;
  correct: boolean;
  solvedAtMs: number; // epoch ms when solved
}

export interface CoachMessage {
  role: "user" | "assistant";
  content: string;
  ts: number;
}

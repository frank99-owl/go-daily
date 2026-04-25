// Shared types for go-daily
//
// Types whose runtime shape is enforced by Zod live in `types/schemas.ts`
// and are mirrored here via `z.infer` so the schema is the single source
// of truth. Pure UI / derived types stay hand-written below.

import type { z } from "zod";

import type {
  CoachMessageSchema,
  ColorSchema,
  CoordSchema,
  LocaleSchema,
  LocalizedTextSchema,
  PuzzleSchema,
  PuzzleTagSchema,
  StoneSchema,
  WrongBranchSchema,
} from "./schemas";

export type Locale = z.infer<typeof LocaleSchema>;
export type LocalizedText = z.infer<typeof LocalizedTextSchema>;
export type Coord = z.infer<typeof CoordSchema>;
export type Color = z.infer<typeof ColorSchema>;
export type Stone = z.infer<typeof StoneSchema>;
export type PuzzleTag = z.infer<typeof PuzzleTagSchema>;
export type WrongBranch = z.infer<typeof WrongBranchSchema>;
export type Puzzle = z.infer<typeof PuzzleSchema>;
export type CoachMessage = z.infer<typeof CoachMessageSchema>;

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

export const BOARD_SIZE_LABELS: Record<9 | 13 | 19, string> = {
  9: "9×9",
  13: "13×13",
  19: "19×19",
};

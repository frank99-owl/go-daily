import { z } from "zod";

export const LocaleSchema = z.enum(["zh", "en", "ja", "ko"]);

export const CoordSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
});

export const ColorSchema = z.enum(["black", "white"]);

export const StoneSchema = CoordSchema.extend({
  color: ColorSchema,
});

export const CoachMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  ts: z.number(),
});

export const CoachRequestSchema = z.object({
  puzzleId: z.string().min(1),
  locale: LocaleSchema,
  userMove: CoordSchema,
  isCorrect: z.boolean(),
  history: z.array(CoachMessageSchema).min(1, "History must contain at least the user's question."),
});

export const ClientErrorReportSchema = z.object({
  message: z.string().trim().min(1).max(500),
  stack: z.string().max(4_000).optional(),
  url: z.string().url().max(2_000),
  timestamp: z.number().int().nonnegative(),
  userAgent: z.string().trim().min(1).max(500),
  locale: LocaleSchema.optional(),
  puzzleId: z.string().trim().min(1).max(120).optional(),
});

// Puzzle schemas — shared by route.ts and validatePuzzles.ts
export const PuzzleTagSchema = z.enum(["life-death", "tesuji", "endgame", "opening"]);

export const WrongBranchSchema = z.object({
  userWrongMove: CoordSchema,
  refutation: z.array(StoneSchema),
  note: z.record(LocaleSchema, z.string()),
});

export const PuzzleSchema = z.object({
  id: z.string(),
  date: z.string(),
  boardSize: z.union([z.literal(9), z.literal(13), z.literal(19)]),
  stones: z.array(StoneSchema),
  toPlay: ColorSchema,
  correct: z.array(CoordSchema),
  solutionSequence: z.array(StoneSchema).optional(),
  wrongBranches: z.array(WrongBranchSchema).optional(),
  isCurated: z.boolean().optional(),
  tag: PuzzleTagSchema,
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  prompt: z.record(LocaleSchema, z.string()),
  solutionNote: z.record(LocaleSchema, z.string()),
  source: z.string().optional(),
});

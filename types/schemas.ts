import { z } from "zod";

export const LocaleSchema = z.enum(["zh", "en", "ja", "ko"]);

/**
 * Localized text must have all four locales present. Using an explicit
 * object schema (rather than `z.record(LocaleSchema, ...)`) so the inferred
 * type is `Record<Locale, string>` instead of `Partial<Record<...>>`,
 * matching the runtime guarantee enforced by the puzzle validator.
 */
export const LocalizedTextSchema = z.object({
  zh: z.string(),
  en: z.string(),
  ja: z.string(),
  ko: z.string(),
});

export const CoordSchema = z.object({
  x: z.number().int().min(1),
  y: z.number().int().min(1),
});

export const ColorSchema = z.enum(["black", "white"]);

export const StoneSchema = CoordSchema.extend({
  color: ColorSchema,
});

export const CoachMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  // Structural outer bound only. The 8KB request body cap and the prompt
  // guard's MAX_MESSAGE_LENGTH (2000, post-normalization) both trip well
  // before this, and the guard is what users should hit — it answers with a
  // localized message_too_long, where a schema failure is a raw Zod string.
  // Sized to the body cap so it can never become the first check to fire.
  content: z.string().max(8000),
  ts: z.number(),
});

/**
 * The coach personas defined in lib/coach/personas.ts. `PersonaId` is derived
 * from this so the two can never drift; the list used to be repeated there by
 * hand, and carried a "custom" id that no persona ever implemented.
 *
 * These ids are style archetypes, not people. They replaced ids named after
 * real professional players in 2026-09 — see the compliance note at the top of
 * lib/coach/personas.ts. Never name a persona id after a real person: the id
 * travels in the API request body and in analytics event properties.
 */
export const PersonaIdSchema = z.enum([
  "tempest",
  "deep-current",
  "still-water",
  "bedrock",
  "clear-mirror",
]);

export const CoachRequestSchema = z.object({
  puzzleId: z.string().min(1),
  locale: LocaleSchema,
  userMove: CoordSchema,
  // An unrecognized persona id degrades to "no preference" (the default
  // persona) instead of failing the request. The persona only picks a teaching
  // register, so a stale id is never worth a 400 on the paid feature — and one
  // is guaranteed to arrive: a tab left open across the 2026-09 persona rename
  // still runs the old bundle and sends the old id. PersonaIdSchema itself
  // stays strict; only request parsing is lenient.
  personaId: PersonaIdSchema.optional().catch(undefined),
  history: z.array(CoachMessageSchema).min(1, "History must contain at least the user's question."),
});

export const PuzzleAttemptRequestSchema = z.object({
  puzzleId: z.string().trim().min(1).max(120),
  userMove: CoordSchema,
});

export const PuzzleRevealRequestSchema = z.object({
  puzzleId: z.string().trim().min(1).max(120),
  revealToken: z.string().trim().min(1).max(2048),
});

export const PuzzleTagSchema = z.enum(["life-death", "tesuji", "endgame", "opening"]);

export const RandomPuzzleRequestSchema = z.object({
  attemptedPuzzleIds: z.array(z.string().trim().min(1).max(120)).max(10_000).optional(),
  level: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  tag: PuzzleTagSchema.optional(),
});

export const TrainingLevelPreferenceRequestSchema = z.object({
  level: z.enum(["beginner", "intermediate", "advanced"]),
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
export const WrongBranchSchema = z.object({
  userWrongMove: CoordSchema,
  refutation: z.array(StoneSchema),
  note: LocalizedTextSchema,
});

export const CoachVariationGroupSchema = z.object({
  id: z.string().trim().min(1),
  puzzleIds: z.array(z.string().trim().min(1)).min(2),
  theme: z.string().trim().min(1).max(120),
  status: z.enum(["candidate", "reviewed"]),
  note: LocalizedTextSchema.optional(),
});

export const ContentReviewBatchSchema = z.object({
  id: z.string().trim().min(1),
  scope: z.enum(["coach-ready-backfill", "variation-governance", "introductory-expansion"]),
  status: z.enum(["planned", "editing", "reviewed", "approved", "blocked"]),
  updatedAt: z.string().datetime(),
  puzzleIds: z.array(z.string().trim().min(1)).min(1),
  generatedSolutionContent: z.boolean(),
  requiresHumanReview: z.boolean(),
  checklist: z.array(z.string().trim().min(1)).min(1),
  verification: z.array(z.string().trim().min(1)).min(1),
  notes: z.string().trim().min(1).optional(),
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
  tag: PuzzleTagSchema,
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  prompt: LocalizedTextSchema,
  solutionNote: LocalizedTextSchema,
  source: z.string().optional(),
});

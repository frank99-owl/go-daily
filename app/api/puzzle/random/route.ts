import { getAllSummaries } from "@/content/puzzleSummaries";
import { apiError, createApiResponse, parseMutationBody } from "@/lib/apiHeaders";
import { getClientIP } from "@/lib/clientIp";
import {
  getDifficultiesForOnboardingLevel,
  normalizeOnboardingLevel,
} from "@/lib/puzzle/onboardingLevels";
import { pickRandomPuzzlePreferUnattempted } from "@/lib/random";
import { checkRateLimit, createRateLimiter } from "@/lib/rateLimit";
import { RandomPuzzleRequestSchema } from "@/types/schemas";

export const runtime = "nodejs";

const rateLimiter = createRateLimiter();
const MAX_BODY_BYTES = 128 * 1024;

export async function POST(request: Request) {
  const rawBody = await parseMutationBody(request, MAX_BODY_BYTES);
  if (rawBody instanceof Response) return rawBody;

  const parsed = RandomPuzzleRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid request.", 400);
  }

  const ip = getClientIP(request);
  const limitRes = await checkRateLimit(rateLimiter, `${ip}:puzzle-random`, "[puzzle-random]");
  if (limitRes) return limitRes;

  const level = normalizeOnboardingLevel(parsed.data.level);
  const difficulties = getDifficultiesForOnboardingLevel(level);
  const attemptedPuzzleIds = parsed.data.attemptedPuzzleIds ?? [];
  const levelPool = (await getAllSummaries()).filter(
    (summary) =>
      difficulties.includes(summary.difficulty) &&
      (!parsed.data.tag || summary.tag === parsed.data.tag),
  );
  // A stale client may send a difficulty outside its selected level. Keep
  // recommendations within that level, then widen only if the exact pool is empty.
  const targetDifficulty = parsed.data.difficulty
    ? Math.max(
        Math.min(...difficulties),
        Math.min(Math.max(...difficulties), parsed.data.difficulty),
      )
    : undefined;
  const exactPool = targetDifficulty
    ? levelPool.filter((summary) => summary.difficulty === targetDifficulty)
    : levelPool;
  const candidates = exactPool.length > 0 ? exactPool : levelPool;
  const pick = pickRandomPuzzlePreferUnattempted(candidates, attemptedPuzzleIds);
  if (!pick) {
    return apiError("No puzzles available.", 404);
  }

  return createApiResponse({ puzzleId: pick.id, level });
}

import { getAllSummaries } from "@/content/puzzleSummaries";
import { createApiResponse, parseMutationBody } from "@/lib/apiHeaders";
import { getClientIP } from "@/lib/clientIp";
import {
  getDifficultiesForOnboardingLevel,
  normalizeOnboardingLevel,
} from "@/lib/puzzle/onboardingLevels";
import { pickRandomPuzzlePreferUnattempted } from "@/lib/random";
import { createRateLimiter } from "@/lib/rateLimit";
import { RandomPuzzleRequestSchema } from "@/types/schemas";

export const runtime = "nodejs";

const rateLimiter = createRateLimiter();
const MAX_BODY_BYTES = 128 * 1024;

function error(message: string, status: number) {
  return createApiResponse({ error: message }, { status });
}

export async function POST(request: Request) {
  const rawBody = await parseMutationBody(request, MAX_BODY_BYTES);
  if (rawBody instanceof Response) return rawBody;

  const parsed = RandomPuzzleRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return error(parsed.error.issues[0]?.message ?? "Invalid request.", 400);
  }

  const ip = getClientIP(request);
  try {
    if (await rateLimiter.isLimited(`${ip}:puzzle-random`)) {
      return error("Too many requests, slow down.", 429);
    }
  } catch (err) {
    console.warn("[puzzle-random] rate limiter failed open", { ip, err });
  }

  const level = normalizeOnboardingLevel(parsed.data.level);
  const difficulties = getDifficultiesForOnboardingLevel(level);
  const attemptedPuzzleIds = parsed.data.attemptedPuzzleIds ?? [];
  const summaries = (await getAllSummaries()).filter((summary) =>
    difficulties.includes(summary.difficulty),
  );
  const pick = pickRandomPuzzlePreferUnattempted(summaries, attemptedPuzzleIds);
  if (!pick) {
    return error("No puzzles available.", 404);
  }

  return createApiResponse({ puzzleId: pick.id, level });
}

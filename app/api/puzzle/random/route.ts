import { getAllSummaries } from "@/content/puzzleSummaries";
import { createApiResponse } from "@/lib/apiHeaders";
import { getClientIP } from "@/lib/clientIp";
import { pickRandomPuzzle } from "@/lib/random";
import { createRateLimiter } from "@/lib/rateLimit";
import { isSameOriginMutationRequest } from "@/lib/requestSecurity";

export const runtime = "nodejs";

const rateLimiter = createRateLimiter();

function error(message: string, status: number) {
  return createApiResponse({ error: message }, { status });
}

export async function POST(request: Request) {
  if (!isSameOriginMutationRequest(request)) {
    return error("forbidden", 403);
  }

  const ip = getClientIP(request);
  try {
    if (await rateLimiter.isLimited(`${ip}:puzzle-random`)) {
      return error("Too many requests, slow down.", 429);
    }
  } catch (err) {
    console.warn("[puzzle-random] rate limiter failed open", { ip, err });
  }

  const summaries = await getAllSummaries();
  const pick = pickRandomPuzzle(summaries, [], "all");
  if (!pick) {
    return error("No puzzles available.", 404);
  }

  return createApiResponse({ puzzleId: pick.id });
}

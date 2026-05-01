import { getPuzzle } from "@/content/puzzles";
import { createApiResponse } from "@/lib/apiHeaders";
import { isInBounds, isOccupied } from "@/lib/board/board";
import { judgeMove } from "@/lib/board/judge";
import { getClientIP } from "@/lib/clientIp";
import { createRevealToken } from "@/lib/puzzle/revealToken";
import { createRateLimiter } from "@/lib/rateLimit";
import { isSameOriginMutationRequest } from "@/lib/requestSecurity";
import { PuzzleAttemptRequestSchema } from "@/types/schemas";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 2 * 1024;
const rateLimiter = createRateLimiter();

function error(message: string, status: number) {
  return createApiResponse({ error: message }, { status });
}

async function parseJsonBody(request: Request): Promise<unknown | Response> {
  if (!isSameOriginMutationRequest(request)) {
    return error("forbidden", 403);
  }

  const contentType = request.headers.get("content-type");
  if (!contentType?.includes("application/json")) {
    return error("Content-Type must be application/json.", 400);
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const len = Number(contentLength);
    if (!Number.isFinite(len) || len <= 0) {
      return error("Invalid Content-Length.", 400);
    }
    if (len > MAX_BODY_BYTES) {
      return error("Request body too large.", 413);
    }
  }

  try {
    return await request.json();
  } catch {
    return error("Invalid JSON.", 400);
  }
}

async function isAttemptRateLimited(ip: string, puzzleId: string): Promise<boolean> {
  return (
    (await rateLimiter.isLimited(`${ip}:puzzle-attempt`)) ||
    (await rateLimiter.isLimited(`${ip}:puzzle-attempt:${puzzleId}`))
  );
}

export async function POST(request: Request) {
  const rawBody = await parseJsonBody(request);
  if (rawBody instanceof Response) return rawBody;

  const parsed = PuzzleAttemptRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return error(parsed.error.issues[0]?.message ?? "Invalid request.", 400);
  }

  const { puzzleId, userMove } = parsed.data;
  const ip = getClientIP(request);
  try {
    if (await isAttemptRateLimited(ip, puzzleId)) {
      return error("Too many requests, slow down.", 429);
    }
  } catch (err) {
    console.warn("[puzzle-attempt] rate limiter failed open", { ip, puzzleId, err });
  }

  const puzzle = await getPuzzle(puzzleId);
  if (!puzzle) return error("Unknown puzzleId.", 404);
  if (!isInBounds(userMove, puzzle.boardSize) || isOccupied(puzzle.stones, userMove)) {
    return error("Invalid move.", 400);
  }

  const correct = judgeMove(puzzle, userMove);
  const revealToken = createRevealToken({ puzzleId });

  return createApiResponse({
    puzzleId,
    userMove,
    correct,
    revealToken,
  });
}

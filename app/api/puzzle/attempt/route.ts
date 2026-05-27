import { getPuzzle } from "@/content/puzzles";
import { apiError, createApiResponse, parseMutationBody } from "@/lib/apiHeaders";
import { isInBounds, isOccupied } from "@/lib/board/board";
import { judgeMove } from "@/lib/board/judge";
import { getClientIP } from "@/lib/clientIp";
import { createRevealToken } from "@/lib/puzzle/revealToken";
import { checkRateLimit, createRateLimiter } from "@/lib/rateLimit";
import { PuzzleAttemptRequestSchema } from "@/types/schemas";

export const runtime = "nodejs";

const rateLimiter = createRateLimiter();

export async function POST(request: Request) {
  const rawBody = await parseMutationBody(request);
  if (rawBody instanceof Response) return rawBody;

  const parsed = PuzzleAttemptRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid request.", 400);
  }

  const { puzzleId, userMove } = parsed.data;
  const ip = getClientIP(request);
  const limitRes =
    (await checkRateLimit(rateLimiter, `${ip}:puzzle-attempt`, "[puzzle-attempt]")) ??
    (await checkRateLimit(rateLimiter, `${ip}:puzzle-attempt:${puzzleId}`, "[puzzle-attempt]"));
  if (limitRes) return limitRes;

  const puzzle = await getPuzzle(puzzleId);
  if (!puzzle) return apiError("Unknown puzzleId.", 404);
  if (!isInBounds(userMove, puzzle.boardSize) || isOccupied(puzzle.stones, userMove)) {
    return apiError("Invalid move.", 400);
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

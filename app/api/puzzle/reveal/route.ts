import { getPuzzle } from "@/content/puzzles";
import { apiError, createApiResponse, parseMutationBody } from "@/lib/apiHeaders";
import { getClientIP } from "@/lib/clientIp";
import { verifyRevealToken } from "@/lib/puzzle/revealToken";
import { checkRateLimit, createRateLimiter } from "@/lib/rateLimit";
import { PuzzleRevealRequestSchema } from "@/types/schemas";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 3 * 1024;
const rateLimiter = createRateLimiter();

export async function POST(request: Request) {
  const rawBody = await parseMutationBody(request, MAX_BODY_BYTES);
  if (rawBody instanceof Response) return rawBody;

  const parsed = PuzzleRevealRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid request.", 400);
  }

  const { puzzleId, revealToken } = parsed.data;
  const ip = getClientIP(request);
  const limitRes =
    (await checkRateLimit(rateLimiter, `${ip}:puzzle-reveal`, "[puzzle-reveal]")) ??
    (await checkRateLimit(rateLimiter, `${ip}:puzzle-reveal:${puzzleId}`, "[puzzle-reveal]"));
  if (limitRes) return limitRes;

  const tokenResult = verifyRevealToken({ token: revealToken, puzzleId });
  if (!tokenResult.ok) {
    return apiError("Invalid reveal token.", 401);
  }

  const puzzle = await getPuzzle(puzzleId);
  if (!puzzle) return apiError("Unknown puzzleId.", 404);

  return createApiResponse({
    correct: puzzle.correct,
    solutionNote: puzzle.solutionNote,
    solutionSequence: puzzle.solutionSequence,
  });
}

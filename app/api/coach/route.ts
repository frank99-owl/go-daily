import { getPuzzle } from "@/content/puzzles";
import { createApiResponse } from "@/lib/apiHeaders";
import { getClientIP } from "@/lib/clientIp";
import { getCoachAccess } from "@/lib/coach/coachAccess";
import { COACH_ERROR_CODES } from "@/lib/coach/coachErrorCodes";
import { buildSystemPrompt } from "@/lib/coach/coachPrompt";
import { createManagedCoachProvider } from "@/lib/coach/coachProvider";
import { formatDateInTimeZone } from "@/lib/coach/coachQuota";
import {
  COACH_DEVICE_ID_HEADER,
  getCoachState,
  incrementCoachUsage,
  type CoachUsageSummary,
} from "@/lib/coach/coachState";
import { guardUserMessage, sanitizeInput } from "@/lib/promptGuard";
import { createRateLimiter } from "@/lib/rateLimit";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { CoachMessage } from "@/types";
import { CoachRequestSchema } from "@/types/schemas";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 8 * 1024; // 8 KB
const MAX_HISTORY = 6;
const UPSTREAM_TIMEOUT_MS = 25000; // 25s max for LLM call
const MAX_CONTENT_LENGTH = 10 * 1024; // 10 KB max content-length header

const rateLimiter = createRateLimiter();

function badRequest(message: string, status = 400) {
  return createApiResponse({ error: message }, { status });
}

function coachError({
  status,
  code,
  error,
  usage,
}: {
  status: number;
  code: string;
  error: string;
  usage?: CoachUsageSummary | null;
}) {
  return createApiResponse({ error, code, usage: usage ?? null }, { status });
}

function maskKey(key: string): string {
  if (key.length <= 8) return "***";
  return key.slice(0, 4) + "..." + key.slice(-4);
}

export async function POST(request: Request) {
  const startTime = Date.now();

  // Content-Type validation
  const contentType = request.headers.get("content-type");
  if (!contentType?.includes("application/json")) {
    return badRequest("Content-Type must be application/json.");
  }

  // Body size cap (defense in depth)
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const len = Number(contentLength);
    if (isNaN(len) || len <= 0 || len > MAX_CONTENT_LENGTH) {
      return badRequest("Invalid Content-Length.");
    }
    if (len > MAX_BODY_BYTES) {
      return badRequest("Request body too large.", 413);
    }
  }

  const supabase = await createServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return coachError({
      status: 401,
      code: COACH_ERROR_CODES.LOGIN_REQUIRED,
      error: "Sign in required.",
    });
  }

  // Rate limit
  const ip = getClientIP(request);
  try {
    if (await rateLimiter.isLimited(ip)) {
      return badRequest("Too many requests, slow down.", 429);
    }
  } catch (error) {
    console.warn("[coach] rate limiter failed open", { ip, error });
  }

  // Parse
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return badRequest("Invalid JSON.");
  }

  const parseResult = CoachRequestSchema.safeParse(rawBody);
  if (!parseResult.success) {
    const first = parseResult.error.issues[0];
    return badRequest(first.message);
  }

  const { puzzleId, locale, userMove, isCorrect, history } = parseResult.data;

  const puzzle = await getPuzzle(puzzleId);
  if (!puzzle) return badRequest("Unknown puzzleId.", 404);
  const coachAccess = getCoachAccess(puzzle);
  if (!coachAccess.available) {
    return createApiResponse(
      {
        error: "AI coach is only available on approved coach-ready puzzles.",
      },
      { status: 403 },
    );
  }

  const admin = createServiceClient();
  const now = new Date();
  const coachState = await getCoachState({
    admin,
    userId: user.id,
    deviceId: request.headers.get(COACH_DEVICE_ID_HEADER),
    now,
  });

  if (coachState.deviceLimited) {
    return coachError({
      status: 403,
      code: COACH_ERROR_CODES.DEVICE_LIMIT,
      error: "Free account device limit reached.",
      usage: coachState.usage,
    });
  }

  if (!coachState.usage) {
    return coachError({
      status: 401,
      code: COACH_ERROR_CODES.LOGIN_REQUIRED,
      error: "Sign in required.",
    });
  }

  if (coachState.usage.dailyRemaining <= 0) {
    return coachError({
      status: 429,
      code: COACH_ERROR_CODES.DAILY_LIMIT_REACHED,
      error: "Daily AI coach limit reached.",
      usage: coachState.usage,
    });
  }

  if (coachState.usage.monthlyRemaining <= 0) {
    return coachError({
      status: 429,
      code: COACH_ERROR_CODES.MONTHLY_LIMIT_REACHED,
      error: "Monthly AI coach limit reached.",
      usage: coachState.usage,
    });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.error("[coach] Missing DEEPSEEK_API_KEY");
    return createApiResponse(
      {
        error: "The AI coach is not configured on the server (missing DEEPSEEK_API_KEY).",
      },
      { status: 500 },
    );
  }

  // Validate each user message for prompt injection
  for (const m of history) {
    if (m.role === "user") {
      const guard = guardUserMessage(m.content);
      if (!guard.ok) {
        return badRequest(guard.reason || "Invalid message content.");
      }
    }
  }

  // Keep only the last MAX_HISTORY turns.
  const trimmedHistory: CoachMessage[] = history.slice(-MAX_HISTORY).map((m) => ({
    role: m.role,
    content: sanitizeInput(m.content.slice(0, 2000)),
    ts: 0,
  }));

  const systemPrompt = buildSystemPrompt(puzzle, locale, userMove, isCorrect);

  const openaiMessages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }> = [{ role: "system", content: systemPrompt }];

  for (const m of trimmedHistory) {
    openaiMessages.push({ role: m.role, content: m.content });
  }

  try {
    const provider = createManagedCoachProvider({
      apiKey,
      timeout: UPSTREAM_TIMEOUT_MS,
    });
    const reply = await provider.createReply(openaiMessages);
    if (!reply) {
      console.warn("[coach] Empty reply from model");
      return createApiResponse({ error: "Empty reply from the model." }, { status: 502 });
    }

    await incrementCoachUsage({
      admin,
      userId: user.id,
      day: formatDateInTimeZone(now, coachState.usage.timeZone),
    });

    const updatedUsage: CoachUsageSummary = {
      ...coachState.usage,
      dailyUsed: coachState.usage.dailyUsed + 1,
      monthlyUsed: coachState.usage.monthlyUsed + 1,
      dailyRemaining: Math.max(coachState.usage.dailyRemaining - 1, 0),
      monthlyRemaining: Math.max(coachState.usage.monthlyRemaining - 1, 0),
    };

    return createApiResponse({ reply, usage: updatedUsage });
  } catch (err) {
    const error = err as Error;
    const duration = Date.now() - startTime;

    // Classify error for better diagnostics
    if (error.name === "AbortError" || error.message?.includes("timeout")) {
      console.error(`[coach] upstream timeout puzzle=${puzzleId} duration=${duration}ms`);
      return createApiResponse(
        { error: "Coach is taking too long. Please try again." },
        { status: 504 },
      );
    }

    if (error.message?.includes("429") || error.message?.includes("rate limit")) {
      console.error(`[coach] upstream rate limit puzzle=${puzzleId}`);
      return createApiResponse(
        { error: "Coach is busy. Please try again in a moment." },
        { status: 429 },
      );
    }

    if (error.message?.includes("401") || error.message?.includes("auth")) {
      console.error(`[coach] auth error key=${maskKey(apiKey)}`);
      return createApiResponse(
        { error: "Coach authentication failed. Please contact support." },
        { status: 500 },
      );
    }

    console.error(
      `[coach] upstream error puzzle=${puzzleId} duration=${duration}ms:`,
      error.message,
    );
    return createApiResponse(
      { error: "Coach is temporarily unavailable. Please try again later." },
      { status: 502 },
    );
  }
}

export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return coachError({
      status: 401,
      code: COACH_ERROR_CODES.LOGIN_REQUIRED,
      error: "Sign in required.",
    });
  }

  const coachState = await getCoachState({
    admin: createServiceClient(),
    userId: user.id,
    deviceId: request.headers.get(COACH_DEVICE_ID_HEADER),
  });

  if (coachState.deviceLimited) {
    return coachError({
      status: 403,
      code: COACH_ERROR_CODES.DEVICE_LIMIT,
      error: "Free account device limit reached.",
      usage: coachState.usage,
    });
  }

  return createApiResponse({ usage: coachState.usage });
}

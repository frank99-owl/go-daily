import { getPuzzle } from "@/content/puzzles";
import { createApiResponse, parseMutationBody } from "@/lib/apiHeaders";
import { isInBounds, isOccupied } from "@/lib/board/board";
import { judgeMove } from "@/lib/board/judge";
import { getClientCountry, getClientIP } from "@/lib/clientIp";
import { getCoachAccess } from "@/lib/coach/coachAccess";
import { captureCoachFailed } from "@/lib/coach/coachAnalytics";
import { COACH_ERROR_CODES } from "@/lib/coach/coachErrorCodes";
import { buildSystemPrompt } from "@/lib/coach/coachPrompt";
import { formatDateInTimeZone } from "@/lib/coach/coachQuota";
import {
  chargeAuthUsage,
  chargeGuestUsage,
  checkAuthQuota,
  checkGuestQuota,
  classifyUpstreamError,
  coachError,
  errorResponse,
  getCoachModelInfo,
  refundUsage,
  resolveIdentity,
} from "@/lib/coach/coachRouteHelpers";
import {
  buildSseResponse,
  createCoachSseStream,
  trimHistory,
} from "@/lib/coach/coachStreamHandler";
import { checkIpLimit, incrementIpCounter } from "@/lib/coach/guestCoachUsage";
import { getPersona } from "@/lib/coach/personas";
import { getCoachEnv } from "@/lib/env";
import { guardUserMessage } from "@/lib/promptGuard";
import { checkRateLimit, createRateLimiter } from "@/lib/rateLimit";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { CoachRequestSchema } from "@/types/schemas";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 8 * 1024;
const MAX_HISTORY = 6;
const MAX_HISTORY_CHARS = 6_000;
const UPSTREAM_TIMEOUT_MS = 25000;

const rateLimiter = createRateLimiter();

// ── POST ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const startTime = performance.now();

  // 1. Parse & validate input
  const rawBody = await parseMutationBody(request, MAX_BODY_BYTES);
  if (rawBody instanceof Response) return rawBody;

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const identity = resolveIdentity(request);
  if (identity instanceof Response) return identity;
  const { guestDeviceId, authDeviceId } = identity;
  const isGuest = !user && !!guestDeviceId;

  if (!user && !guestDeviceId) {
    return coachError({
      status: 401,
      code: COACH_ERROR_CODES.LOGIN_REQUIRED,
      error: "Sign in required.",
    });
  }

  // 2. Rate limiting
  const ip = getClientIP(request);
  const countryCode = getClientCountry(request);
  const limitRes = await checkRateLimit(rateLimiter, ip, "[coach]", undefined, false);
  if (limitRes) return limitRes;

  if (isGuest) {
    const ipCheck = await checkIpLimit(ip, countryCode);
    if (!ipCheck.allowed) {
      return coachError({
        status: 429,
        code: COACH_ERROR_CODES.DAILY_LIMIT_REACHED,
        error: "Daily limit reached. Sign up for more.",
        usage: null,
      });
    }
  }

  // 3. Validate request body
  const parseResult = CoachRequestSchema.safeParse(rawBody);
  if (!parseResult.success) {
    return errorResponse(parseResult.error.issues[0].message);
  }

  const { puzzleId, locale, userMove, personaId, history } = parseResult.data;

  for (const m of history) {
    if (m.role === "user") {
      const guard = guardUserMessage(m.content);
      if (!guard.ok) return errorResponse(guard.reason || "Invalid message content.");
    }
  }

  // 4. Validate puzzle & move
  const puzzle = await getPuzzle(puzzleId);
  if (!puzzle) return errorResponse("Unknown puzzleId.", 404);
  if (!isInBounds(userMove, puzzle.boardSize) || isOccupied(puzzle.stones, userMove)) {
    return errorResponse("Invalid move.", 400);
  }

  const isCorrect = judgeMove(puzzle, userMove);
  const persona = getPersona(personaId);
  const coachAccess = getCoachAccess(puzzle);
  if (!coachAccess.available) {
    return coachError({
      status: 403,
      code: COACH_ERROR_CODES.COACH_UNAVAILABLE,
      error:
        coachAccess.contentTier === "coach-eligible"
          ? "This puzzle has a curated explanation, but full AI coach needs a reviewed main line and wrong-branch notes."
          : "AI coach is only available on approved coach-ready puzzles.",
      coachAccess,
    });
  }

  // 5. Quota check
  let coachState: Awaited<
    ReturnType<typeof import("@/lib/coach/coachState").getCoachState>
  > | null = null;
  if (isGuest) {
    const quotaErr = await checkGuestQuota(guestDeviceId!, countryCode);
    if (quotaErr) return quotaErr;
  } else {
    const result = await checkAuthQuota(user!.id, authDeviceId, user!.email);
    if (result.response) return result.response;
    coachState = result.coachState;
  }

  // 6. Build LLM messages
  let apiKey: string;
  try {
    apiKey = getCoachEnv().DEEPSEEK_API_KEY;
  } catch {
    console.error("[coach] Missing DEEPSEEK_API_KEY");
    return createApiResponse(
      { error: "The AI coach is not configured on the server (missing DEEPSEEK_API_KEY)." },
      { status: 500 },
    );
  }

  const trimmedHistory = trimHistory(history, MAX_HISTORY, MAX_HISTORY_CHARS);
  const systemPrompt = buildSystemPrompt(puzzle, locale, userMove, isCorrect, persona);
  const openaiMessages = [
    { role: "system" as const, content: systemPrompt },
    ...trimmedHistory.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  // 7. Charge usage & stream response
  const usageDay = !isGuest ? formatDateInTimeZone(new Date(), coachState!.usage!.timeZone) : "";

  try {
    let updatedUsage;
    if (isGuest) {
      const result = await chargeGuestUsage({ guestDeviceId: guestDeviceId!, countryCode });
      if (result.error) return result.error;
      updatedUsage = result.updatedUsage!;
      incrementIpCounter(ip, countryCode).catch((error) => {
        console.warn("[coach] failed to increment guest IP counter", { ip, error });
      });
    } else {
      const result = await chargeAuthUsage({
        userId: user!.id,
        email: user!.email,
        usageDay,
        usage: coachState!.usage!,
      });
      if (result.error) return result.error;
      updatedUsage = result.updatedUsage!;
    }

    const distinctId = isGuest ? guestDeviceId! : user!.id;
    const plan = isGuest ? "guest" : coachState!.usage!.plan;

    return buildSseResponse(
      createCoachSseStream({
        apiKey,
        upstreamTimeoutMs: UPSTREAM_TIMEOUT_MS,
        openaiMessages,
        locale,
        personaId: personaId || "default",
        plan,
        distinctId,
        isGuest,
        refundParams: {
          guestDeviceId: guestDeviceId!,
          countryCode,
          userId: user?.id ?? "",
          usageDay,
        },
        updatedUsage,
        signal: request.signal,
      }),
    );
  } catch (err) {
    const error = err as Error;
    await refundUsage(isGuest, {
      guestDeviceId: guestDeviceId!,
      countryCode,
      userId: user?.id ?? "",
      usageDay,
    });
    const { httpStatus, errorCode } = classifyUpstreamError(error);

    captureCoachFailed(isGuest ? guestDeviceId! : (user?.id ?? "unknown"), {
      locale,
      personaId: personaId || "default",
      plan: isGuest ? "guest" : (coachState?.usage?.plan ?? "free"),
      model: getCoachModelInfo().model,
      provider: getCoachModelInfo().provider,
      durationMs: Math.round(performance.now() - startTime),
      errorCode,
      httpStatus,
    });

    const messages: Record<number, string> = {
      504: "Coach is taking too long. Please try again.",
      429: "Coach is busy. Please try again in a moment.",
      500: "Coach authentication failed. Please contact support.",
    };
    return createApiResponse(
      {
        error: messages[httpStatus] ?? "Coach is temporarily unavailable. Please try again later.",
      },
      { status: httpStatus },
    );
  }
}

// ── GET ──────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  // Quota lookups are read-only but still hit the service-role client, so
  // throttle them on their own key namespace (independent of the POST bucket).
  const ip = getClientIP(request);
  const limitRes = await checkRateLimit(rateLimiter, `coach-get:${ip}`, "[coach:get]");
  if (limitRes) return limitRes;

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const identity = resolveIdentity(request);
  if (identity instanceof Response) return identity;
  const { guestDeviceId, authDeviceId } = identity;
  const countryCode = getClientCountry(request);

  if (!user && guestDeviceId) {
    const { getGuestUsage } = await import("@/lib/coach/guestCoachUsage");
    return createApiResponse({ usage: await getGuestUsage(guestDeviceId, countryCode) });
  }

  if (!user) {
    return coachError({
      status: 401,
      code: COACH_ERROR_CODES.LOGIN_REQUIRED,
      error: "Sign in required.",
    });
  }

  const { getCoachState } = await import("@/lib/coach/coachState");
  const coachState = await getCoachState({
    admin: createServiceClient(),
    userId: user.id,
    deviceId: authDeviceId,
    email: user.email,
    now: new Date(),
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

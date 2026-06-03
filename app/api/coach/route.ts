import { getPuzzle } from "@/content/puzzles";
import { createApiResponse, parseMutationBody } from "@/lib/apiHeaders";
import { isInBounds, isOccupied } from "@/lib/board/board";
import { judgeMove } from "@/lib/board/judge";
import { getClientIP } from "@/lib/clientIp";
import { getCoachAccess } from "@/lib/coach/coachAccess";
import { COACH_ERROR_CODES } from "@/lib/coach/coachErrorCodes";
import { buildSystemPrompt } from "@/lib/coach/coachPrompt";
import { createManagedCoachProvider, type CoachProviderUsage } from "@/lib/coach/coachProvider";
import { formatDateInTimeZone } from "@/lib/coach/coachQuota";
import {
  chargeAuthUsage,
  chargeGuestUsage,
  checkAuthQuota,
  checkGuestQuota,
  classifySseError,
  classifyUpstreamError,
  coachError,
  errorResponse,
  getCoachModelInfo,
  refundUsage,
  resolveIdentity,
} from "@/lib/coach/coachRouteHelpers";
import { checkIpLimit, incrementIpCounter } from "@/lib/coach/guestCoachUsage";
import { getPersona } from "@/lib/coach/personas";
import { getCoachEnv } from "@/lib/env";
import { captureServerEvent } from "@/lib/posthog/server";
import { guardUserMessage, sanitizeInput } from "@/lib/promptGuard";
import { checkRateLimit, createRateLimiter } from "@/lib/rateLimit";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { CoachMessage } from "@/types";
import { CoachRequestSchema } from "@/types/schemas";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 8 * 1024;
const MAX_HISTORY = 6;
const MAX_HISTORY_CHARS = 6_000;
const UPSTREAM_TIMEOUT_MS = 25000;

const rateLimiter = createRateLimiter();

// ── POST ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const startTime = Date.now();

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
  const countryCode = request.headers.get("cf-ipcountry");
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

  const sanitized = history.slice(-MAX_HISTORY).map((m) => ({
    role: m.role,
    content: sanitizeInput([...m.content.normalize("NFKC")].slice(0, 2000).join("")),
    ts: 0,
  }));

  let charBudget = MAX_HISTORY_CHARS;
  const trimmedHistory: CoachMessage[] = [];
  for (let i = sanitized.length - 1; i >= 0; i--) {
    const m = sanitized[i];
    if (m.content.length > charBudget && trimmedHistory.length > 0) break;
    trimmedHistory.unshift(m);
    charBudget -= m.content.length;
  }

  const systemPrompt = buildSystemPrompt(puzzle, locale, userMove, isCorrect, persona);
  const openaiMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt },
    ...trimmedHistory.map((m) => ({ role: m.role, content: m.content })),
  ];

  // 7. Charge usage BEFORE streaming (abuse prevention)
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

    // 8. Stream response
    const modelInfo = getCoachModelInfo();
    const provider = createManagedCoachProvider({ apiKey, timeout: UPSTREAM_TIMEOUT_MS });
    const stream = provider.createReplyStream(openaiMessages, { signal: request.signal });
    let tokenUsage: CoachProviderUsage | null = null;
    let modelName: string | null = null;
    let firstToken = true;

    const encoder = new TextEncoder();
    const sseStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (chunk.model) modelName = chunk.model;
            if (chunk.usage) tokenUsage = chunk.usage;

            if (chunk.delta) {
              if (firstToken) {
                firstToken = false;
                chunk.delta = chunk.delta.replace(/^(system|SYSTEM)\s*[:：]\s*/i, "");
              }
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ delta: chunk.delta })}\n\n`),
              );
            }
          }

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ done: true, usage: updatedUsage })}\n\n`),
          );
          controller.close();

          captureServerEvent({
            distinctId: isGuest ? guestDeviceId! : user!.id,
            event: "coach_request_completed",
            properties: {
              locale,
              personaId: personaId || "default",
              plan: isGuest ? "guest" : coachState!.usage!.plan,
              model: modelName ?? modelInfo.model,
              provider: modelInfo.provider,
              durationMs: Date.now() - startTime,
              inputTokens: tokenUsage?.inputTokens ?? null,
              outputTokens: tokenUsage?.outputTokens ?? null,
              totalTokens: tokenUsage?.totalTokens ?? null,
              usageAvailable: tokenUsage?.usageAvailable ?? false,
            },
          }).catch(() => {});
        } catch (err) {
          const error = err as Error;
          await refundUsage(isGuest, {
            guestDeviceId: guestDeviceId!,
            countryCode,
            userId: user!.id,
            usageDay,
          });
          const errorCode = classifySseError(error);

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: errorCode })}\n\n`));
          controller.close();

          captureServerEvent({
            distinctId: isGuest ? guestDeviceId! : (user?.id ?? "unknown"),
            event: "coach_request_failed",
            properties: {
              locale,
              personaId: personaId || "default",
              plan: isGuest ? "guest" : (coachState?.usage?.plan ?? "free"),
              model: modelInfo.model,
              provider: modelInfo.provider,
              durationMs: Date.now() - startTime,
              errorCode,
              httpStatus: 0,
            },
          }).catch(() => {});
        }
      },
      cancel(reason) {
        console.debug(`[coach] SSE stream canceled by client. Reason:`, reason);
      },
    });

    return new Response(sseStream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    const error = err as Error;
    await refundUsage(isGuest, {
      guestDeviceId: guestDeviceId!,
      countryCode,
      userId: user!.id,
      usageDay,
    });
    const { httpStatus, errorCode } = classifyUpstreamError(error);

    captureServerEvent({
      distinctId: isGuest ? guestDeviceId! : (user?.id ?? "unknown"),
      event: "coach_request_failed",
      properties: {
        locale,
        personaId: personaId || "default",
        plan: isGuest ? "guest" : (coachState?.usage?.plan ?? "free"),
        model: getCoachModelInfo().model,
        provider: getCoachModelInfo().provider,
        durationMs: Date.now() - startTime,
        errorCode,
        httpStatus,
      },
    }).catch(() => {});

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
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const identity = resolveIdentity(request);
  if (identity instanceof Response) return identity;
  const { guestDeviceId, authDeviceId } = identity;
  const countryCode = request.headers.get("cf-ipcountry");

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

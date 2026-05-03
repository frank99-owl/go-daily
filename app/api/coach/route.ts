import { getPuzzle } from "@/content/puzzles";
import { createApiResponse, parseMutationBody } from "@/lib/apiHeaders";
import { judgeMove } from "@/lib/board/judge";
import { getClientIP } from "@/lib/clientIp";
import { getCoachAccess } from "@/lib/coach/coachAccess";
import { COACH_ERROR_CODES } from "@/lib/coach/coachErrorCodes";
import { buildSystemPrompt } from "@/lib/coach/coachPrompt";
import { createManagedCoachProvider, type CoachProviderUsage } from "@/lib/coach/coachProvider";
import { formatDateInTimeZone } from "@/lib/coach/coachQuota";
import {
  COACH_DEVICE_ID_HEADER,
  getCoachState,
  incrementCoachUsage,
  type CoachUsageSummary,
} from "@/lib/coach/coachState";
import {
  checkIpLimit,
  getGuestUsage,
  incrementGuestUsage,
  incrementIpCounter,
  type GuestUsageSummary,
} from "@/lib/coach/guestCoachUsage";
import { getPersona } from "@/lib/coach/personas";
import { getCoachEnv } from "@/lib/env";
import { captureServerEvent } from "@/lib/posthog/server";
import { guardUserMessage, sanitizeInput } from "@/lib/promptGuard";
import { createRateLimiter } from "@/lib/rateLimit";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { CoachMessage } from "@/types";
import { CoachRequestSchema } from "@/types/schemas";

const GUEST_DEVICE_ID_HEADER = "x-go-daily-guest-device-id";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 8 * 1024; // 8 KB
const MAX_HISTORY = 6;
const MAX_HISTORY_CHARS = 6_000; // Total character budget across all history messages
const UPSTREAM_TIMEOUT_MS = 25000; // 25s max for LLM call

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
  usage?: CoachUsageSummary | GuestUsageSummary | null;
}) {
  return createApiResponse({ error, code, usage: usage ?? null }, { status });
}

function maskKey(key: string): string {
  if (key.length <= 4) return "***";
  // Show only the first 4 chars and key length — avoids leaking enough of the
  // suffix for offline brute-force when logs are exported to third-party tools.
  return key.slice(0, 4) + "...(len:" + key.length + ")";
}

function getCoachModelInfo() {
  const env = getCoachEnv();
  return {
    model: env.COACH_MODEL,
    provider: env.COACH_API_URL,
  };
}

export async function POST(request: Request) {
  const startTime = Date.now();

  // Parse and validate request body (CSRF + Content-Type + size + JSON).
  const rawBody = await parseMutationBody(request, MAX_BODY_BYTES);
  if (rawBody instanceof Response) return rawBody;

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const guestDeviceId = request.headers.get(GUEST_DEVICE_ID_HEADER);
  const isGuest = !user && !!guestDeviceId;

  if (!user && !guestDeviceId) {
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

  // IP rate limit for guests — prevents abuse via repeated incognito sessions
  if (isGuest) {
    const ipCheck = checkIpLimit(ip);
    if (!ipCheck.allowed) {
      return coachError({
        status: 429,
        code: COACH_ERROR_CODES.DAILY_LIMIT_REACHED,
        error: "Daily limit reached. Sign up for more.",
        usage: null,
      });
    }
  }

  const parseResult = CoachRequestSchema.safeParse(rawBody);
  if (!parseResult.success) {
    const first = parseResult.error.issues[0];
    return badRequest(first.message);
  }

  const { puzzleId, locale, userMove, personaId, history } = parseResult.data;

  const puzzle = await getPuzzle(puzzleId);
  if (!puzzle) return badRequest("Unknown puzzleId.", 404);
  const isCorrect = judgeMove(puzzle, userMove);
  const persona = getPersona(personaId || "");
  const coachAccess = getCoachAccess(puzzle);
  if (!coachAccess.available) {
    return createApiResponse(
      {
        error: "AI coach is only available on approved coach-ready puzzles.",
      },
      { status: 403 },
    );
  }

  // Guest usage check
  let guestUsage: GuestUsageSummary | null = null;
  if (isGuest) {
    guestUsage = await getGuestUsage(guestDeviceId!);

    if (guestUsage.dailyRemaining <= 0) {
      return coachError({
        status: 429,
        code: COACH_ERROR_CODES.DAILY_LIMIT_REACHED,
        error: "Daily AI coach limit reached.",
        usage: guestUsage,
      });
    }

    if (guestUsage.monthlyRemaining <= 0) {
      return coachError({
        status: 429,
        code: COACH_ERROR_CODES.MONTHLY_LIMIT_REACHED,
        error: "Monthly AI coach limit reached.",
        usage: guestUsage,
      });
    }
  }

  // Authenticated user usage check
  let coachState: Awaited<ReturnType<typeof getCoachState>> | null = null;
  let admin: ReturnType<typeof createServiceClient> | null = null;
  if (!isGuest) {
    admin = createServiceClient();
    const now = new Date();
    coachState = await getCoachState({
      admin,
      userId: user!.id,
      deviceId: request.headers.get(COACH_DEVICE_ID_HEADER),
      email: user!.email,
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
  }

  let apiKey: string;
  try {
    apiKey = getCoachEnv().DEEPSEEK_API_KEY;
  } catch {
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

  // Keep only the last MAX_HISTORY turns, then enforce a total character budget
  // by dropping the oldest messages first.
  const sanitized = history.slice(-MAX_HISTORY).map((m) => ({
    role: m.role,
    content: sanitizeInput(m.content.slice(0, 2000)),
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

  const openaiMessages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }> = [{ role: "system", content: systemPrompt }];

  for (const m of trimmedHistory) {
    openaiMessages.push({ role: m.role, content: m.content });
  }

  const modelInfo = getCoachModelInfo();

  // Increment usage BEFORE streaming to prevent free partial responses.
  if (isGuest) {
    await incrementGuestUsage(guestDeviceId!);
    incrementIpCounter(ip);
  } else {
    await incrementCoachUsage({
      admin: admin!,
      userId: user!.id,
      day: formatDateInTimeZone(new Date(), coachState!.usage!.timeZone),
    });
  }

  const updatedUsage = isGuest
    ? {
        dailyLimit: guestUsage!.dailyLimit,
        monthlyLimit: guestUsage!.monthlyLimit,
        dailyUsed: guestUsage!.dailyUsed + 1,
        monthlyUsed: guestUsage!.monthlyUsed + 1,
        dailyRemaining: Math.max(guestUsage!.dailyRemaining - 1, 0),
        monthlyRemaining: Math.max(guestUsage!.monthlyRemaining - 1, 0),
      }
    : {
        ...coachState!.usage!,
        dailyUsed: coachState!.usage!.dailyUsed + 1,
        monthlyUsed: coachState!.usage!.monthlyUsed + 1,
        dailyRemaining: Math.max(coachState!.usage!.dailyRemaining - 1, 0),
        monthlyRemaining: Math.max(coachState!.usage!.monthlyRemaining - 1, 0),
      };

  try {
    const provider = createManagedCoachProvider({
      apiKey,
      timeout: UPSTREAM_TIMEOUT_MS,
    });

    const stream = provider.createReplyStream(openaiMessages);
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
              // Strip "system:" prefix from the very first token batch
              if (firstToken) {
                firstToken = false;
                chunk.delta = chunk.delta.replace(/^(system|SYSTEM)\s*[:：]\s*/i, "");
              }
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ delta: chunk.delta })}\n\n`),
              );
            }
          }

          // Stream finished — send done event with usage
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ done: true, usage: updatedUsage })}\n\n`),
          );
          controller.close();

          // Fire-and-forget analytics
          const durationMs = Date.now() - startTime;
          captureServerEvent({
            distinctId: isGuest ? guestDeviceId! : user!.id,
            event: "coach_request_completed",
            properties: {
              puzzleId,
              locale,
              personaId: personaId || "default",
              plan: isGuest ? "guest" : coachState!.usage!.plan,
              model: modelName ?? modelInfo.model,
              provider: modelInfo.provider,
              durationMs,
              inputTokens: tokenUsage?.inputTokens ?? null,
              outputTokens: tokenUsage?.outputTokens ?? null,
              totalTokens: tokenUsage?.totalTokens ?? null,
              usageAvailable: tokenUsage?.usageAvailable ?? false,
            },
          }).catch(() => {});
        } catch (err) {
          const error = err as Error;
          const durationMs = Date.now() - startTime;

          let errorCode = "upstream_error";
          if (error.name === "AbortError" || error.message?.includes("timeout")) {
            errorCode = "timeout";
          } else if (error.message?.includes("429") || error.message?.includes("rate limit")) {
            errorCode = "rate_limit";
          } else if (error.message?.includes("401") || error.message?.includes("auth")) {
            errorCode = "auth_error";
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: errorCode })}\n\n`));
          controller.close();

          captureServerEvent({
            distinctId: isGuest ? guestDeviceId! : (user?.id ?? "unknown"),
            event: "coach_request_failed",
            properties: {
              puzzleId,
              locale,
              personaId: personaId || "default",
              plan: isGuest ? "guest" : (coachState?.usage?.plan ?? "free"),
              model: modelInfo.model,
              provider: modelInfo.provider,
              durationMs,
              errorCode,
              httpStatus: 0,
            },
          }).catch(() => {});
        }
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
    // Provider construction failed — return a normal JSON error
    const error = err as Error;
    const durationMs = Date.now() - startTime;

    let httpStatus = 502;
    let errorCode = "upstream_error";

    if (error.name === "AbortError" || error.message?.includes("timeout")) {
      httpStatus = 504;
      errorCode = "timeout";
    } else if (error.message?.includes("429") || error.message?.includes("rate limit")) {
      httpStatus = 429;
      errorCode = "rate_limit";
    } else if (error.message?.includes("401") || error.message?.includes("auth")) {
      httpStatus = 500;
      errorCode = "auth_error";
    }

    captureServerEvent({
      distinctId: isGuest ? guestDeviceId! : (user?.id ?? "unknown"),
      event: "coach_request_failed",
      properties: {
        puzzleId,
        locale,
        personaId: personaId || "default",
        plan: isGuest ? "guest" : (coachState?.usage?.plan ?? "free"),
        model: modelInfo.model,
        provider: modelInfo.provider,
        durationMs,
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

export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const guestDeviceId = request.headers.get(GUEST_DEVICE_ID_HEADER);

  // Guest usage query
  if (!user && guestDeviceId) {
    const usage = await getGuestUsage(guestDeviceId);
    return createApiResponse({ usage });
  }

  if (!user) {
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
    email: user.email,
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

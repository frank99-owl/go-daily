import { createApiResponse } from "@/lib/apiHeaders";
import { DEVICE_ID_MAX_LENGTH } from "@/lib/auth/deviceRegistry";
import { COACH_ERROR_CODES } from "@/lib/coach/coachErrorCodes";
import {
  getCoachState,
  decrementCoachUsage,
  tryIncrementCoachUsage,
  type CoachUsageSummary,
} from "@/lib/coach/coachState";
import {
  getGuestUsage,
  decrementGuestUsage,
  tryIncrementGuestUsage,
  type GuestUsageSummary,
} from "@/lib/coach/guestCoachUsage";
import { getCoachEnv } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/service";
import type { PublicCoachAccess } from "@/types";

// ── Generic helpers ──────────────────────────────────────────────────

export function errorResponse(message: string, status = 400) {
  return createApiResponse({ error: message }, { status });
}

export function coachError({
  status,
  code,
  error,
  usage,
  coachAccess,
}: {
  status: number;
  code: string;
  error: string;
  usage?: CoachUsageSummary | GuestUsageSummary | null;
  coachAccess?: PublicCoachAccess;
}) {
  return createApiResponse({ error, code, usage: usage ?? null, coachAccess }, { status });
}

// ── Identity resolution ──────────────────────────────────────────────

export interface ResolvedIdentity {
  isGuest: boolean;
  guestDeviceId: string | null;
  authDeviceId: string | null;
}

export function resolveIdentity(request: Request): ResolvedIdentity | Response {
  const guestDeviceId = request.headers.get("x-go-daily-guest-device-id");
  const authDeviceId = request.headers.get("x-go-daily-device-id");

  if (
    (guestDeviceId && guestDeviceId.length > DEVICE_ID_MAX_LENGTH) ||
    (authDeviceId && authDeviceId.length > DEVICE_ID_MAX_LENGTH)
  ) {
    return errorResponse("Invalid device ID.", 400);
  }

  return { isGuest: false, guestDeviceId, authDeviceId };
}

// ── Quota checks ─────────────────────────────────────────────────────

export async function checkGuestQuota(
  guestDeviceId: string,
  countryCode: string | null,
): Promise<null | Response> {
  const usage = await getGuestUsage(guestDeviceId, countryCode);

  if (usage.dailyRemaining <= 0) {
    return coachError({
      status: 429,
      code: COACH_ERROR_CODES.DAILY_LIMIT_REACHED,
      error: "Daily AI coach limit reached.",
      usage,
    });
  }

  if (usage.monthlyRemaining <= 0) {
    return coachError({
      status: 429,
      code: COACH_ERROR_CODES.MONTHLY_LIMIT_REACHED,
      error: "Monthly AI coach limit reached.",
      usage,
    });
  }

  return null;
}

export interface AuthQuotaResult {
  response: null | Response;
  coachState: Awaited<ReturnType<typeof getCoachState>> | null;
}

export async function checkAuthQuota(
  userId: string,
  deviceId: string | null,
  email: string | undefined,
): Promise<AuthQuotaResult> {
  const admin = createServiceClient();
  const coachState = await getCoachState({
    admin,
    userId,
    deviceId,
    email,
    now: new Date(),
  });

  if (coachState.deviceLimited) {
    return {
      response: coachError({
        status: 403,
        code: COACH_ERROR_CODES.DEVICE_LIMIT,
        error: "Free account device limit reached.",
        usage: coachState.usage,
      }),
      coachState,
    };
  }

  if (!coachState.usage) {
    return {
      response: coachError({
        status: 401,
        code: COACH_ERROR_CODES.LOGIN_REQUIRED,
        error: "Sign in required.",
      }),
      coachState,
    };
  }

  if (coachState.usage.dailyRemaining <= 0) {
    return {
      response: coachError({
        status: 429,
        code: COACH_ERROR_CODES.DAILY_LIMIT_REACHED,
        error: "Daily AI coach limit reached.",
        usage: coachState.usage,
      }),
      coachState,
    };
  }

  if (coachState.usage.monthlyRemaining <= 0) {
    return {
      response: coachError({
        status: 429,
        code: COACH_ERROR_CODES.MONTHLY_LIMIT_REACHED,
        error: "Monthly AI coach limit reached.",
        usage: coachState.usage,
      }),
      coachState,
    };
  }

  return { response: null, coachState };
}

// ── Usage charging (charge-before-stream pattern) ────────────────────

export type UsageSummary = CoachUsageSummary | GuestUsageSummary;

export interface GuestChargeContext {
  guestDeviceId: string;
  countryCode: string | null;
}

export interface AuthChargeContext {
  userId: string;
  email: string | undefined;
  usageDay: string;
  usage: CoachUsageSummary;
}

export async function chargeGuestUsage(
  ctx: GuestChargeContext,
): Promise<{ error: Response | null; updatedUsage: GuestUsageSummary | null }> {
  const result = await tryIncrementGuestUsage(ctx.guestDeviceId, ctx.countryCode);
  if (!result.allowed) {
    const current = await getGuestUsage(ctx.guestDeviceId, ctx.countryCode).catch(() => null);
    return {
      error: coachError({
        status: 429,
        code:
          result.reason === "monthly_limit_reached"
            ? COACH_ERROR_CODES.MONTHLY_LIMIT_REACHED
            : COACH_ERROR_CODES.DAILY_LIMIT_REACHED,
        error:
          result.reason === "monthly_limit_reached"
            ? "Monthly AI coach limit reached."
            : "Daily AI coach limit reached.",
        usage: current,
      }),
      updatedUsage: null,
    };
  }
  return { error: null, updatedUsage: await getGuestUsage(ctx.guestDeviceId, ctx.countryCode) };
}

export async function chargeAuthUsage(
  ctx: AuthChargeContext,
): Promise<{ error: Response | null; updatedUsage: CoachUsageSummary | null }> {
  const admin = createServiceClient();
  const result = await tryIncrementCoachUsage({
    admin,
    userId: ctx.userId,
    day: ctx.usageDay,
    monthWindowStart: ctx.usage.monthWindowStart,
    monthWindowEnd: ctx.usage.monthWindowEnd,
    dailyLimit: ctx.usage.dailyLimit,
    monthlyLimit: ctx.usage.monthlyLimit,
  });

  if (!result.allowed) {
    const current = await getCoachState({
      admin,
      userId: ctx.userId,
      deviceId: null,
      email: ctx.email,
      now: new Date(),
    }).catch(() => null);
    return {
      error: coachError({
        status: 429,
        code:
          result.reason === "monthly_limit_reached"
            ? COACH_ERROR_CODES.MONTHLY_LIMIT_REACHED
            : COACH_ERROR_CODES.DAILY_LIMIT_REACHED,
        error:
          result.reason === "monthly_limit_reached"
            ? "Monthly AI coach limit reached."
            : "Daily AI coach limit reached.",
        usage: current?.usage ?? ctx.usage,
      }),
      updatedUsage: null,
    };
  }

  const postState = await getCoachState({
    admin,
    userId: ctx.userId,
    deviceId: null,
    email: ctx.email,
    now: new Date(),
  });
  if (!postState.usage) throw new Error("missing usage after increment");
  return { error: null, updatedUsage: postState.usage };
}

// ── Upstream error classification ─────────────────────────────────────

interface ClassifiedError {
  httpStatus: number;
  errorCode: string;
}

export function classifyUpstreamError(error: Error): ClassifiedError {
  if (error.name === "AbortError" || error.message?.includes("timeout")) {
    return { httpStatus: 504, errorCode: "timeout" };
  }
  if (error.message?.includes("429") || error.message?.includes("rate limit")) {
    return { httpStatus: 429, errorCode: "rate_limit" };
  }
  if (error.message?.includes("401") || error.message?.includes("auth")) {
    return { httpStatus: 500, errorCode: "auth_error" };
  }
  return { httpStatus: 502, errorCode: "upstream_error" };
}

export function classifySseError(error: Error): string {
  if (error.name === "AbortError" || error.message?.includes("timeout")) return "timeout";
  if (error.message?.includes("429") || error.message?.includes("rate limit")) return "rate_limit";
  if (error.message?.includes("401") || error.message?.includes("auth")) return "auth_error";
  return "upstream_error";
}

// ── Usage refund ─────────────────────────────────────────────────────

export async function refundUsage(
  isGuest: boolean,
  ctx: { guestDeviceId: string; countryCode: string | null; userId: string; usageDay: string },
): Promise<void> {
  if (isGuest) {
    await decrementGuestUsage(ctx.guestDeviceId, ctx.countryCode).catch(() => {});
  } else {
    await decrementCoachUsage({
      admin: createServiceClient(),
      userId: ctx.userId,
      day: ctx.usageDay,
    }).catch(() => {});
  }
}

// ── Model info ───────────────────────────────────────────────────────

export function getCoachModelInfo() {
  const env = getCoachEnv();
  return { model: env.COACH_MODEL, provider: env.COACH_API_URL };
}

/**
 * Single source of truth for the error codes the Coach API hands back to
 * the client. The wire format is the lowercase string literal — these
 * constants exist so server, analytics, and client all reference one place
 * and a typo turns into a TypeScript error instead of a silent miss.
 */
export const COACH_ERROR_CODES = {
  LOGIN_REQUIRED: "login_required",
  DEVICE_LIMIT: "device_limit",
  DAILY_LIMIT_REACHED: "daily_limit_reached",
  MONTHLY_LIMIT_REACHED: "monthly_limit_reached",
  COACH_UNAVAILABLE: "coach_unavailable",
  QUOTA_WRITE_FAILED: "quota_write_failed",
} as const;

export type CoachErrorCode = (typeof COACH_ERROR_CODES)[keyof typeof COACH_ERROR_CODES];

export const COACH_ERROR_CODE_LIST: readonly CoachErrorCode[] = Object.values(COACH_ERROR_CODES);

export function isCoachErrorCode(code: unknown): code is CoachErrorCode {
  return typeof code === "string" && (COACH_ERROR_CODE_LIST as readonly string[]).includes(code);
}

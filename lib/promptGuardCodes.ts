/**
 * Stable rejection codes for `guardUserMessage`, kept apart from
 * `lib/promptGuard.ts` so the client can localize a rejection without
 * pulling the detection patterns themselves into the browser bundle.
 */
export const GUARD_REJECTION_CODES = {
  MESSAGE_TOO_LONG: "message_too_long",
  UNSAFE_CONTENT: "unsafe_content",
} as const;

export type GuardRejectionCode = (typeof GUARD_REJECTION_CODES)[keyof typeof GUARD_REJECTION_CODES];

export const GUARD_REJECTION_CODE_LIST: readonly GuardRejectionCode[] =
  Object.values(GUARD_REJECTION_CODES);

export function isGuardRejectionCode(code: unknown): code is GuardRejectionCode {
  return (
    typeof code === "string" && (GUARD_REJECTION_CODE_LIST as readonly string[]).includes(code)
  );
}

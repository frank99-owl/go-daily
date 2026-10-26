/**
 * Coach analytics event helpers.
 *
 * Centralises PostHog event capture for coach requests so the route handler
 * stays focused on HTTP orchestration.
 */
import { captureServerEvent } from "@/lib/posthog/server";

interface CoachEventBase {
  locale: string;
  personaId: string;
  plan: string;
  model: string;
  provider: string;
}

export interface CoachCompletedEvent extends CoachEventBase {
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  usageAvailable: boolean;
}

export interface CoachFailedEvent extends CoachEventBase {
  durationMs: number;
  errorCode: string;
  httpStatus: number;
}

/**
 * Longest a coach stream stays open waiting on analytics. The reply and its
 * `done` event have already reached the student, so this only bounds how long
 * the connection lingers if PostHog is slow.
 */
export const ANALYTICS_FLUSH_BUDGET_MS = 2000;

function withinBudget(capture: Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ANALYTICS_FLUSH_BUDGET_MS);
  });
  return Promise.race([capture, budget]).finally(() => clearTimeout(timer));
}

/**
 * Both helpers return the capture so the stream can await it before closing.
 * Fired after `controller.close()`, the event raced the function being frozen
 * once the response ended: between 2026-09-26 and 2026-10-23 the quota table
 * and the client recorded 15 completed coach calls, PostHog's server event 13.
 */
export function captureCoachCompleted(
  distinctId: string,
  props: CoachCompletedEvent,
): Promise<void> {
  return withinBudget(
    captureServerEvent({
      distinctId,
      event: "coach_request_completed",
      properties: props,
    }).catch((e: unknown) => console.warn("[posthog] coach_completed event failed", e)),
  );
}

export function captureCoachFailed(distinctId: string, props: CoachFailedEvent): Promise<void> {
  return withinBudget(
    captureServerEvent({
      distinctId,
      event: "coach_request_failed",
      properties: props,
    }).catch((e: unknown) => console.warn("[posthog] coach_failed event failed", e)),
  );
}

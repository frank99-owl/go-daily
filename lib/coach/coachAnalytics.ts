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

export function captureCoachCompleted(distinctId: string, props: CoachCompletedEvent): void {
  captureServerEvent({
    distinctId,
    event: "coach_request_completed",
    properties: props,
  }).catch((e: unknown) => console.warn("[posthog] coach_completed event failed", e));
}

export function captureCoachFailed(distinctId: string, props: CoachFailedEvent): void {
  captureServerEvent({
    distinctId,
    event: "coach_request_failed",
    properties: props,
  }).catch((e: unknown) => console.warn("[posthog] coach_failed event failed", e));
}

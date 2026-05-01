import type { CoachErrorCode } from "@/lib/coach/coachErrorCodes";

export type ViewerPlanForAnalytics = "guest" | "free" | "pro";

export type EventMap = {
  puzzle_started: { puzzleId: string; source: "today" | "library" | "random" | "retry" };
  puzzle_solved: { puzzleId: string; correct: boolean; durationMs: number };
  puzzle_hint_requested: { puzzleId: string };
  coach_message_sent: { puzzleId: string; messageIndex: number };
  coach_message_received: { puzzleId: string; messageIndex: number; durationMs: number };
  solution_viewed: { puzzleId: string };
  language_changed: { from: string; to: string };
  share_card_generated: { puzzleId: string };
  share_card_downloaded: { puzzleId: string };
  random_puzzle_picked: { puzzleId: string };
  review_page_viewed: { wrongCount: number };
  stats_page_viewed: { totalAttempts: number };
  paywall_view: { viewerPlan: ViewerPlanForAnalytics; source: "pricing" };
  checkout_click: { interval: "monthly" | "yearly"; source: "pricing" | "upsell" };
  portal_click: { source: "pricing" | "account" };
  upsell_open: { source: "coach_daily" | "coach_monthly" | "coach_device" | "coach_anon" };
  coach_limit_hit: {
    code: CoachErrorCode;
  };
  coach_request_completed: {
    puzzleId: string;
    locale: string;
    personaId: string;
    plan: string;
    model: string;
    provider: string;
    durationMs: number;
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
    usageAvailable: boolean;
  };
  coach_request_failed: {
    puzzleId: string;
    locale: string;
    personaId: string;
    plan: string;
    model: string | null;
    provider: string | null;
    durationMs: number;
    errorCode: string;
    httpStatus: number;
  };
  trial_started: SubscriptionAnalyticsProps & {
    trialEnd: string | null;
  };
  trial_converted: SubscriptionAnalyticsProps & {
    revenueUsd: number | null;
    currency: string | null;
  };
  trial_abandoned: SubscriptionAnalyticsProps & {
    reason: "payment_failed" | "subscription_deleted";
  };
  subscription_activated: SubscriptionAnalyticsProps & {
    revenueUsd: number | null;
    currency: string | null;
  };
  subscription_canceled: SubscriptionAnalyticsProps & {
    cancelAtPeriodEnd: boolean;
  };
  subscription_past_due: SubscriptionAnalyticsProps;
};

type SubscriptionAnalyticsProps = {
  plan: string;
  interval: "monthly" | "yearly" | "unknown";
  subscriptionId: string;
  stripeCustomerId: string | null;
};

import type { CoachErrorCode } from "@/lib/coach/coachErrorCodes";
import type { OnboardingLevel } from "@/lib/puzzle/onboardingLevels";
import type { Locale, PuzzleTag, CoachContentTier } from "@/types";

export type ViewerPlanForAnalytics = "guest" | "free" | "pro";
export type AnalyticsSource =
  | "today"
  | "library"
  | "random"
  | "retry"
  | "onboarding"
  | "result"
  | "onboarding_result"
  | "review"
  | "stats"
  | "pricing"
  | "upsell"
  | "account";
export type AnalyticsResult = "correct" | "wrong";
export type RecommendationType = "same-level" | "same-topic" | "step-up" | "review" | "srs";
export type CoachQuotaAnalyticsState = "available" | "near-limit" | "unavailable" | "unknown";

export const ANALYTICS_EVENT_NAMES = [
  "onboarding_started",
  "first_move_played",
  "first_puzzle_completed",
  "result_viewed",
  "next_recommendation_clicked",
  "review_page_viewed",
  "review_item_opened",
  "stats_page_viewed",
  "review_recommendation_viewed",
  "coach_opened",
  "coach_prompt_clicked",
  "coach_response_completed",
  "coach_error_shown",
  "coach_quota_state_seen",
  "pricing_viewed",
  "checkout_click",
  "upsell_viewed",
  "upsell_cta_clicked",
] as const satisfies readonly (keyof EventMap)[];

export type EventMap = {
  onboarding_started: { locale: Locale; level: OnboardingLevel; source: "onboarding" };
  first_move_played: { locale: Locale; level: OnboardingLevel; source: "onboarding" };
  first_puzzle_completed: {
    locale: Locale;
    level: OnboardingLevel;
    result: AnalyticsResult;
    tag: PuzzleTag;
    difficulty: number;
    contentTier: CoachContentTier;
  };
  result_viewed: PuzzleContextProps & {
    locale: Locale;
    source: "result" | "onboarding_result";
    result: AnalyticsResult;
  };
  next_recommendation_clicked: {
    locale: Locale;
    source: "today" | "result" | "onboarding_result";
    recommendationType: RecommendationType;
    level?: OnboardingLevel;
    tag?: PuzzleTag;
  };
  result_signup_prompt_view: { locale: Locale; source: "result" | "onboarding_result" };
  review_saved_prompt_clicked: { locale: Locale; source: "result" | "onboarding_result" };
  puzzle_started: {
    locale: Locale;
    source: "today" | "library" | "random" | "retry" | "onboarding";
    tag: PuzzleTag;
    difficulty: number;
    contentTier: CoachContentTier;
  };
  puzzle_solved: {
    locale: Locale;
    result: AnalyticsResult;
    durationMs: number;
    source?: "today" | "library" | "random" | "retry" | "onboarding";
    tag: PuzzleTag;
    difficulty: number;
    contentTier: CoachContentTier;
  };
  puzzle_hint_requested: {
    locale: Locale;
    source?: "today" | "library" | "random" | "retry" | "onboarding";
    hintIndex?: number;
  };
  coach_opened: CoachClientProps;
  coach_prompt_clicked: CoachClientProps & {
    promptKey: string;
  };
  coach_response_completed: CoachClientProps & {
    result: "completed";
  };
  coach_error_shown: CoachClientProps & {
    result: CoachErrorCode | "generic" | "stream_error" | "empty_response";
  };
  coach_quota_state_seen: CoachClientProps & {
    result: CoachQuotaAnalyticsState;
  };
  solution_viewed: PuzzleContextProps & { locale: Locale; source: "result" | "onboarding_result" };
  language_changed: { from: string; to: string };
  share_card_generated: PuzzleContextProps & { locale: Locale };
  share_card_downloaded: PuzzleContextProps & { locale: Locale };
  review_page_viewed: {
    locale: Locale;
    source: "review";
    plan: ViewerPlanForAnalytics;
    result: "empty" | "has_items";
  };
  review_item_opened: {
    locale: Locale;
    source: "review";
    plan: ViewerPlanForAnalytics;
    tag: PuzzleTag;
    difficulty: number;
  };
  stats_page_viewed: {
    locale: Locale;
    source: "stats";
    result: "empty" | "has_attempts";
  };
  review_recommendation_viewed: {
    locale: Locale;
    source: "review" | "stats";
    recommendationType: RecommendationType;
    tag?: PuzzleTag;
  };
  pricing_viewed: {
    locale: Locale;
    plan: ViewerPlanForAnalytics;
    source: "pricing";
  };
  checkout_click: {
    locale: Locale;
    interval: "monthly" | "yearly";
    plan: "free";
    source: "pricing" | "upsell";
  };
  portal_click: {
    locale: Locale;
    source: "pricing" | "account";
    plan: "pro";
  };
  upsell_viewed: {
    locale: Locale;
    source: "coach_daily" | "coach_monthly" | "coach_device" | "coach_anon";
  };
  upsell_cta_clicked: {
    locale: Locale;
    source: "coach_daily" | "coach_monthly" | "coach_device" | "coach_anon";
  };
  coach_request_completed: {
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
};

type PuzzleContextProps = {
  tag: PuzzleTag;
  difficulty: number;
  contentTier: CoachContentTier;
};

type CoachClientProps = {
  locale: Locale;
  source: "result" | "onboarding_result" | "composer";
  contentTier: CoachContentTier;
};

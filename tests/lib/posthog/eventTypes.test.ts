import { describe, expect, it } from "vitest";

import { ANALYTICS_EVENT_NAMES, type EventMap } from "@/lib/posthog/eventTypes";

const expectedFunnelEvents = [
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

describe("PostHog event taxonomy", () => {
  it("registers the P2-B funnel event names in the typed event map", () => {
    expect(ANALYTICS_EVENT_NAMES).toEqual(expectedFunnelEvents);
  });

  it("keeps deprecated funnel event names out of the taxonomy", () => {
    expect(ANALYTICS_EVENT_NAMES).not.toContain("paywall_view");
    expect(ANALYTICS_EVENT_NAMES).not.toContain("upsell_open");
    expect(ANALYTICS_EVENT_NAMES).not.toContain("first_puzzle_submitted");
    expect(ANALYTICS_EVENT_NAMES).not.toContain("random_puzzle_picked");
    expect(ANALYTICS_EVENT_NAMES).not.toContain("coach_limit_hit");
  });
});

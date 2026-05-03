import type { User } from "@supabase/supabase-js";

export type ViewerPlan = "guest" | "free" | "pro";
export type CloudSyncMode = "none" | "single-device" | "multi-device";

export interface Entitlements {
  plan: ViewerPlan;
  cloudSync: CloudSyncMode;
  adsEnabled: boolean;
  coach: {
    available: boolean;
    requiresLogin: boolean;
    dailyLimit: number | null;
    monthlyLimit: number | null;
  };
  deviceLimit: number | null;
}

/**
 * Per-plan entitlement matrix. Adding a plan (trial / lifetime / team) is
 * a matter of extending `ViewerPlan` and dropping a row in this table —
 * `getEntitlements` itself does not need to change.
 *
 * The `plan` field on the returned Entitlements is filled in from the
 * lookup key, so it can never disagree with the row it's stored under.
 */
export const PLAN_ENTITLEMENTS: Record<ViewerPlan, Omit<Entitlements, "plan">> = {
  guest: {
    cloudSync: "none",
    adsEnabled: true,
    coach: {
      available: true,
      requiresLogin: false,
      dailyLimit: 3,
      monthlyLimit: 5,
    },
    deviceLimit: null,
  },
  free: {
    cloudSync: "single-device",
    adsEnabled: true,
    coach: {
      available: true,
      requiresLogin: true,
      dailyLimit: 10,
      monthlyLimit: 30,
    },
    deviceLimit: 1,
  },
  pro: {
    cloudSync: "multi-device",
    adsEnabled: false,
    coach: {
      available: true,
      requiresLogin: true,
      dailyLimit: 51,
      monthlyLimit: 1001,
    },
    deviceLimit: 3,
  },
};

export function isProSubscriptionStatus(status: string | null | undefined): boolean {
  return status === "active" || status === "trialing" || status === "past_due";
}

export function getViewerPlan({
  user,
  subscriptionStatus,
}: {
  user: Pick<User, "id"> | null;
  subscriptionStatus: string | null | undefined;
}): ViewerPlan {
  if (!user) return "guest";
  return isProSubscriptionStatus(subscriptionStatus) ? "pro" : "free";
}

export function getEntitlements({
  user,
  subscriptionStatus,
}: {
  user: Pick<User, "id"> | null;
  subscriptionStatus: string | null | undefined;
}): Entitlements {
  const plan = getViewerPlan({ user, subscriptionStatus });
  return { plan, ...PLAN_ENTITLEMENTS[plan] };
}

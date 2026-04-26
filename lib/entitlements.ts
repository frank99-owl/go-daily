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
const PLAN_ENTITLEMENTS: Record<ViewerPlan, Omit<Entitlements, "plan">> = {
  guest: {
    cloudSync: "none",
    adsEnabled: true,
    coach: {
      available: false,
      requiresLogin: true,
      dailyLimit: null,
      monthlyLimit: null,
    },
    deviceLimit: null,
  },
  free: {
    cloudSync: "single-device",
    adsEnabled: true,
    coach: {
      available: true,
      requiresLogin: true,
      dailyLimit: 3,
      monthlyLimit: 20,
    },
    deviceLimit: 1,
  },
  pro: {
    cloudSync: "multi-device",
    adsEnabled: false,
    coach: {
      available: true,
      requiresLogin: true,
      dailyLimit: 10,
      monthlyLimit: 50,
    },
    deviceLimit: null,
  },
};

export function isProSubscriptionStatus(status: string | null | undefined): boolean {
  return status === "active" || status === "trialing";
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

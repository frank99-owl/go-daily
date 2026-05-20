import type { User } from "@supabase/supabase-js";

export type ViewerPlan = "guest" | "free" | "pro";
export type CloudSyncMode = "none" | "single-device" | "multi-device";
export const PAST_DUE_PRO_GRACE_DAYS = 7;

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

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isPastDueWithinGrace({
  currentPeriodEnd,
  now = new Date(),
}: {
  currentPeriodEnd: string | null | undefined;
  now?: Date;
}): boolean {
  const periodEndMs = parseTime(currentPeriodEnd);
  if (periodEndMs === null) return false;
  const graceMs = PAST_DUE_PRO_GRACE_DAYS * 24 * 60 * 60 * 1000;
  return now.getTime() <= periodEndMs + graceMs;
}

export function isProSubscriptionStatus(
  status: string | null | undefined,
  options: { currentPeriodEnd?: string | null; now?: Date } = {},
): boolean {
  if (status === "active" || status === "trialing") return true;
  if (status === "past_due") {
    return isPastDueWithinGrace({
      currentPeriodEnd: options.currentPeriodEnd,
      now: options.now,
    });
  }
  return false;
}

export function getViewerPlan({
  user,
  subscriptionStatus,
  subscriptionCurrentPeriodEnd,
  now,
}: {
  user: Pick<User, "id"> | null;
  subscriptionStatus: string | null | undefined;
  subscriptionCurrentPeriodEnd?: string | null;
  now?: Date;
}): ViewerPlan {
  if (!user) return "guest";
  return isProSubscriptionStatus(subscriptionStatus, {
    currentPeriodEnd: subscriptionCurrentPeriodEnd,
    now,
  })
    ? "pro"
    : "free";
}

export function getEntitlements({
  user,
  subscriptionStatus,
  subscriptionCurrentPeriodEnd,
  now,
}: {
  user: Pick<User, "id"> | null;
  subscriptionStatus: string | null | undefined;
  subscriptionCurrentPeriodEnd?: string | null;
  now?: Date;
}): Entitlements {
  const plan = getViewerPlan({
    user,
    subscriptionStatus,
    subscriptionCurrentPeriodEnd,
    now,
  });
  return { plan, ...PLAN_ENTITLEMENTS[plan] };
}

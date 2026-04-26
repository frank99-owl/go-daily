import {
  formatDateInTimeZone,
  getAnchorDayFromFirstPaidAt,
  getBillingAnchoredMonthWindow,
  getNaturalMonthWindow,
} from "@/lib/coach/coachQuota";
import { evaluateDeviceAccess, type DeviceSeat } from "@/lib/deviceRegistry";
import { getEntitlements } from "@/lib/entitlements";
import { createServiceClient } from "@/lib/supabase/service";

if (typeof window !== "undefined") {
  throw new Error("lib/coachState.ts must only be imported on the server.");
}

export const COACH_DEVICE_ID_HEADER = "x-go-daily-device-id";

type AdminClient = ReturnType<typeof createServiceClient>;

type ProfileRow = {
  timezone: string | null;
};

type SubscriptionRow = {
  status: string | null;
  first_paid_at: string | null;
  coach_anchor_day: number | null;
};

type CoachUsageRow = {
  day: string;
  count: number;
};

export interface CoachUsageSummary {
  plan: "free" | "pro";
  dailyLimit: number;
  monthlyLimit: number;
  dailyUsed: number;
  monthlyUsed: number;
  dailyRemaining: number;
  monthlyRemaining: number;
  timeZone: string;
  monthWindowKind: "natural" | "billing-anchored";
  monthWindowStart: string;
  monthWindowEnd: string;
  billingAnchorDay: number | null;
}

export interface CoachState {
  usage: CoachUsageSummary | null;
  deviceLimited: boolean;
}

function sanitizeTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return "UTC";
  }
}

async function fetchUsageRows({
  admin,
  userId,
  startDay,
  endDay,
}: {
  admin: AdminClient;
  userId: string;
  startDay: string;
  endDay: string;
}): Promise<CoachUsageRow[]> {
  const { data, error } = await admin
    .from("coach_usage")
    .select("day, count")
    .eq("user_id", userId)
    .gte("day", startDay)
    .lte("day", endDay);

  if (error) {
    throw new Error(`failed to read coach usage: ${error.message}`);
  }

  return (data ?? []) as CoachUsageRow[];
}

function buildUsageSummary({
  plan,
  dailyLimit,
  monthlyLimit,
  dailyUsed,
  monthlyUsed,
  timeZone,
  monthWindowKind,
  monthWindowStart,
  monthWindowEnd,
  billingAnchorDay,
}: {
  plan: "free" | "pro";
  dailyLimit: number;
  monthlyLimit: number;
  dailyUsed: number;
  monthlyUsed: number;
  timeZone: string;
  monthWindowKind: "natural" | "billing-anchored";
  monthWindowStart: string;
  monthWindowEnd: string;
  billingAnchorDay: number | null;
}): CoachUsageSummary {
  return {
    plan,
    dailyLimit,
    monthlyLimit,
    dailyUsed,
    monthlyUsed,
    dailyRemaining: Math.max(dailyLimit - dailyUsed, 0),
    monthlyRemaining: Math.max(monthlyLimit - monthlyUsed, 0),
    timeZone,
    monthWindowKind,
    monthWindowStart,
    monthWindowEnd,
    billingAnchorDay,
  };
}

export async function getCoachState({
  admin,
  userId,
  deviceId,
  now = new Date(),
}: {
  admin: AdminClient;
  userId: string;
  deviceId?: string | null;
  now?: Date;
}): Promise<CoachState> {
  const [{ data: profileData, error: profileError }, { data: subscriptionData, error: subError }] =
    await Promise.all([
      admin.from("profiles").select("timezone").eq("user_id", userId).maybeSingle(),
      admin
        .from("subscriptions")
        .select("status, first_paid_at, coach_anchor_day")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

  if (profileError) {
    throw new Error(`failed to read profile: ${profileError.message}`);
  }
  if (subError) {
    throw new Error(`failed to read subscription: ${subError.message}`);
  }

  const profile = profileData as ProfileRow | null;
  const subscription = subscriptionData as SubscriptionRow | null;
  const timeZone = sanitizeTimeZone(profile?.timezone);
  const entitlements = getEntitlements({
    user: { id: userId },
    subscriptionStatus: subscription?.status ?? null,
  });

  let deviceLimited = false;
  if (entitlements.deviceLimit === 1 && deviceId) {
    const { data: devicesData, error: devicesError } = await admin
      .from("user_devices")
      .select("device_id, last_seen")
      .eq("user_id", userId);
    if (devicesError) {
      throw new Error(`failed to read devices: ${devicesError.message}`);
    }
    const access = evaluateDeviceAccess({
      existingDevices: (devicesData ?? []) as DeviceSeat[],
      currentDeviceId: deviceId,
      isPaid: false,
    });
    deviceLimited = access === "block-free-device-limit";
  }

  if (!entitlements.coach.available) {
    return { usage: null, deviceLimited };
  }

  const dayKey = formatDateInTimeZone(now, timeZone);
  const dailyLimit = entitlements.coach.dailyLimit ?? 0;
  const monthlyLimit = entitlements.coach.monthlyLimit ?? 0;

  if (entitlements.plan === "pro") {
    const derivedAnchorDay =
      getAnchorDayFromFirstPaidAt(subscription?.first_paid_at ?? null, timeZone) ??
      subscription?.coach_anchor_day ??
      null;

    if (derivedAnchorDay) {
      const window = getBillingAnchoredMonthWindow({
        now,
        timeZone,
        anchorDay: derivedAnchorDay,
      });
      const usageRows = await fetchUsageRows({
        admin,
        userId,
        startDay: window.startDay,
        endDay: window.endDay,
      });
      const monthlyUsed = usageRows.reduce((sum, row) => sum + Number(row.count ?? 0), 0);
      const dailyUsed = usageRows.find((row) => row.day === dayKey)?.count ?? 0;
      return {
        usage: buildUsageSummary({
          plan: "pro",
          dailyLimit,
          monthlyLimit,
          dailyUsed,
          monthlyUsed,
          timeZone,
          monthWindowKind: "billing-anchored",
          monthWindowStart: window.startDay,
          monthWindowEnd: window.endDay,
          billingAnchorDay: derivedAnchorDay,
        }),
        deviceLimited,
      };
    }
  }

  const naturalWindow = getNaturalMonthWindow({ now, timeZone });
  const usageRows = await fetchUsageRows({
    admin,
    userId,
    startDay: naturalWindow.startDay,
    endDay: naturalWindow.endDay,
  });
  const monthlyUsed = usageRows.reduce((sum, row) => sum + Number(row.count ?? 0), 0);
  const dailyUsed = usageRows.find((row) => row.day === dayKey)?.count ?? 0;

  return {
    usage: buildUsageSummary({
      plan: entitlements.plan === "pro" ? "pro" : "free",
      dailyLimit,
      monthlyLimit,
      dailyUsed,
      monthlyUsed,
      timeZone,
      monthWindowKind: "natural",
      monthWindowStart: naturalWindow.startDay,
      monthWindowEnd: naturalWindow.endDay,
      billingAnchorDay: null,
    }),
    deviceLimited,
  };
}

export async function incrementCoachUsage({
  admin,
  userId,
  day,
}: {
  admin: AdminClient;
  userId: string;
  day: string;
}): Promise<number> {
  const { data: existing, error: existingError } = await admin
    .from("coach_usage")
    .select("count")
    .eq("user_id", userId)
    .eq("day", day)
    .maybeSingle();

  if (existingError) {
    throw new Error(`failed to read daily coach usage: ${existingError.message}`);
  }

  const nextCount = Number(existing?.count ?? 0) + 1;
  const { error } = await admin.from("coach_usage").upsert(
    {
      user_id: userId,
      day,
      count: nextCount,
    },
    { onConflict: "user_id,day" },
  );

  if (error) {
    throw new Error(`failed to write coach usage: ${error.message}`);
  }

  return nextCount;
}

/**
 * guestCoachUsage — tracks AI Coach usage for unauthenticated (Guest) users
 * via a device ID stored in localStorage + IP-based rate limiting.
 *
 * All reads/writes use the service-role client so no RLS policies are needed.
 */

import { createServiceClient } from "@/lib/supabase/service";

export interface GuestUsageSummary {
  dailyLimit: number;
  monthlyLimit: number;
  dailyUsed: number;
  monthlyUsed: number;
  dailyRemaining: number;
  monthlyRemaining: number;
}

const GUEST_DAILY_LIMIT = 3;
const GUEST_MONTHLY_LIMIT = 5;
const GUEST_IP_DAILY_LIMIT = 20;

// In-memory IP rate counter — resets on Vercel redeploy. That's acceptable:
// it only gates abuse, not billing.
const ipCounters = new Map<string, { date: string; count: number }>();

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function checkIpLimit(ip: string): { allowed: boolean; remaining: number } {
  const today = todayKey();
  const entry = ipCounters.get(ip);
  if (!entry || entry.date !== today) {
    ipCounters.set(ip, { date: today, count: 0 });
    return { allowed: true, remaining: GUEST_IP_DAILY_LIMIT };
  }
  const remaining = GUEST_IP_DAILY_LIMIT - entry.count;
  return { allowed: remaining > 0, remaining: Math.max(remaining, 0) };
}

export function incrementIpCounter(ip: string): void {
  const today = todayKey();
  const entry = ipCounters.get(ip);
  if (!entry || entry.date !== today) {
    ipCounters.set(ip, { date: today, count: 1 });
  } else {
    entry.count += 1;
  }
}

export async function getGuestUsage(deviceId: string): Promise<GuestUsageSummary> {
  const admin = createServiceClient();
  const today = todayKey();
  // Month start: first day of current UTC month
  const monthStart = today.slice(0, 7) + "-01";

  const { data, error } = await admin
    .from("guest_coach_usage")
    .select("day, count")
    .eq("device_id", deviceId)
    .gte("day", monthStart)
    .lte("day", today);

  if (error) {
    throw new Error(`failed to read guest coach usage: ${error.message}`);
  }

  const rows = (data ?? []) as { day: string; count: number }[];
  const monthlyUsed = rows.reduce((sum, row) => sum + Number(row.count ?? 0), 0);
  const dailyUsed = rows.find((row) => row.day === today)?.count ?? 0;

  return {
    dailyLimit: GUEST_DAILY_LIMIT,
    monthlyLimit: GUEST_MONTHLY_LIMIT,
    dailyUsed,
    monthlyUsed,
    dailyRemaining: Math.max(GUEST_DAILY_LIMIT - dailyUsed, 0),
    monthlyRemaining: Math.max(GUEST_MONTHLY_LIMIT - monthlyUsed, 0),
  };
}

export async function incrementGuestUsage(deviceId: string): Promise<number> {
  const admin = createServiceClient();
  const today = todayKey();

  const { data: existing, error: readError } = await admin
    .from("guest_coach_usage")
    .select("count")
    .eq("device_id", deviceId)
    .eq("day", today)
    .maybeSingle();

  if (readError) {
    throw new Error(`failed to read guest usage: ${readError.message}`);
  }

  const nextCount = Number(existing?.count ?? 0) + 1;
  const { error: writeError } = await admin
    .from("guest_coach_usage")
    .upsert({ device_id: deviceId, day: today, count: nextCount }, { onConflict: "device_id,day" });

  if (writeError) {
    throw new Error(`failed to write guest usage: ${writeError.message}`);
  }

  return nextCount;
}

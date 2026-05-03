/**
 * guestCoachUsage — tracks AI Coach usage for unauthenticated (Guest) users
 * via a device ID stored in localStorage + IP-based rate limiting.
 *
 * All reads/writes use the service-role client so no RLS policies are needed.
 */

import { Redis } from "@upstash/redis";

import { createServiceClient } from "@/lib/supabase/service";

import { formatDateInTimeZone } from "./coachQuota";

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

const countryToTimezone: Record<string, string> = {
  CN: "Asia/Shanghai",
  HK: "Asia/Hong_Kong",
  TW: "Asia/Taipei",
  JP: "Asia/Tokyo",
  KR: "Asia/Seoul",
  SG: "Asia/Singapore",
  IN: "Asia/Kolkata",
  AU: "Australia/Sydney",
  NZ: "Pacific/Auckland",
  UK: "Europe/London",
  GB: "Europe/London",
  FR: "Europe/Paris",
  DE: "Europe/Berlin",
  IT: "Europe/Rome",
  ES: "Europe/Madrid",
  US: "America/New_York",
  CA: "America/Toronto",
  BR: "America/Sao_Paulo",
  MX: "America/Mexico_City",
};

let redisClient: Redis | null | undefined = undefined;
function getRedis() {
  if (redisClient !== undefined) return redisClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) redisClient = new Redis({ url, token });
  else redisClient = null;
  return redisClient;
}

// In-memory IP rate counter fallback
const ipCounters = new Map<string, { date: string; count: number }>();
/** Hard cap to prevent unbounded memory growth on long-lived serverless instances. */
const MAX_IP_ENTRIES = 10_000;

// Uses IP-based country timezone if available, otherwise falls back to UTC.
function todayKey(countryCode?: string | null): string {
  if (countryCode) {
    const tz = countryToTimezone[countryCode.toUpperCase()];
    if (tz) {
      return formatDateInTimeZone(new Date(), tz);
    }
  }
  return new Date().toISOString().slice(0, 10);
}

export async function checkIpLimit(
  ip: string,
  countryCode?: string | null,
): Promise<{ allowed: boolean; remaining: number }> {
  const today = todayKey(countryCode);
  const redis = getRedis();

  if (redis) {
    const count = (await redis.get<number>(`guest_ip:${ip}:${today}`)) || 0;
    const remaining = GUEST_IP_DAILY_LIMIT - count;
    return { allowed: remaining > 0, remaining: Math.max(remaining, 0) };
  }

  // Evict stale entries from previous days first; if still over cap,
  // drop the oldest entries (Map iteration order is insertion order).
  if (ipCounters.size > 0) {
    for (const [key, val] of ipCounters) {
      if (val.date !== today) ipCounters.delete(key);
    }
  }
  if (ipCounters.size >= MAX_IP_ENTRIES) {
    const oldest = ipCounters.keys().next().value;
    if (oldest) ipCounters.delete(oldest);
  }

  const entry = ipCounters.get(ip);
  if (!entry || entry.date !== today) {
    ipCounters.set(ip, { date: today, count: 0 });
    return { allowed: true, remaining: GUEST_IP_DAILY_LIMIT };
  }
  const remaining = GUEST_IP_DAILY_LIMIT - entry.count;
  return { allowed: remaining > 0, remaining: Math.max(remaining, 0) };
}

export async function incrementIpCounter(ip: string, countryCode?: string | null): Promise<void> {
  const today = todayKey(countryCode);
  const redis = getRedis();

  if (redis) {
    const key = `guest_ip:${ip}:${today}`;
    const p = redis.pipeline();
    p.incr(key);
    p.expire(key, 60 * 60 * 48); // 48 hours
    await p.exec();
    return;
  }

  const entry = ipCounters.get(ip);
  if (!entry || entry.date !== today) {
    ipCounters.set(ip, { date: today, count: 1 });
  } else {
    entry.count += 1;
  }
}

export async function getGuestUsage(
  deviceId: string,
  countryCode?: string | null,
): Promise<GuestUsageSummary> {
  const admin = createServiceClient();
  const today = todayKey(countryCode);
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

export async function incrementGuestUsage(
  deviceId: string,
  countryCode?: string | null,
): Promise<number> {
  const admin = createServiceClient();
  const today = todayKey(countryCode);

  const { data, error } = await admin.rpc("increment_guest_coach_usage", {
    p_device_id: deviceId,
    p_day: today,
  });

  if (error) {
    throw new Error(`failed to increment guest usage: ${error.message}`);
  }

  return data as number;
}

export async function decrementGuestUsage(
  deviceId: string,
  countryCode?: string | null,
): Promise<void> {
  const admin = createServiceClient();
  const today = todayKey(countryCode);

  const { data } = await admin
    .from("guest_coach_usage")
    .select("count")
    .eq("device_id", deviceId)
    .eq("day", today)
    .maybeSingle();

  if (data && (data as { count: number }).count > 0) {
    await admin
      .from("guest_coach_usage")
      .update({ count: (data as { count: number }).count - 1 })
      .eq("device_id", deviceId)
      .eq("day", today);
  }
}

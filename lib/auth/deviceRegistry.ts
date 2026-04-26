/**
 * deviceRegistry — translates "this user logged in on this device" into
 * rows in `public.user_devices` and enforces the Free-plan single-device
 * paywall trigger.
 *
 * Policy:
 *   Free users       — exactly one device. Attempting to use the product
 *                      from a second device is blocked in the UI with a
 *                      paywall CTA. Their first device is whatever showed
 *                      up in user_devices first.
 *   Paid/Trial users — unlimited devices. We still touch last_seen so
 *                      Settings → Devices is accurate.
 *
 * The decision is split into a pure evaluator (trivially unit-testable)
 * and an async IO layer that talks to Supabase.
 */
import { createClient } from "@/lib/supabase/client";

import { describeUserAgent, getOrCreateDeviceId } from "./deviceId";

export type DeviceAccess = "allow-existing" | "allow-new" | "block-free-device-limit";

/**
 * Free-plan cap: exactly 1 active device. A "device" is a row in
 * user_devices. We count by distinct device_id so a re-seen current device
 * does not count as an extra seat.
 */
export const FREE_TIER_DEVICE_LIMIT = 1;

export interface DeviceSeat {
  device_id: string;
  last_seen: string | null;
}

export function evaluateDeviceAccess({
  existingDevices,
  currentDeviceId,
  isPaid,
}: {
  existingDevices: DeviceSeat[];
  currentDeviceId: string;
  isPaid: boolean;
}): DeviceAccess {
  const known = existingDevices.some((d) => d.device_id === currentDeviceId);
  if (known) return "allow-existing";
  if (isPaid) return "allow-new";
  if (existingDevices.length >= FREE_TIER_DEVICE_LIMIT) {
    return "block-free-device-limit";
  }
  return "allow-new";
}

export function isPaidSubscription(status: string | null | undefined): boolean {
  return status === "active" || status === "trialing";
}

export interface RegisterDeviceResult {
  access: DeviceAccess;
  deviceId: string;
  existingDeviceCount: number;
}

/**
 * Best-effort write of user_devices + subscription-aware access check. Safe
 * to call on every successful login; idempotent for already-known devices.
 */
export async function registerDevice(userId: string): Promise<RegisterDeviceResult> {
  const supabase = createClient();
  const deviceId = getOrCreateDeviceId();
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";

  const [{ data: devicesData }, { data: subData }] = await Promise.all([
    supabase.from("user_devices").select("device_id, last_seen").eq("user_id", userId),
    supabase.from("subscriptions").select("status").eq("user_id", userId).maybeSingle(),
  ]);

  const existingDevices: DeviceSeat[] = devicesData ?? [];
  const access = evaluateDeviceAccess({
    existingDevices,
    currentDeviceId: deviceId,
    isPaid: isPaidSubscription(subData?.status),
  });

  if (access === "block-free-device-limit") {
    // Do NOT insert — the UI will prompt the user to upgrade or release a
    // seat. We still return the seat count so the paywall screen can list
    // the existing devices with their labels.
    return {
      access,
      deviceId,
      existingDeviceCount: existingDevices.length,
    };
  }

  if (access === "allow-new") {
    await supabase.from("user_devices").insert({
      user_id: userId,
      device_id: deviceId,
      user_agent: userAgent,
    });
  } else {
    // allow-existing: touch last_seen so Settings can show recency.
    await supabase
      .from("user_devices")
      .update({
        last_seen: new Date().toISOString(),
        user_agent: userAgent,
      })
      .eq("user_id", userId)
      .eq("device_id", deviceId);
  }

  return {
    access,
    deviceId,
    existingDeviceCount:
      access === "allow-new" ? existingDevices.length + 1 : existingDevices.length,
  };
}

/** Display helper for the paywall / Settings → Devices screen. */
export function formatDeviceLabel(seat: { user_agent?: string | null }): string {
  return describeUserAgent(seat.user_agent ?? "");
}

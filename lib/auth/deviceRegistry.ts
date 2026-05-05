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
 *   Pro users        — up to the Pro device limit. We still touch last_seen
 *                      so Settings → Devices is accurate.
 *
 * The decision is split into a pure evaluator (trivially unit-testable)
 * and an async IO layer that talks to Supabase.
 */
import { isProSubscriptionStatus, PLAN_ENTITLEMENTS, type ViewerPlan } from "@/lib/entitlements";

import { describeUserAgent, getOrCreateDeviceId } from "./deviceId";

export type DeviceAccess = "allow-existing" | "allow-new" | "block-free-device-limit";
export const DEVICE_ID_MAX_LENGTH = 128;

/**
 * Device caps per plan. Entitlements are the source of truth; a "device" is a
 * row in user_devices. We count by distinct device_id so a re-seen current
 * device does not count as an extra seat.
 */
function requiredDeviceLimit(plan: "free" | "pro"): number {
  const limit = PLAN_ENTITLEMENTS[plan].deviceLimit;
  if (limit === null) {
    throw new Error(`${plan} must define a device limit.`);
  }
  return limit;
}

export const FREE_TIER_DEVICE_LIMIT = requiredDeviceLimit("free");
export const PRO_TIER_DEVICE_LIMIT = requiredDeviceLimit("pro");

export interface DeviceSeat {
  device_id: string;
  last_seen: string | null;
}

export function evaluateDeviceAccess({
  existingDevices,
  currentDeviceId,
  deviceLimit,
}: {
  existingDevices: DeviceSeat[];
  currentDeviceId: string;
  deviceLimit: number | null;
}): DeviceAccess {
  const known = existingDevices.some((d) => d.device_id === currentDeviceId);
  if (known) return "allow-existing";
  if (deviceLimit === null) return "allow-new";
  if (existingDevices.length >= deviceLimit) {
    return "block-free-device-limit";
  }
  return "allow-new";
}

export function isPaidSubscription(status: string | null | undefined): boolean {
  return isProSubscriptionStatus(status);
}

export function getDeviceLimitForPlan(plan: ViewerPlan): number | null {
  return PLAN_ENTITLEMENTS[plan].deviceLimit;
}

export interface RegisterDeviceResult {
  access: DeviceAccess;
  deviceId: string;
  existingDeviceCount: number;
}

/**
 * Best-effort write of user_devices + entitlement-aware access check. Safe to
 * call on every successful login; idempotent for already-known devices.
 */
export async function registerDevice(): Promise<RegisterDeviceResult> {
  const deviceId = getOrCreateDeviceId();

  const response = await fetch("/api/auth/device", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ deviceId }),
  });

  const body = await safeJson(response);
  if ((response.ok || response.status === 403) && isRegisterDeviceResult(body)) return body;

  const error = getErrorMessage(body) ?? `http_${response.status}`;
  throw new Error(error);
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isRegisterDeviceResult(value: unknown): value is RegisterDeviceResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<RegisterDeviceResult>;
  return (
    (result.access === "allow-existing" ||
      result.access === "allow-new" ||
      result.access === "block-free-device-limit") &&
    typeof result.deviceId === "string" &&
    typeof result.existingDeviceCount === "number"
  );
}

function getErrorMessage(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const error = (value as { error?: unknown }).error;
  return typeof error === "string" ? error : null;
}

/** Display helper for the paywall / Settings → Devices screen. */
export function formatDeviceLabel(seat: { user_agent?: string | null }): string {
  return describeUserAgent(seat.user_agent ?? "");
}

import { createApiResponse, parseMutationBody } from "@/lib/apiHeaders";
import {
  DEVICE_ID_MAX_LENGTH,
  evaluateDeviceAccess,
  getDeviceLimitForPlan,
  type DeviceSeat,
} from "@/lib/auth/deviceRegistry";
import { resolveViewerPlan } from "@/lib/entitlementsServer";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type SubscriptionRow = {
  status: string | null;
};

function invalidDeviceResponse() {
  return createApiResponse({ error: "Invalid device ID." }, { status: 400 });
}

function parseDeviceId(rawBody: unknown): string | null {
  if (!rawBody || typeof rawBody !== "object") return null;
  const deviceId = (rawBody as { deviceId?: unknown }).deviceId;
  if (typeof deviceId !== "string") return null;
  const trimmed = deviceId.trim();
  if (!trimmed || trimmed.length > DEVICE_ID_MAX_LENGTH) return null;
  return trimmed;
}

export async function POST(request: Request) {
  const rawBody = await parseMutationBody(request);
  if (rawBody instanceof Response) return rawBody;

  const deviceId = parseDeviceId(rawBody);
  if (!deviceId) return invalidDeviceResponse();

  const supabase = await createServerSupabase();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return createApiResponse({ error: "unauthenticated" }, { status: 401 });
  }

  const admin = createServiceClient();
  const { data: subscriptionData, error: subError } = await admin
    .from("subscriptions")
    .select("status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (subError) {
    console.error("[auth/device] failed to read subscription", {
      userId: user.id,
      message: subError.message,
    });
    return createApiResponse({ error: "subscription_lookup_failed" }, { status: 500 });
  }

  const subscription = subscriptionData as SubscriptionRow | null;
  const plan = await resolveViewerPlan({
    user,
    subscriptionStatus: subscription?.status ?? null,
    email: user.email,
    admin,
  });
  const deviceLimit = getDeviceLimitForPlan(plan);

  const { data: devicesData, error: devicesError } = await admin
    .from("user_devices")
    .select("device_id, last_seen")
    .eq("user_id", user.id);

  if (devicesError) {
    console.error("[auth/device] failed to read devices", {
      userId: user.id,
      message: devicesError.message,
    });
    return createApiResponse({ error: "device_lookup_failed" }, { status: 500 });
  }

  const existingDevices = (devicesData ?? []) as DeviceSeat[];
  const access = evaluateDeviceAccess({
    existingDevices,
    currentDeviceId: deviceId,
    deviceLimit,
  });

  const existingDeviceCount =
    access === "allow-new" ? existingDevices.length + 1 : existingDevices.length;
  const result = { access, deviceId, existingDeviceCount };

  if (access === "block-free-device-limit") {
    return createApiResponse({ ...result, error: "device_limit" }, { status: 403 });
  }

  const now = new Date().toISOString();
  const userAgent = request.headers.get("user-agent") ?? "";
  const { error: upsertError } = await admin.from("user_devices").upsert(
    {
      user_id: user.id,
      device_id: deviceId,
      last_seen: now,
      user_agent: userAgent,
    },
    { onConflict: "user_id,device_id" },
  );

  if (upsertError) {
    console.error("[auth/device] failed to register device", {
      userId: user.id,
      message: upsertError.message,
    });
    return createApiResponse({ error: "device_register_failed" }, { status: 500 });
  }

  return createApiResponse(result);
}

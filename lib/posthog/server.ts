import { createHash } from "node:crypto";

import { PostHog } from "posthog-node";

import type { EventMap } from "./eventTypes";

if (typeof window !== "undefined") {
  throw new Error(
    "lib/posthog/server.ts must only be imported on the server. " +
      "Check that your client component is not importing this module.",
  );
}

let client: PostHog | null = null;

const SENSITIVE_PROPERTY_KEY_RE =
  /(?:^|_)(?:email|user_?id|device_?id|customer_?id|subscription_?id|token|secret|api_?key|message|content|conversation|history|transcript)(?:$|_)/i;
const SAFE_PROPERTY_KEYS = new Set(["promptKey"]);
const EMAIL_VALUE_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const TOKEN_VALUE_RE = /\b(?:reveal|token|unsubscribe)[_-]?[A-Za-z0-9_-]{8,}\b/i;

function getPostHogServerClient(): PostHog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  if (!key) return null;

  if (!client) {
    client = new PostHog(key, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
      flushAt: 1,
      flushInterval: 0,
    });
  }

  return client;
}

function findUnsafeAnalyticsProperty(value: unknown, path: string[] = []): string | null {
  if (path.length > 0) {
    const key = path[path.length - 1];
    if (!SAFE_PROPERTY_KEYS.has(key) && SENSITIVE_PROPERTY_KEY_RE.test(key)) {
      return path.join(".");
    }
  }

  if (typeof value === "string") {
    if (EMAIL_VALUE_RE.test(value) || TOKEN_VALUE_RE.test(value)) {
      return path.join(".") || "<root>";
    }
    return null;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      const unsafe = findUnsafeAnalyticsProperty(value[index], [...path, String(index)]);
      if (unsafe) return unsafe;
    }
    return null;
  }

  if (value && typeof value === "object") {
    for (const [key, nestedValue] of Object.entries(value)) {
      const unsafe = findUnsafeAnalyticsProperty(nestedValue, [...path, key]);
      if (unsafe) return unsafe;
    }
  }

  return null;
}

export async function captureServerEvent<T extends keyof EventMap>({
  distinctId,
  event,
  properties,
}: {
  distinctId: string;
  event: T;
  properties: EventMap[T];
}): Promise<void> {
  const posthog = getPostHogServerClient();
  if (!posthog) return;

  const unsafeProperty = findUnsafeAnalyticsProperty(properties);
  if (unsafeProperty) {
    console.warn("[PostHog] blocked server event with unsafe property", {
      event,
      property: unsafeProperty,
    });
    return;
  }

  try {
    posthog.capture({
      distinctId: hashAnalyticsDistinctId(distinctId),
      event,
      properties: properties as Record<string, unknown>,
    });
    await posthog.flush();
  } catch (error) {
    console.warn("[PostHog] server capture failed", {
      event,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function hashAnalyticsDistinctId(raw: string): string {
  return createHash("sha256")
    .update(`go-daily:posthog:v1:${raw}`)
    .digest("hex")
    .slice(0, 32);
}

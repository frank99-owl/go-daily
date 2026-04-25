import { PostHog } from "posthog-node";

import type { EventMap } from "./eventTypes";

if (typeof window !== "undefined") {
  throw new Error(
    "lib/posthog/server.ts must only be imported on the server. " +
      "Check that your client component is not importing this module.",
  );
}

let client: PostHog | null = null;

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

  try {
    posthog.capture({
      distinctId,
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

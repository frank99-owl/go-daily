"use client";

import { posthog } from "./client";
import type { EventMap } from "./eventTypes";

/**
 * Typed wrapper around posthog.capture() to keep event names and properties
 * consistent across the codebase. Import { track } and call it instead of
 * posthog.capture() directly.
 */
export function track<T extends keyof EventMap>(event: T, props?: EventMap[T]) {
  posthog.capture(event, props as Record<string, unknown>);
}

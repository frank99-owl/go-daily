/**
 * Shared helpers for Stripe webhook processing.
 */

export function getStringId(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value && "id" in value) {
    const maybe = value as { id?: unknown };
    if (typeof maybe.id === "string") return maybe.id;
  }
  return null;
}

export function toIsoOrNull(epochSeconds: number | null | undefined): string | null {
  if (!epochSeconds) return null;
  return new Date(epochSeconds * 1000).toISOString();
}

export function minItemPeriodEnd(sub: import("stripe").default.Subscription): number | null {
  const ends = sub.items?.data
    ?.map((item) => item.current_period_end)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!ends || ends.length === 0) return null;
  return Math.min(...ends);
}

export function anchorDayFromIso(iso: string | null): number | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getUTCDate();
}

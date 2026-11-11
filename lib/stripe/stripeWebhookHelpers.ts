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

function minItemPeriodStart(sub: import("stripe").default.Subscription): number | null {
  const starts = sub.items?.data
    ?.map((item) => item.current_period_start)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!starts || starts.length === 0) return null;
  return Math.min(...starts);
}

/**
 * The last moment the subscription is paid for — what the app stores as
 * `current_period_end` and measures the past_due grace from.
 *
 * Normally that is the period's end. But Stripe moves the period forward when
 * it creates a renewal invoice, before collecting it, so while a subscription
 * is `past_due` its period end is the end of a period nobody has paid for and
 * the paid time stopped at that period's start. Until 2026-11 the row kept the
 * period end, which turned the 7-day grace into the whole unpaid period plus 7
 * days — about 37 days of Pro on a monthly plan.
 */
export function paidThrough(sub: import("stripe").default.Subscription): number | null {
  const periodEnd = minItemPeriodEnd(sub);
  if (sub.status !== "past_due") return periodEnd;
  return minItemPeriodStart(sub) ?? periodEnd;
}

export function anchorDayFromIso(iso: string | null): number | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getUTCDate();
}

import Stripe from "stripe";

/**
 * Stripe server helpers.
 *
 * NOTE: This module must never be imported from client components.
 */
if (typeof window !== "undefined") {
  throw new Error(
    "lib/stripe/server.ts must only be imported on the server. " +
      "Check that your client component is not importing this module.",
  );
}

type StripeConfig = NonNullable<ConstructorParameters<typeof Stripe>[1]>;

// Keep in sync with the installed Stripe SDK's latest API version (see
// node_modules/stripe/esm/apiVersion.js).
const STRIPE_API_VERSION: StripeConfig["apiVersion"] = "2026-03-25.dahlia";

export type ProInterval = "monthly" | "yearly";
export type ProPlan = "pro_monthly" | "pro_yearly";

let cached: Stripe | null = null;
let cachedPriceIds: Record<ProInterval, string> | null = null;

export function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set (server-only secret).");
  }

  if (!cached) {
    cached = new Stripe(key, {
      apiVersion: STRIPE_API_VERSION,
      typescript: true,
    });
  }
  return cached;
}

export function intervalToPlan(interval: ProInterval): ProPlan {
  return interval === "monthly" ? "pro_monthly" : "pro_yearly";
}

export function getProPriceId(interval: ProInterval): string {
  if (!cachedPriceIds) {
    const monthly = process.env.STRIPE_PRO_MONTHLY_PRICE_ID?.trim();
    const yearly = process.env.STRIPE_PRO_YEARLY_PRICE_ID?.trim();
    if (!monthly) {
      throw new Error("STRIPE_PRO_MONTHLY_PRICE_ID is not set");
    }
    if (!yearly) {
      throw new Error("STRIPE_PRO_YEARLY_PRICE_ID is not set");
    }
    cachedPriceIds = { monthly, yearly };
  }
  return cachedPriceIds[interval];
}

export function inferPlanFromPriceId(priceId: string | null | undefined): ProPlan | null {
  if (!priceId) return null;
  try {
    if (priceId === getProPriceId("monthly")) return "pro_monthly";
    if (priceId === getProPriceId("yearly")) return "pro_yearly";
  } catch {
    // If Stripe pricing is not configured, callers should keep handling the
    // subscription but mark unknown prices as unknown instead of crashing.
  }
  return null;
}

export function getStripeTrialDays(): number {
  const raw = process.env.STRIPE_TRIAL_DAYS?.trim();
  if (!raw) return 7;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 365) return 7;
  return parsed;
}

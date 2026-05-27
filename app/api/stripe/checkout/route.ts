import { z } from "zod";

import { createApiResponse, parseMutationBody } from "@/lib/apiHeaders";
import { getClientIP } from "@/lib/clientIp";
import { isProSubscriptionStatus } from "@/lib/entitlements";
import { inferLocaleFromReferer, localePath } from "@/lib/i18n/localePath";
import { checkRateLimit, createRateLimiter } from "@/lib/rateLimit";
import {
  getProPriceId,
  getStripeClient,
  getStripeTrialDays,
  intervalToPlan,
} from "@/lib/stripe/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import type { Locale } from "@/types";

export const runtime = "nodejs";

const rateLimiter = createRateLimiter();

const CheckoutRequestSchema = z.object({
  interval: z.enum(["monthly", "yearly"]),
});

type ExistingSubscriptionRow = {
  status: string | null;
  current_period_end: string | null;
  stripe_customer_id: string | null;
};

function cancelUrlFromReferer({
  origin,
  referer,
  locale,
}: {
  origin: string;
  referer: string | null;
  locale: Locale;
}): string {
  if (referer) {
    try {
      const url = new URL(referer);
      if (url.origin === origin) return url.toString();
    } catch {
      // ignore
    }
  }
  return `${origin}${localePath(locale, "/account")}`;
}

export async function POST(request: Request) {
  const rawBody = await parseMutationBody(request);
  if (rawBody instanceof Response) return rawBody;

  // Rate limit: 10 requests per minute per IP (payment abuse prevention)
  const ip = getClientIP(request);
  const ipLimit = await checkRateLimit(rateLimiter, `checkout:${ip}`, "[stripe/checkout]");
  if (ipLimit) return ipLimit;

  const supabase = await createServerSupabase();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return createApiResponse({ error: "unauthenticated" }, { status: 401 });
  }

  const userLimit = await checkRateLimit(
    rateLimiter,
    `checkout:user:${user.id}`,
    "[stripe/checkout]",
  );
  if (userLimit) return userLimit;

  const parsed = CheckoutRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return createApiResponse({ error: "invalid_request" }, { status: 400 });
  }

  const { interval } = parsed.data;
  const plan = intervalToPlan(interval);

  const { data: existingSubData, error: existingSubError } = await supabase
    .from("subscriptions")
    .select("status, current_period_end, stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingSubError) {
    console.error("[stripe/checkout] failed to query subscription", {
      userId: user.id,
      message: existingSubError.message,
    });
    return createApiResponse({ error: "subscription_lookup_failed" }, { status: 500 });
  }

  const existingSub = existingSubData as ExistingSubscriptionRow | null;
  if (
    isProSubscriptionStatus(existingSub?.status, {
      currentPeriodEnd: existingSub?.current_period_end,
    })
  ) {
    return createApiResponse({ error: "already_subscribed" }, { status: 409 });
  }
  const existingCustomerId = existingSub?.stripe_customer_id?.trim() || null;

  let stripe: ReturnType<typeof getStripeClient>;
  let priceId: string;
  try {
    stripe = getStripeClient();
    priceId = getProPriceId(interval);
  } catch (error) {
    const err = error as Error;
    console.error("[stripe/checkout] not configured", { message: err.message });
    return createApiResponse({ error: "not_configured" }, { status: 500 });
  }

  const origin = new URL(request.url).origin;
  const locale = inferLocaleFromReferer(request.headers.get("referer"));
  const successUrl = `${origin}${localePath(locale, "/account")}?checkout=success`;
  const cancelUrl = cancelUrlFromReferer({
    origin,
    referer: request.headers.get("referer"),
    locale,
  });

  const trialDays = getStripeTrialDays();

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: user.id,
      ...(existingCustomerId
        ? { customer: existingCustomerId }
        : { customer_email: user.email ?? undefined }),
      metadata: {
        user_id: user.id,
        plan,
      },
      subscription_data: {
        trial_period_days: trialDays > 0 ? trialDays : undefined,
        metadata: {
          user_id: user.id,
          plan,
        },
      },
    });

    if (!session.url) {
      console.error("[stripe/checkout] missing session.url", { userId: user.id });
      return createApiResponse({ error: "checkout_unavailable" }, { status: 502 });
    }

    return createApiResponse({ url: session.url });
  } catch (error) {
    const err = error as Error;
    console.error("[stripe/checkout] failed", { userId: user.id, message: err.message });
    return createApiResponse({ error: "checkout_failed" }, { status: 502 });
  }
}

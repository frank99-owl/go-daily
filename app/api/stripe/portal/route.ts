import { createApiResponse } from "@/lib/apiHeaders";
import { getClientIP } from "@/lib/clientIp";
import { inferLocaleFromReferer, localePath } from "@/lib/i18n/localePath";
import { checkRateLimit, createRateLimiter } from "@/lib/rateLimit";
import { isSameOriginMutationRequest } from "@/lib/requestSecurity";
import { getStripeClient } from "@/lib/stripe/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

const rateLimiter = createRateLimiter();

export async function POST(request: Request) {
  if (!isSameOriginMutationRequest(request)) {
    return createApiResponse({ error: "forbidden" }, { status: 403 });
  }

  const supabase = await createServerSupabase();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return createApiResponse({ error: "unauthenticated" }, { status: 401 });
  }

  const ip = getClientIP(request);
  const limitRes =
    (await checkRateLimit(rateLimiter, `portal:${ip}`, "[stripe/portal]")) ??
    (await checkRateLimit(rateLimiter, `portal:user:${user.id}`, "[stripe/portal]"));
  if (limitRes) return limitRes;

  const { data: sub, error: subErr } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (subErr) {
    console.error("[stripe/portal] failed to query subscription", {
      userId: user.id,
      message: subErr.message,
    });
    return createApiResponse({ error: "subscription_lookup_failed" }, { status: 500 });
  }

  if (!sub?.stripe_customer_id) {
    return createApiResponse({ error: "no_subscription" }, { status: 400 });
  }

  let stripe: ReturnType<typeof getStripeClient>;
  try {
    stripe = getStripeClient();
  } catch (error) {
    const err = error as Error;
    console.error("[stripe/portal] not configured", { message: err.message });
    return createApiResponse({ error: "not_configured" }, { status: 500 });
  }

  const origin = new URL(request.url).origin;
  const locale = inferLocaleFromReferer(request.headers.get("referer"));
  const returnUrl = `${origin}${localePath(locale, "/account")}`;

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: returnUrl,
    });
    return createApiResponse({ url: session.url });
  } catch (error) {
    const err = error as Error;
    console.error("[stripe/portal] failed", {
      userId: user.id,
      message: err.message,
    });
    return createApiResponse({ error: "portal_failed" }, { status: 502 });
  }
}

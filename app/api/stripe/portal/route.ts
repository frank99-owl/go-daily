import { createApiResponse } from "@/lib/apiHeaders";
import { DEFAULT_LOCALE, localePath, stripLocalePrefix } from "@/lib/localePath";
import { isSameOriginMutationRequest } from "@/lib/requestSecurity";
import { getStripeClient } from "@/lib/stripe/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import type { Locale } from "@/types";

export const runtime = "nodejs";

function inferLocaleFromReferer(referer: string | null): Locale {
  if (!referer) return DEFAULT_LOCALE;
  try {
    const url = new URL(referer);
    const { locale } = stripLocalePrefix(url.pathname);
    return locale ?? DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

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

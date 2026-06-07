/**
 * Email notification helpers for Stripe webhook events.
 */
import type Stripe from "stripe";

import { sendPaymentFailedEmail, sendSubscriptionStartedEmail } from "@/lib/email";
import { DEFAULT_LOCALE, isLocale, localePath } from "@/lib/i18n/localePath";
import { absoluteUrl } from "@/lib/siteUrl";
import { getStripeClient } from "@/lib/stripe/server";
import { getStringId } from "@/lib/stripe/stripeWebhookHelpers";
import { createServiceClient } from "@/lib/supabase/service";
import type { Locale } from "@/types";

type PaymentEmailProfile = {
  locale?: string | null;
  email_opt_out?: boolean | null;
  email_unsubscribe_token?: string | null;
};

type SubscriptionEmailContact = {
  email: string;
  locale: Locale;
  unsubscribeToken?: string | null;
};

function localeFromProfile(value: string | null | undefined): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

async function loadSubscriptionEmailContact({
  admin,
  userId,
  context,
}: {
  admin: ReturnType<typeof createServiceClient>;
  userId: string | null | undefined;
  context: string;
}): Promise<SubscriptionEmailContact | null> {
  if (!userId) return null;

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("locale, email_opt_out, email_unsubscribe_token")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError) {
    console.warn(`[stripe/webhook] ${context} profile lookup failed`, {
      userId,
      message: profileError.message,
    });
    return null;
  }

  const emailProfile = profile as PaymentEmailProfile | null;
  if (emailProfile?.email_opt_out) return null;

  const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId);
  const email = userData.user?.email;
  if (userError || !email) {
    if (userError) {
      console.warn(`[stripe/webhook] ${context} user lookup failed`, {
        userId,
        message: userError.message,
      });
    }
    return null;
  }

  return {
    email,
    locale: localeFromProfile(emailProfile?.locale),
    unsubscribeToken: emailProfile?.email_unsubscribe_token,
  };
}

export async function sendSubscriptionStartedNotice({
  admin,
  sub,
  fallbackUserId,
}: {
  admin: ReturnType<typeof createServiceClient>;
  sub: Stripe.Subscription;
  fallbackUserId?: string | null;
}): Promise<void> {
  const userId = sub.metadata?.user_id || fallbackUserId;
  if (!userId) return;

  try {
    const contact = await loadSubscriptionEmailContact({
      admin,
      userId,
      context: "subscription started email",
    });
    if (!contact) return;

    await sendSubscriptionStartedEmail({
      to: contact.email,
      locale: contact.locale,
      trialing: sub.status === "trialing" || Boolean(sub.trial_end),
      unsubscribeToken: contact.unsubscribeToken,
    });
  } catch (error) {
    console.warn("[stripe/webhook] subscription started email skipped", error);
  }
}

export async function sendPaymentFailedNotice({
  admin,
  stripe,
  sub,
}: {
  admin: ReturnType<typeof createServiceClient>;
  stripe: ReturnType<typeof getStripeClient>;
  sub: Stripe.Subscription;
}): Promise<void> {
  const userId = sub.metadata?.user_id;
  if (!userId) return;

  try {
    const customerId = getStringId(sub.customer);
    if (!customerId) return;

    const contact = await loadSubscriptionEmailContact({
      admin,
      userId,
      context: "payment failed email",
    });
    if (!contact) return;

    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: absoluteUrl(localePath(contact.locale, "/account")),
    });

    await sendPaymentFailedEmail({
      to: contact.email,
      locale: contact.locale,
      portalUrl: portal.url,
      unsubscribeToken: contact.unsubscribeToken,
    });
  } catch (error) {
    console.warn("[stripe/webhook] payment failed email skipped", error);
  }
}

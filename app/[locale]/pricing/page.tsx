import type { Metadata } from "next";

import { getViewerPlan, type ViewerPlan } from "@/lib/entitlements";
import { localePath } from "@/lib/localePath";
import { getMessages } from "@/lib/metadata";
import { isAuthSessionMissingError } from "@/lib/supabase/authErrors";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/types";

import { PricingClient } from "./PricingClient";

// Subscription status is per-request — avoid prerender caching so pro users
// see the "Manage subscription" CTA instead of the stale checkout buttons.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = getMessages(locale);
  const path = localePath(locale, "/pricing");
  return {
    title: t.metadata.pricing.title,
    description: t.metadata.pricing.description,
    alternates: { canonical: path },
    openGraph: {
      title: t.metadata.pricing.title,
      description: t.metadata.pricing.description,
      url: path,
    },
  };
}

export default async function PricingPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;

  let viewerPlan: ViewerPlan = "guest";

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr && !isAuthSessionMissingError(userErr)) {
      console.error("[pricing] failed to fetch user", userErr.message);
    }

    if (user) {
      const { data: subscription, error: subErr } = await supabase
        .from("subscriptions")
        .select("status")
        .eq("user_id", user.id)
        .maybeSingle();
      if (subErr) {
        console.error("[pricing] failed to read subscription", subErr.message);
      }
      viewerPlan = getViewerPlan({ user, subscriptionStatus: subscription?.status ?? null });
    }
  } catch (error) {
    console.error("[pricing] supabase check failed", error);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-24 sm:px-6 sm:pt-32">
      <PricingClient viewerPlan={viewerPlan} locale={locale} />
    </div>
  );
}

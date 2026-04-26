import type { Metadata } from "next";

import { localePath } from "@/lib/i18n/localePath";
import { getMessages } from "@/lib/i18n/metadata";
import { isAuthSessionMissingError } from "@/lib/supabase/authErrors";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/types";

import { AccountClient } from "./AccountClient";

// The account page inspects the current Supabase session on every request
// and redirects anonymous visitors to /login. That's per-request state, so
// force dynamic rendering to avoid any prerender caching.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = getMessages(locale);
  const path = localePath(locale, "/account");
  return {
    title: t.metadata.account.title,
    description: t.metadata.account.description,
    alternates: { canonical: path },
    robots: { index: false, follow: false },
    openGraph: {
      title: t.metadata.account.title,
      description: t.metadata.account.description,
      url: path,
    },
  };
}

export default async function AccountPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  let user: {
    id: string;
    email?: string | null;
    identities?: Array<{ provider?: string | null }> | null;
  } | null = null;
  let hasBillingPortal = false;

  try {
    const supabase = await createClient();
    const {
      data: { user: currentUser },
      error,
    } = await supabase.auth.getUser();
    if (error && !isAuthSessionMissingError(error)) {
      console.error("[account] failed to fetch user", error.message);
    } else {
      user = currentUser;
      if (currentUser) {
        const { data: subscription, error: subErr } = await supabase
          .from("subscriptions")
          .select("stripe_customer_id")
          .eq("user_id", currentUser.id)
          .maybeSingle();

        if (subErr) {
          console.error("[account] failed to read subscription", subErr.message);
        }

        hasBillingPortal = Boolean(subscription?.stripe_customer_id);
      }
    }
  } catch (error) {
    console.error("[account] supabase auth check failed", error);
  }

  if (!user) {
    const next = encodeURIComponent(localePath(locale, "/account"));
    const t = getMessages(locale);
    return (
      <div className="mx-auto max-w-2xl px-4 sm:px-6 pt-24 pb-12 sm:pt-32 sm:pb-16 text-center">
        <a
          href={`${localePath(locale, "/login")}?next=${next}`}
          className="text-sm uppercase tracking-[0.3em] text-white/60 transition-colors hover:text-[#00f2ff]"
        >
          {t.nav.signIn}
        </a>
      </div>
    );
  }

  // Identify how the user signed in: identities is populated for OAuth
  // providers; falling back to "email" matches both OTP and magic link.
  const primaryIdentity = user.identities?.[0]?.provider ?? "email";

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 pt-24 pb-12 sm:pt-32 sm:pb-16">
      <AccountClient
        email={user.email ?? ""}
        provider={primaryIdentity === "google" ? "google" : "email"}
        hasBillingPortal={hasBillingPortal}
      />
    </div>
  );
}

import type { Metadata } from "next";

import { normalizeAuthNext } from "@/lib/authRedirect";
import { localePath } from "@/lib/localePath";
import { getMessages } from "@/lib/metadata";
import { isAuthSessionMissingError } from "@/lib/supabase/authErrors";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/types";

import { LoginClient } from "./LoginClient";

// The login page checks for an existing session and bounces already-authed
// visitors onward. That's per-request state, so force dynamic rendering.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = getMessages(locale);
  const path = localePath(locale, "/login");
  return {
    title: t.metadata.login.title,
    description: t.metadata.login.description,
    alternates: { canonical: path },
    // Avoid indexing the login page — robots already disallow /*/about
    // but login has no content value for search engines either.
    robots: { index: false, follow: true },
    openGraph: {
      title: t.metadata.login.title,
      description: t.metadata.login.description,
      url: path,
    },
  };
}

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ next?: string; auth_error?: string }>;
}) {
  const { locale } = await params;
  const { next: nextRaw, auth_error } = await searchParams;
  const next = normalizeAuthNext(locale, nextRaw);

  // Already signed in? Jump them straight to `next` instead of re-showing
  // the form. If Supabase is temporarily unavailable, fail open to the login
  // UI instead of tripping the route error boundary.
  let user: { id: string } | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user: currentUser },
      error,
    } = await supabase.auth.getUser();
    if (error && !isAuthSessionMissingError(error)) {
      console.error("[login] failed to fetch user", error.message);
    } else {
      user = currentUser ? { id: currentUser.id } : null;
    }
  } catch (error) {
    console.error("[login] supabase auth check failed", error);
  }

  if (user) {
    return (
      <div className="mx-auto max-w-md px-4 sm:px-6 pt-24 pb-12 sm:pt-32 sm:pb-16 text-center">
        <a
          href={next}
          className="text-sm uppercase tracking-[0.3em] text-white/60 transition-colors hover:text-[#00f2ff]"
        >
          {getMessages(locale).auth.login.alreadySignedIn}
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 sm:px-6 pt-24 pb-12 sm:pt-32 sm:pb-16">
      <LoginClient next={next} authError={auth_error ?? null} />
    </div>
  );
}

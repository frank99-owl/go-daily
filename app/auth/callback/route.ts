import { NextResponse } from "next/server";

import {
  AUTH_REDIRECT_COOKIE,
  normalizeAuthNext,
  parsePendingAuthRedirect,
  readCookieValue,
} from "@/lib/auth/authRedirect";
import { sendWelcomeEmail } from "@/lib/email";
import {
  DEFAULT_LOCALE,
  isLocale,
  localePath,
  negotiateLocaleFromHeader,
  stripLocalePrefix,
  SUPPORTED_LOCALES,
} from "@/lib/i18n/localePath";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * OAuth / magic link callback handler. Supabase redirects the browser here
 * after the user clicks the email link or completes an OAuth flow, with a
 * `code` query parameter we need to exchange for a session.
 *
 * The `next` query parameter lets the caller control the post-login
 * redirect. We guarantee it's same-origin and locale-prefixed so open
 * redirects and locale drift are impossible.
 *
 * On error we send the user to /{locale}/login?auth_error=... instead of
 * the target page, because only the login page knows how to render the
 * error copy.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const rawNext = url.searchParams.get("next");
  const pending = parsePendingAuthRedirect(
    readCookieValue(request.headers.get("cookie"), AUTH_REDIRECT_COOKIE),
  );
  const locale = resolveLocale(
    url.searchParams.get("locale") ?? pending?.locale ?? null,
    rawNext,
    request.headers,
  );
  const next = rawNext
    ? normalizeAuthNext(locale, rawNext)
    : normalizeAuthNext(locale, pending?.next);
  const origin = url.origin;

  const loginUrl = (authError: string) =>
    `${origin}${localePath(locale, "/login")}?next=${encodeURIComponent(next)}&auth_error=${encodeURIComponent(authError)}`;

  const redirect = (location: string) => {
    const response = NextResponse.redirect(location);
    response.cookies.set(AUTH_REDIRECT_COOKIE, "", {
      path: "/",
      maxAge: 0,
      sameSite: "lax",
    });
    return response;
  };

  if (!code) {
    return redirect(loginUrl("missing_code"));
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return redirect(loginUrl(error.message));
    }

    await sendWelcomeEmailIfNeeded(supabase, locale);
  } catch (error) {
    const message = error instanceof Error ? error.message : "callback_failed";
    console.error("[auth/callback] session exchange failed", message);
    return redirect(loginUrl(message));
  }

  return redirect(`${origin}${next}`);
}

/**
 * Pick the locale for the post-error /login redirect: prefer the one the
 * callback explicitly carried, then the one already present in `next`, then
 * Accept-Language, and finally the default.
 */
function resolveLocale(rawLocale: string | null, rawNext: string | null, headers: Headers): Locale {
  if (isLocale(rawLocale)) return rawLocale;
  const { locale } = stripLocalePrefix(rawNext ?? "");
  if (locale && isLocale(locale)) return locale;
  const negotiated = negotiateLocaleFromHeader(headers.get("accept-language"));
  if (SUPPORTED_LOCALES.includes(negotiated)) return negotiated;
  return DEFAULT_LOCALE;
}

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;
type ProfileEmailState = {
  locale?: string | null;
  email_opt_out?: boolean | null;
  welcome_email_sent_at?: string | null;
  email_unsubscribe_token?: string | null;
};

async function sendWelcomeEmailIfNeeded(
  supabase: ServerSupabaseClient,
  fallbackLocale: Locale,
): Promise<void> {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user?.email) return;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("locale, email_opt_out, welcome_email_sent_at, email_unsubscribe_token")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileError) {
      console.warn("[auth/callback] welcome profile lookup failed", {
        userId: user.id,
        message: profileError.message,
      });
      return;
    }

    const emailState = profile as ProfileEmailState | null;
    if (emailState?.email_opt_out || emailState?.welcome_email_sent_at) return;

    const locale = isLocale(emailState?.locale) ? emailState.locale : fallbackLocale;
    const result = await sendWelcomeEmail({
      to: user.email,
      locale,
      unsubscribeToken: emailState?.email_unsubscribe_token,
    });

    if (!result.sent) return;

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ welcome_email_sent_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("welcome_email_sent_at", null);

    if (updateError) {
      console.warn("[auth/callback] failed to mark welcome email sent", {
        userId: user.id,
        message: updateError.message,
      });
    }
  } catch (error) {
    console.warn("[auth/callback] welcome email skipped", error);
  }
}

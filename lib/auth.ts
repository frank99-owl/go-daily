/**
 * auth — browser-side authentication helpers.
 *
 * Wraps `@supabase/ssr`'s browser client with:
 *   - A `useCurrentUser` hook that subscribes to auth state changes so the
 *     nav avatar / login button update instantly after sign-in and sign-out.
 *   - `signInWithGoogle` / `signInWithEmail` that build locale-aware
 *     redirect URLs pointing back to the current host's `/auth/callback`.
 *   - `signOut` and `deleteAccount` helpers with reasonable error surfaces.
 *
 * We deliberately route every post-login redirect through the existing
 * server-side `/auth/callback` route handler so the server can set the
 * fresh Supabase cookies on the response before the client mounts.
 */
"use client";

import type { Session, User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

import type { Locale } from "@/types";

import {
  AUTH_REDIRECT_COOKIE,
  normalizeAuthNext,
  serializePendingAuthRedirect,
} from "./authRedirect";
import { createClient } from "./supabase/client";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate an email shape with a conservative regex. We leave serious
 * validation to Supabase; this is only to catch obvious typos client-side.
 */
export function isLikelyEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/**
 * Build the absolute callback URL Supabase will redirect to after sign-in.
 * Keep this URL query-free: some auth providers / allow-lists reject callback
 * URLs with dynamic query strings and then fall back to the project's Site URL.
 * The intended post-login destination is carried by `AUTH_REDIRECT_COOKIE`.
 */
function buildCallbackUrl(): string {
  if (typeof window === "undefined") {
    throw new Error("buildCallbackUrl must be called in the browser");
  }
  return `${window.location.origin}/auth/callback`;
}

function rememberPendingAuthRedirect(locale: Locale, next: string): void {
  if (typeof document === "undefined") return;
  const value = encodeURIComponent(serializePendingAuthRedirect(locale, next));
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${AUTH_REDIRECT_COOKIE}=${value}; Path=/; Max-Age=600; SameSite=Lax${secure}`;
}

/**
 * Ensure `next` is locale-prefixed so signing in from /ja/login lands the
 * user back on a /ja/... page, not the default locale. If a stale different
 * locale is already present, the active login page locale wins.
 */
export function nextForLocale(locale: Locale, next: string): string {
  return normalizeAuthNext(locale, next);
}

export async function signInWithGoogle(
  locale: Locale,
  next: string = "/",
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = createClient();
    rememberPendingAuthRedirect(locale, next);
    const redirectTo = buildCallbackUrl();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) return { ok: false, error: error.message };
    // signInWithOAuth triggers a full-page redirect; this return is for the
    // case where Supabase rejects the request before navigating away.
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "oauth_failed" };
  }
}

export async function signInWithEmail(
  email: string,
  locale: Locale,
  next: string = "/",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = email.trim();
  if (!isLikelyEmail(trimmed)) {
    return { ok: false, error: "invalid_email" };
  }
  try {
    const supabase = createClient();
    rememberPendingAuthRedirect(locale, next);
    const emailRedirectTo = buildCallbackUrl();
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        emailRedirectTo,
        // Let anonymous visitors sign up just by clicking the magic link;
        // suppressing shouldCreateUser would force a separate /signup flow.
        shouldCreateUser: true,
      },
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "email_signin_failed" };
  }
}

export async function signOut(): Promise<void> {
  const supabase = createClient();
  await supabase.auth.signOut();
}

/**
 * Calls our server route which uses the service-role key to delete the
 * Supabase auth user. The DB trigger on auth.users cascades to profiles,
 * attempts, etc. (see migrations). After a successful call we still run
 * signOut() to flush the local session cookies.
 */
export async function deleteAccount(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/account/delete", {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) {
      const body = await safeJson(res);
      return { ok: false, error: body?.error ?? `http_${res.status}` };
    }
    await signOut();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

async function safeJson(res: Response): Promise<{ error?: string } | null> {
  try {
    return (await res.json()) as { error?: string };
  } catch {
    return null;
  }
}

/**
 * Subscribe to Supabase auth state for UI components. Returns `undefined`
 * while we're still resolving the initial session so callers can show a
 * skeleton instead of flashing "Sign in" for a logged-in user.
 */
export function useCurrentUser(): {
  user: User | null;
  loading: boolean;
} {
  const [state, setState] = useState<{ user: User | null; loading: boolean }>({
    user: null,
    loading: true,
  });

  useEffect(() => {
    let mounted = true;
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch (err) {
      console.warn("[auth] Supabase browser client unavailable", err);
      queueMicrotask(() => {
        setState({ user: null, loading: false });
      });
      return;
    }

    supabase.auth
      .getSession()
      .then(({ data }: { data: { session: Session | null } }) => {
        if (!mounted) return;
        setState({ user: data.session?.user ?? null, loading: false });
      })
      .catch((err) => {
        console.warn("[auth] Supabase session read failed", err);
        if (!mounted) return;
        setState({ user: null, loading: false });
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setState({ user: session?.user ?? null, loading: false });
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}

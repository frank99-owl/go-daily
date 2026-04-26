"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import {
  AUTH_REDIRECT_COOKIE,
  parsePendingAuthRedirect,
  readCookieValue,
} from "@/lib/auth/authRedirect";
import { useLocale } from "@/lib/i18n/i18n";
import { localePath } from "@/lib/i18n/localePath";

const AUTH_PARAM_KEYS = ["code", "error", "error_description"] as const;

/**
 * Recovery path for OAuth providers that ignore or strip `redirect_to` query
 * params and send the user back to `/{locale}` with auth params attached.
 */
export function AuthRedirectBridge() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { locale } = useLocale();

  useEffect(() => {
    if (typeof window === "undefined" || !pathname) return;

    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (!AUTH_PARAM_KEYS.some((key) => params.has(key))) {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      for (const key of AUTH_PARAM_KEYS) {
        const value = hashParams.get(key);
        if (value) params.set(key, value);
      }
    }

    const code = params.get("code");
    const error = params.get("error_description") ?? params.get("error");
    if (!code && !error) return;

    const cleanParams = new URLSearchParams(searchParams?.toString() ?? "");
    for (const key of AUTH_PARAM_KEYS) cleanParams.delete(key);
    const cleanNext = `${pathname}${cleanParams.toString() ? `?${cleanParams}` : ""}`;
    const pending = parsePendingAuthRedirect(
      readCookieValue(document.cookie, AUTH_REDIRECT_COOKIE),
    );

    if (code) {
      const callbackParams = new URLSearchParams({
        code,
        locale: pending?.locale ?? locale,
        next: pending?.next ?? cleanNext,
      });
      router.replace(`/auth/callback?${callbackParams.toString()}`);
      return;
    }

    const loginParams = new URLSearchParams({
      next: cleanNext,
      auth_error: error ?? "oauth_failed",
    });
    router.replace(`${localePath(locale, "/login")}?${loginParams.toString()}`);
  }, [locale, pathname, router, searchParams]);

  return null;
}

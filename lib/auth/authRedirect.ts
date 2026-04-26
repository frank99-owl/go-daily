import type { Locale } from "@/types";

import { isLocale, localePath, stripLocalePrefix } from "@/lib/localePath";

const AUTH_REDIRECT_BASE = "https://go-daily.local";
export const AUTH_REDIRECT_COOKIE = "go-daily.auth-redirect";

/**
 * Convert a caller-provided post-login target into a same-origin,
 * locale-prefixed path. The active login page locale wins over any stale
 * locale already present in the target.
 */
export function normalizeAuthNext(locale: Locale, value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return localePath(locale, "/");
  }

  try {
    const parsed = new URL(value, AUTH_REDIRECT_BASE);
    if (parsed.origin !== AUTH_REDIRECT_BASE) return localePath(locale, "/");

    const { path } = stripLocalePrefix(parsed.pathname);
    return `${localePath(locale, path)}${parsed.search}${parsed.hash}`;
  } catch {
    return localePath(locale, "/");
  }
}

export function serializePendingAuthRedirect(locale: Locale, next: string): string {
  const params = new URLSearchParams({
    locale,
    next: normalizeAuthNext(locale, next),
  });
  return params.toString();
}

export function parsePendingAuthRedirect(
  value: string | null | undefined,
): { locale: Locale; next: string } | null {
  if (!value) return null;

  try {
    const params = new URLSearchParams(value);
    const locale = params.get("locale");
    if (!isLocale(locale)) return null;

    return {
      locale,
      next: normalizeAuthNext(locale, params.get("next")),
    };
  } catch {
    return null;
  }
}

export function readCookieValue(
  cookieHeader: string | null | undefined,
  name: string,
): string | null {
  if (!cookieHeader) return null;

  const prefix = `${name}=`;
  const part = cookieHeader
    .split(";")
    .map((chunk) => chunk.trim())
    .find((chunk) => chunk.startsWith(prefix));
  if (!part) return null;

  try {
    return decodeURIComponent(part.slice(prefix.length));
  } catch {
    return null;
  }
}

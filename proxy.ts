import { NextResponse, type NextRequest } from "next/server";

import { normalizeAuthNext } from "@/lib/auth/authRedirect";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  isLocale,
  localePath,
  negotiateLocaleFromHeader,
  stripLocalePrefix,
} from "@/lib/localePath";
import { refreshSupabaseSession } from "@/lib/supabase/middleware";
import type { Locale } from "@/types";

/**
 * Next.js middleware ("proxy" is the Next-recommended filename since v15).
 *
 * Responsibilities:
 *   1. Refresh the Supabase auth cookie so server components see a fresh
 *      session on every navigation.
 *   2. Redirect unprefixed paths (e.g. `/today`) to their locale-prefixed
 *      equivalent using: URL override > cookie > Accept-Language > default.
 *   3. Expose `x-locale` to downstream server components via the forwarded
 *      request headers — the root layout reads it for the `<html lang>`
 *      attribute on routes like /auth/callback that don't have a locale
 *      segment.
 *
 * Routes excluded from this middleware (see matcher below): /api, /auth,
 * /_next/static, /_next/image, favicon/manifest/sitemap assets.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const { locale: urlLocale, path: strippedPath } = stripLocalePrefix(pathname);

  // 1. Manifest special-case: must reach the route handler to get the
  //    localised strings, but we still want to inject `x-locale` so the
  //    `app/manifest.ts` handler picks the right dictionary.
  if (pathname === "/manifest.webmanifest") {
    return passthrough(request, negotiateLocale(request));
  }

  // 2. Static-ish paths that should never be redirected or localised.
  if (isExemptPath(pathname)) {
    return passthrough(request, urlLocale ?? undefined);
  }

  // 3. Already prefixed with a supported locale → pass through with header.
  if (urlLocale) {
    const response = passthrough(request, urlLocale);
    // Refresh Supabase session on every page nav. Session refresh mutates
    // cookies on the response, so we chain it through the same NextResponse.
    const { user } = await refreshSupabaseSession(request, response);
    const authRedirect = redirectAuthPageIfNeeded(
      request,
      response,
      urlLocale,
      strippedPath,
      !!user,
    );
    if (authRedirect) return authRedirect;
    return response;
  }

  // 4. No locale in URL → negotiate + redirect.
  const locale = negotiateLocale(request);

  const target = new URL(
    `/${locale}${strippedPath === "/" ? "" : strippedPath}${search}`,
    request.url,
  );
  // 308 (Permanent Redirect) is the method-preserving analogue of 301.
  // Browsers + search engines cache it aggressively, which is what we want
  // once the locale-prefixed structure is the canonical form. Choose 308
  // over 301 so POSTs (rare on navigation, but possible) keep their body.
  const redirect = NextResponse.redirect(target, { status: 308 });
  // Persist the negotiated locale so next visits skip negotiation.
  redirect.cookies.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return redirect;
}

function passthrough(request: NextRequest, locale?: string) {
  const headers = new Headers(request.headers);
  if (locale) headers.set("x-locale", locale);
  return NextResponse.next({ request: { headers } });
}

function negotiateLocale(request: NextRequest): string {
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  if (isLocale(cookieLocale)) return cookieLocale;
  return negotiateLocaleFromHeader(request.headers.get("accept-language"));
}

function redirectAuthPageIfNeeded(
  request: NextRequest,
  refreshedResponse: NextResponse,
  locale: Locale,
  strippedPath: string,
  isAuthed: boolean,
): NextResponse | null {
  if (strippedPath === "/account" && !isAuthed) {
    const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    const login = new URL(localePath(locale, "/login"), request.url);
    login.searchParams.set("next", normalizeAuthNext(locale, next));
    return withRefreshedCookies(refreshedResponse, NextResponse.redirect(login, { status: 307 }));
  }

  if (strippedPath === "/login" && isAuthed) {
    const nextParam = request.nextUrl.searchParams.get("next");
    let next = normalizeAuthNext(locale, nextParam);
    const nextPath = new URL(next, request.url).pathname;
    if (stripLocalePrefix(nextPath).path === "/login") {
      next = localePath(locale, "/account");
    }
    return withRefreshedCookies(
      refreshedResponse,
      NextResponse.redirect(new URL(next, request.url), { status: 307 }),
    );
  }

  return null;
}

function withRefreshedCookies(refreshedResponse: NextResponse, target: NextResponse): NextResponse {
  for (const cookie of refreshedResponse.cookies.getAll()) {
    target.cookies.set(cookie);
  }
  return target;
}

function isExemptPath(pathname: string): boolean {
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/opengraph-image" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname === "/sw.js" ||
    pathname === "/twitter-image"
  ) {
    return true;
  }
  // Static asset extensions — anything with a dot in the last path segment.
  const lastSegment = pathname.split("/").pop() ?? "";
  return /\.[a-z0-9]+$/i.test(lastSegment);
}

// Avoid running middleware for static assets and route handlers that manage
// their own auth. Everything user-facing goes through proxy() for locale +
// session handling.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|api|auth|favicon.ico|opengraph-image|robots.txt|sitemap.xml|twitter-image).*)",
  ],
};

// Default locale exported for consumers that need to reason about the
// fallback explicitly (e.g. sitemap / metadata).
export { DEFAULT_LOCALE };

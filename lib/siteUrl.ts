import { DEFAULT_LOCALE, SUPPORTED_LOCALES, localePath } from "@/lib/i18n/localePath";

const DEFAULT_SITE_URL = "https://go-daily.app";

function normalizeSiteUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured) {
    return DEFAULT_SITE_URL;
  }

  return normalizeSiteUrl(configured);
}

export function absoluteUrl(path = "/"): string {
  if (!path || path === "/") {
    return getSiteUrl();
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getSiteUrl()}${normalizedPath}`;
}

/**
 * Build hreflang alternate links for a given path.
 * Use in `generateMetadata` as `alternates: { languages: buildHreflangAlternates(path) }`.
 */
export function buildHreflangAlternates(path: string): Record<string, string> {
  const base = getSiteUrl();
  const alt: Record<string, string> = {};
  for (const loc of SUPPORTED_LOCALES) {
    alt[loc] = `${base}${localePath(loc, path)}`;
  }
  alt["x-default"] = `${base}${localePath(DEFAULT_LOCALE, path)}`;
  return alt;
}

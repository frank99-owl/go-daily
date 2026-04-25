/**
 * Locale-aware URL helpers shared by server and client code.
 *
 * Every user-facing page lives under `/{locale}/...`. This module owns the
 * authoritative list of supported locales and the functions that prefix,
 * strip, and negotiate locale segments.
 */
import type { Locale } from "@/types";

export const SUPPORTED_LOCALES: readonly Locale[] = ["zh", "en", "ja", "ko"];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "go-daily.locale";

export function isLocale(value: string | null | undefined): value is Locale {
  return !!value && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** Prefix a path with the given locale. Idempotent — will not double-prefix. */
export function localePath(locale: Locale, path: string): string {
  if (!path.startsWith("/")) path = `/${path}`;
  const stripped = stripLocalePrefix(path);
  if (stripped.path === "/") return `/${locale}`;
  return `/${locale}${stripped.path}`;
}

/**
 * Split a pathname into `{ locale, path }`. `locale` is null when the
 * pathname does not begin with a known locale segment.
 */
export function stripLocalePrefix(pathname: string): {
  locale: Locale | null;
  path: string;
} {
  const match = pathname.match(/^\/([a-z]{2})(\/.*|$)/i);
  if (!match) return { locale: null, path: pathname };
  const maybe = match[1]!.toLowerCase();
  if (!isLocale(maybe)) return { locale: null, path: pathname };
  const remainder = match[2] === "" ? "/" : match[2]!;
  return { locale: maybe, path: remainder };
}

/**
 * Pick the best supported locale from an Accept-Language header. Parses the
 * standard "en-US,en;q=0.9,ja;q=0.8" format, normalises language subtags
 * ("zh-CN" → "zh"), and falls back to DEFAULT_LOCALE.
 */
export function negotiateLocaleFromHeader(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;

  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const qParam = params.find((p) => p.trim().startsWith("q="));
      const q = qParam ? parseFloat(qParam.trim().slice(2)) : 1;
      return { tag: (tag ?? "").toLowerCase(), q: Number.isFinite(q) ? q : 0 };
    })
    .filter((entry) => entry.tag.length > 0)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    const primary = tag.split("-")[0] as Locale;
    if (isLocale(primary)) return primary;
  }
  return DEFAULT_LOCALE;
}

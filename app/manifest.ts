import type { MetadataRoute } from "next";
import { headers } from "next/headers";

import { DEFAULT_LOCALE, isLocale, localePath } from "@/lib/i18n/localePath";
import { DICTS } from "@/lib/i18n/metadata";
import type { Locale } from "@/types";

/**
 * Localised PWA manifest. Served at `/manifest.webmanifest` by Next.js.
 *
 * The manifest's `lang`, `name`, `short_name`, `description`, and
 * `start_url` all follow the caller's negotiated locale (via the
 * `x-locale` header that `proxy.ts` injects). The install prompt on a
 * user's home screen therefore matches the language they actually use.
 *
 * Notes:
 *   - PWA has one installation per origin, so we pick a best-effort locale
 *     at request time; users who switch languages after install will keep
 *     the original manifest until the browser refreshes it.
 *   - `start_url` points at `/{locale}` so a home-screen launch skips the
 *     middleware redirect hop.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const h = await headers();
  const raw = h.get("x-locale");
  const locale: Locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const t = DICTS[locale];

  return {
    name: t.manifest?.name ?? "go-daily",
    short_name: t.manifest?.shortName ?? "go-daily",
    description: t.manifest?.description ?? "One Go puzzle a day with DeepSeek-backed AI coaching",
    lang: locale,
    start_url: localePath(locale, "/"),
    scope: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    orientation: "portrait",
    categories: ["games", "education"],
    icons: [
      {
        src: "/favicon.ico",
        sizes: "48x48",
        type: "image/x-icon",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

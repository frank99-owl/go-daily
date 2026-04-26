import { MetadataRoute } from "next";

import { SUPPORTED_LOCALES } from "@/lib/i18n/localePath";
import { getSiteUrl } from "@/lib/siteUrl";

export default function robots(): MetadataRoute.Robots {
  // Block /about under every locale so ops pages don't leak into search.
  // Also keep the bare `/about/` form as a safety net for any route that
  // slips past the locale prefix (e.g. in local dev before middleware runs).
  const disallow = ["/api/", "/about/", ...SUPPORTED_LOCALES.map((l) => `/${l}/about/`)];

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow,
    },
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}

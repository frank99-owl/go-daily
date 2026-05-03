import { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/siteUrl";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/account", "/login"],
    },
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}

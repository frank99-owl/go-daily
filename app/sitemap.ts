import { MetadataRoute } from "next";

import { getAllSummaries } from "@/content/puzzles";
import { getSiteUrl } from "@/lib/siteUrl";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getSiteUrl();
  const summaries = await getAllSummaries();

  const puzzleEntries = summaries.map((p) => ({
    url: `${baseUrl}/puzzles/${encodeURIComponent(p.id)}`,
    lastModified: new Date(p.date),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  const staticRoutes = ["", "/today", "/puzzles", "/review", "/stats"].map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: "daily" as const,
    priority: route === "" ? 1.0 : 0.8,
  }));

  return [...staticRoutes, ...puzzleEntries];
}

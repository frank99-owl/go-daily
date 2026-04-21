import { MetadataRoute } from "next";

import { getAllSummaries } from "@/content/puzzles";
import {
  getAvailableDifficulties,
  getAvailableTags,
  getDifficultyCollectionPath,
  getTagCollectionPath,
} from "@/lib/puzzleCollections";
import { getSiteUrl } from "@/lib/siteUrl";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getSiteUrl();
  const summaries = await getAllSummaries();
  const tags = getAvailableTags(summaries);
  const difficulties = getAvailableDifficulties(summaries);

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

  const collectionRoutes = [
    ...tags.map((tag) => ({
      url: `${baseUrl}${getTagCollectionPath(tag)}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...difficulties.map((difficulty) => ({
      url: `${baseUrl}${getDifficultyCollectionPath(difficulty)}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];

  return [...staticRoutes, ...collectionRoutes, ...puzzleEntries];
}

import { MetadataRoute } from "next";

import { getAllSummaries } from "@/content/puzzleSummaries";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, localePath } from "@/lib/i18n/localePath";
import {
  getAvailableDifficulties,
  getAvailableTags,
  getDifficultyCollectionPath,
  getTagCollectionPath,
} from "@/lib/puzzle/puzzleCollections";
import { getSiteUrl } from "@/lib/siteUrl";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getSiteUrl();
  const summaries = await getAllSummaries();
  const tags = getAvailableTags(summaries);
  const difficulties = getAvailableDifficulties(summaries);

  // Emit one entry per (path, locale) with hreflang alternates pointing to
  // every other locale. Defaulting to `en` matches our middleware fallback.
  const buildAlternates = (path: string): Record<string, string> => {
    const alt: Record<string, string> = {};
    for (const loc of SUPPORTED_LOCALES) {
      alt[loc] = `${baseUrl}${localePath(loc, path)}`;
    }
    alt["x-default"] = `${baseUrl}${localePath(DEFAULT_LOCALE, path)}`;
    return alt;
  };

  const emit = (
    path: string,
    {
      lastModified = new Date(),
      changeFrequency = "weekly" as const,
      priority = 0.6,
    }: {
      lastModified?: Date;
      changeFrequency?: MetadataRoute.Sitemap[number]["changeFrequency"];
      priority?: number;
    } = {},
  ) => {
    const alternates = buildAlternates(path);
    return SUPPORTED_LOCALES.map((loc) => ({
      url: `${baseUrl}${localePath(loc, path)}`,
      lastModified,
      changeFrequency,
      priority,
      alternates: { languages: alternates },
    }));
  };

  const staticPaths: Array<{ path: string; priority: number }> = [
    { path: "/", priority: 1.0 },
    { path: "/today", priority: 0.9 },
    { path: "/puzzles", priority: 0.9 },
    { path: "/review", priority: 0.7 },
    { path: "/stats", priority: 0.7 },
    { path: "/legal/privacy", priority: 0.4 },
    { path: "/legal/terms", priority: 0.4 },
    { path: "/legal/refund", priority: 0.4 },
  ];

  const staticRoutes = staticPaths.flatMap(({ path, priority }) =>
    emit(path, { changeFrequency: "daily", priority }),
  );

  const collectionRoutes = [
    ...tags.flatMap((tag) =>
      emit(getTagCollectionPath(tag), { changeFrequency: "weekly", priority: 0.7 }),
    ),
    ...difficulties.flatMap((difficulty) =>
      emit(getDifficultyCollectionPath(difficulty), {
        changeFrequency: "weekly",
        priority: 0.7,
      }),
    ),
  ];

  const puzzleEntries = summaries.flatMap((p) =>
    emit(`/puzzles/${encodeURIComponent(p.id)}`, {
      lastModified: new Date(p.date),
      changeFrequency: "monthly",
      priority: 0.6,
    }),
  );

  return [...staticRoutes, ...collectionRoutes, ...puzzleEntries];
}

import { Metadata } from "next";

import { localePath } from "@/lib/i18n/localePath";
import { getMessages } from "@/lib/i18n/metadata";
import { serializeJsonLd } from "@/lib/jsonLd";
import {
  getOnboardingPuzzle,
  getOnboardingSummaries,
  normalizeOnboardingLevel,
} from "@/lib/puzzle/onboarding";
import { toPublicPuzzle } from "@/lib/puzzle/publicPuzzle";
import { absoluteUrl, buildHreflangAlternates } from "@/lib/siteUrl";
import type { Locale } from "@/types";

import { TodayClient } from "../TodayClient";

type SearchParams = {
  level?: string;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = getMessages(locale);
  const path = localePath(locale, "/onboarding");
  return {
    title: t.metadata.onboarding.title,
    description: t.metadata.onboarding.description,
    alternates: { canonical: path, languages: buildHreflangAlternates("/onboarding") },
    openGraph: {
      title: t.metadata.onboarding.title,
      description: t.metadata.onboarding.description,
      url: path,
    },
  };
}

export default async function OnboardingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  const level = normalizeOnboardingLevel(query.level);
  const puzzle = getOnboardingPuzzle(level);
  const poolCount = getOnboardingSummaries(level).length;
  const t = getMessages(locale);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LearningResource",
    name: t.onboarding.pageTitle,
    description: t.metadata.onboarding.description,
    learningResourceType: "Practice problem",
    educationalLevel: level,
    url: absoluteUrl(localePath(locale, `/onboarding?level=${level}`)),
  };

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 pt-20 pb-8 sm:pt-24 sm:pb-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <TodayClient
        puzzle={toPublicPuzzle(puzzle)}
        metaLabel={t.onboarding.metaLabel.replace("{{count}}", String(poolCount))}
        mode="onboarding"
        onboardingLevel={level}
      />
    </div>
  );
}

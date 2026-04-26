import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getAllSummaries } from "@/content/puzzles";
import { serializeJsonLd } from "@/lib/jsonLd";
import { localePath } from "@/lib/i18n/localePath";
import { getMessages } from "@/lib/i18n/metadata";
import {
  filterSummariesByDifficulty,
  getAvailableDifficulties,
  getDifficultyCollectionPath,
  isValidPuzzleDifficulty,
} from "@/lib/puzzle/puzzleCollections";
import { absoluteUrl } from "@/lib/siteUrl";
import type { Locale } from "@/types";

import { PuzzleListClient } from "../../PuzzleListClient";

interface Props {
  params: Promise<{ locale: Locale; level: string }>;
}

function levelLabel(level: number): string {
  return `${"★".repeat(level)}${"☆".repeat(5 - level)}`;
}

export async function generateStaticParams() {
  const summaries = await getAllSummaries();
  return getAvailableDifficulties(summaries).map((level) => ({ level: String(level) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, level } = await params;
  if (!isValidPuzzleDifficulty(level)) {
    return {};
  }

  const t = getMessages(locale);
  const numericLevel = Number(level);
  const levelStr = levelLabel(numericLevel);
  const title = t.metadata.difficultyCollection.title.replace("{{level}}", levelStr);
  const description = t.metadata.difficultyCollection.description.replace(
    "{{level}}",
    String(numericLevel),
  );
  const path = localePath(locale, getDifficultyCollectionPath(numericLevel));

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path },
  };
}

export default async function PuzzleDifficultyCollectionPage({ params }: Props) {
  const { locale, level } = await params;
  if (!isValidPuzzleDifficulty(level)) {
    notFound();
  }

  const numericLevel = Number(level);
  const summaries = await getAllSummaries();
  const filtered = filterSummariesByDifficulty(summaries, numericLevel);
  if (filtered.length === 0) {
    notFound();
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `Difficulty ${levelLabel(numericLevel)} Go Puzzles`,
    description: `Collection of go-daily puzzles at difficulty ${numericLevel}.`,
    url: absoluteUrl(localePath(locale, getDifficultyCollectionPath(numericLevel))),
    mainEntity: {
      "@type": "ItemList",
      itemListElement: filtered.slice(0, 20).map((summary, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: absoluteUrl(localePath(locale, `/puzzles/${encodeURIComponent(summary.id)}`)),
      })),
    },
  };

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pt-20 pb-8 sm:pt-24 sm:pb-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <PuzzleListClient
        summaries={filtered}
        collection={{ kind: "difficulty", level: numericLevel }}
      />
    </div>
  );
}

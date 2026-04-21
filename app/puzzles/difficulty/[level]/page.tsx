import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PuzzleListClient } from "@/app/puzzles/PuzzleListClient";
import { getAllSummaries } from "@/content/puzzles";
import { localized } from "@/lib/localized";
import {
  filterSummariesByDifficulty,
  getAvailableDifficulties,
  getDifficultyCollectionPath,
  isValidPuzzleDifficulty,
} from "@/lib/puzzleCollections";
import { absoluteUrl } from "@/lib/siteUrl";

interface Props {
  params: Promise<{ level: string }>;
}

function levelLabel(level: number): string {
  return `${"★".repeat(level)}${"☆".repeat(5 - level)}`;
}

export async function generateStaticParams() {
  const summaries = await getAllSummaries();
  return getAvailableDifficulties(summaries).map((level) => ({ level: String(level) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { level } = await params;
  if (!isValidPuzzleDifficulty(level)) {
    return {};
  }

  const numericLevel = Number(level);
  const title = `Difficulty ${levelLabel(numericLevel)} Go Puzzles — Go Daily`;
  const description = `Browse go-daily puzzles at difficulty ${numericLevel} and practice a focused band of reading challenges.`;
  const path = getDifficultyCollectionPath(numericLevel);

  return {
    title,
    description,
    alternates: {
      canonical: path,
    },
    openGraph: {
      title,
      description,
      url: path,
    },
  };
}

export default async function PuzzleDifficultyCollectionPage({ params }: Props) {
  const { level } = await params;
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
    url: absoluteUrl(getDifficultyCollectionPath(numericLevel)),
    mainEntity: {
      "@type": "ItemList",
      itemListElement: filtered.slice(0, 20).map((summary, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: absoluteUrl(`/puzzles/${encodeURIComponent(summary.id)}`),
        name: localized(summary.prompt, "en"),
      })),
    },
  };

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pt-20 pb-8 sm:pt-24 sm:pb-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PuzzleListClient
        summaries={filtered}
        collection={{ kind: "difficulty", level: numericLevel }}
      />
    </div>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PuzzleListClient } from "@/app/puzzles/PuzzleListClient";
import { getAllSummaries } from "@/content/puzzles";
import { localized } from "@/lib/localized";
import {
  filterSummariesByTag,
  getAvailableTags,
  getTagCollectionPath,
  isValidPuzzleTag,
} from "@/lib/puzzleCollections";
import { absoluteUrl } from "@/lib/siteUrl";

const ENGLISH_TAG_LABELS = {
  "life-death": "Life & Death",
  tesuji: "Tesuji",
  endgame: "Endgame",
  opening: "Opening",
} as const;

interface Props {
  params: Promise<{ tag: string }>;
}

export async function generateStaticParams() {
  const summaries = await getAllSummaries();
  return getAvailableTags(summaries).map((tag) => ({ tag }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tag } = await params;
  if (!isValidPuzzleTag(tag)) {
    return {};
  }

  const title = `${ENGLISH_TAG_LABELS[tag]} Go Puzzles — Go Daily`;
  const description = `Browse ${ENGLISH_TAG_LABELS[tag].toLowerCase()} puzzles in the go-daily library and jump straight into focused practice.`;
  const path = getTagCollectionPath(tag);

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

export default async function PuzzleTagCollectionPage({ params }: Props) {
  const { tag } = await params;
  if (!isValidPuzzleTag(tag)) {
    notFound();
  }

  const summaries = await getAllSummaries();
  const filtered = filterSummariesByTag(summaries, tag);
  if (filtered.length === 0) {
    notFound();
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${ENGLISH_TAG_LABELS[tag]} Go Puzzles`,
    description: `Curated collection of ${ENGLISH_TAG_LABELS[tag].toLowerCase()} puzzles on go-daily.`,
    url: absoluteUrl(getTagCollectionPath(tag)),
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
      <PuzzleListClient summaries={filtered} collection={{ kind: "tag", tag }} />
    </div>
  );
}

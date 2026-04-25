import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getAllSummaries } from "@/content/puzzles";
import { serializeJsonLd } from "@/lib/jsonLd";
import { localePath } from "@/lib/localePath";
import { getMessages } from "@/lib/metadata";
import {
  filterSummariesByTag,
  getAvailableTags,
  getTagCollectionPath,
  isValidPuzzleTag,
} from "@/lib/puzzleCollections";
import { absoluteUrl } from "@/lib/siteUrl";
import type { Locale } from "@/types";

import { PuzzleListClient } from "../../PuzzleListClient";

interface Props {
  params: Promise<{ locale: Locale; tag: string }>;
}

export async function generateStaticParams() {
  const summaries = await getAllSummaries();
  return getAvailableTags(summaries).map((tag) => ({ tag }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, tag } = await params;
  if (!isValidPuzzleTag(tag)) {
    return {};
  }

  const t = getMessages(locale);
  const tagLabel = t.tags[tag];
  const title = t.metadata.tagCollection.title.replace("{{tag}}", tagLabel);
  const description = t.metadata.tagCollection.description.replace(
    "{{tag}}",
    tagLabel.toLowerCase(),
  );
  const path = localePath(locale, getTagCollectionPath(tag));

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path },
  };
}

export default async function PuzzleTagCollectionPage({ params }: Props) {
  const { locale, tag } = await params;
  if (!isValidPuzzleTag(tag)) {
    notFound();
  }

  const summaries = await getAllSummaries();
  const filtered = filterSummariesByTag(summaries, tag);
  if (filtered.length === 0) {
    notFound();
  }

  const t = getMessages(locale);
  const tagLabel = t.tags[tag];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${tagLabel} Go Puzzles`,
    description: `Curated collection of ${tagLabel.toLowerCase()} puzzles on go-daily.`,
    url: absoluteUrl(localePath(locale, getTagCollectionPath(tag))),
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
      <PuzzleListClient summaries={filtered} collection={{ kind: "tag", tag }} />
    </div>
  );
}

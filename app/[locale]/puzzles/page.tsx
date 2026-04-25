import { Metadata } from "next";

import { getAllSummaries } from "@/content/puzzles";
import { serializeJsonLd } from "@/lib/jsonLd";
import { localePath } from "@/lib/localePath";
import { getMessages } from "@/lib/metadata";
import { absoluteUrl } from "@/lib/siteUrl";
import type { Locale } from "@/types";

import { PuzzleListClient } from "./PuzzleListClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = getMessages(locale);
  const path = localePath(locale, "/puzzles");
  return {
    title: t.metadata.puzzles.title,
    description: t.metadata.puzzles.description,
    alternates: { canonical: path },
    openGraph: {
      title: t.metadata.puzzles.title,
      description: t.metadata.puzzles.description,
      url: path,
    },
  };
}

export default async function PuzzlesPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const summaries = await getAllSummaries();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Go Puzzle Library",
    description: "Browsable Go puzzle library on go-daily.",
    url: absoluteUrl(localePath(locale, "/puzzles")),
    mainEntity: {
      "@type": "ItemList",
      itemListElement: summaries.slice(0, 20).map((summary, index) => ({
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
      <PuzzleListClient summaries={summaries} />
    </div>
  );
}

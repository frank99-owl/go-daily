import { Metadata } from "next";

import { getAllSummaries } from "@/content/puzzles";
import { absoluteUrl } from "@/lib/siteUrl";

import { PuzzleListClient } from "./PuzzleListClient";

export const metadata: Metadata = {
  title: "Go Puzzle Library — Go Daily",
  description:
    "Browse hundreds of life-and-death, tesuji, and endgame puzzles. Filter by difficulty and track your progress.",
  alternates: {
    canonical: "/puzzles",
  },
  openGraph: {
    title: "Go Puzzle Library — Go Daily",
    description:
      "Browse hundreds of life-and-death, tesuji, and endgame puzzles. Filter by difficulty and track your progress.",
    url: "/puzzles",
  },
};

export default async function PuzzlesPage() {
  const summaries = await getAllSummaries();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Go Puzzle Library",
    description: "Browsable Go puzzle library on go-daily.",
    url: absoluteUrl("/puzzles"),
    mainEntity: {
      "@type": "ItemList",
      itemListElement: summaries.slice(0, 20).map((summary, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: absoluteUrl(`/puzzles/${encodeURIComponent(summary.id)}`),
      })),
    },
  };

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pt-20 pb-8 sm:pt-24 sm:pb-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PuzzleListClient summaries={summaries} />
    </div>
  );
}

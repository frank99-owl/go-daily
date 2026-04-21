import { Metadata } from "next";
import { notFound } from "next/navigation";

import { TodayClient } from "@/app/TodayClient";
import { getPuzzle, getAllSummaries } from "@/content/puzzles";
import { localized } from "@/lib/localized";
import { BOARD_SIZE_LABELS } from "@/types";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const puzzle = await getPuzzle(decodeURIComponent(id));
  if (!puzzle) return {};

  const title = `Puzzle ${puzzle.id} — Go Daily`;
  const description = `${localized(puzzle.prompt, "en")} (${BOARD_SIZE_LABELS[puzzle.boardSize]} Go problem). Solve daily tsumego with AI coach guidance.`;

  return {
    title,
    description,
    alternates: {
      canonical: `/puzzles/${encodeURIComponent(puzzle.id)}`,
    },
    openGraph: {
      title,
      description,
      url: `/puzzles/${encodeURIComponent(puzzle.id)}`,
    },
  };
}

export async function generateStaticParams() {
  const summaries = await getAllSummaries();
  return summaries.map((p) => ({ id: p.id }));
}

export default async function PuzzleDetailPage({ params }: Props) {
  const { id } = await params;
  const puzzle = await getPuzzle(decodeURIComponent(id));
  if (!puzzle) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Game",
    name: `Go Puzzle ${puzzle.id}`,
    description: localized(puzzle.prompt, "en"),
    genre: "Strategy Game",
    audience: {
      "@type": "Audience",
      audienceType: "Go Players",
    },
    provider: {
      "@type": "Organization",
      name: "go-daily",
    },
  };

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 pt-20 pb-8 sm:pt-24 sm:pb-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <TodayClient puzzle={puzzle} />
    </div>
  );
}

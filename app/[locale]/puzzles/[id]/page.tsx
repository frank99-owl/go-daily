import { Metadata } from "next";
import { notFound } from "next/navigation";

import { getPuzzle } from "@/content/puzzles";
import { localePath } from "@/lib/i18n/localePath";
import { localized } from "@/lib/i18n/localized";
import { getMessages } from "@/lib/i18n/metadata";
import { serializeJsonLd } from "@/lib/jsonLd";
import { toPublicPuzzle } from "@/lib/puzzle/publicPuzzle";
import { buildHreflangAlternates } from "@/lib/siteUrl";
import { BOARD_SIZE_LABELS, type Locale } from "@/types";

import { TodayClient } from "../../TodayClient";

interface Props {
  params: Promise<{ locale: Locale; id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  const t = getMessages(locale);
  const puzzle = await getPuzzle(decodeURIComponent(id));
  if (!puzzle) {
    return {
      title: t.metadata.puzzles.title,
      description: t.metadata.puzzles.description,
    };
  }

  const title = t.metadata.puzzleDetail.title.replace("{{id}}", puzzle.id);
  const description = t.metadata.puzzleDetail.description
    .replace("{{prompt}}", localized(puzzle.prompt, locale))
    .replace("{{boardSize}}", BOARD_SIZE_LABELS[puzzle.boardSize]);
  const path = localePath(locale, `/puzzles/${encodeURIComponent(puzzle.id)}`);

  return {
    title,
    description,
    alternates: {
      canonical: path,
      languages: buildHreflangAlternates(`/puzzles/${encodeURIComponent(puzzle.id)}`),
    },
    openGraph: { title, description, url: path },
  };
}

// Puzzle pages are pure content (personalization is client-side), so they
// render statically. A small seed set is prerendered at build time; the
// remaining ~3000 ids × 4 locales are generated on first request and then
// served from the ISR cache until the next deploy (puzzle content only
// changes via deploys, so the cache stays correct by construction).
const PRERENDERED_PUZZLES = 8;

export async function generateStaticParams(): Promise<Array<{ id: string }>> {
  const { getAllSummaries } = await import("@/content/puzzleSummaries.server");
  return getAllSummaries()
    .slice(0, PRERENDERED_PUZZLES)
    .map((summary) => ({ id: summary.id }));
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
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <TodayClient puzzle={toPublicPuzzle(puzzle)} />
    </div>
  );
}

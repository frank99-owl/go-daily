import { Metadata } from "next";
import { notFound } from "next/navigation";

import { getPuzzle } from "@/content/puzzles";
import { localePath } from "@/lib/i18n/localePath";
import { localized } from "@/lib/i18n/localized";
import { getMessages } from "@/lib/i18n/metadata";
import { serializeJsonLd } from "@/lib/jsonLd";
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
    alternates: { canonical: path },
    openGraph: { title, description, url: path },
  };
}

// Puzzle pages are served via ISR on first hit, then cached until the next
// revalidate window. This keeps cold builds fast.
export async function generateStaticParams() {
  return [];
}

export const dynamicParams = true;

// Rebuild puzzle pages at most once per day in the background.
export const revalidate = 86400;

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
      <TodayClient puzzle={puzzle} />
    </div>
  );
}

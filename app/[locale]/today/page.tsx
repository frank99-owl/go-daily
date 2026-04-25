import { Metadata } from "next";

import { serializeJsonLd } from "@/lib/jsonLd";
import { localePath } from "@/lib/localePath";
import { getMessages } from "@/lib/metadata";
import { getPuzzleForDate, todayLocalKey } from "@/lib/puzzleOfTheDay";
import { absoluteUrl } from "@/lib/siteUrl";
import type { Locale } from "@/types";

import { TodayClient } from "../TodayClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = getMessages(locale);
  const path = localePath(locale, "/today");
  return {
    title: t.metadata.today.title,
    description: t.metadata.today.description,
    alternates: { canonical: path },
    openGraph: {
      title: t.metadata.today.title,
      description: t.metadata.today.description,
      url: path,
    },
  };
}

export default async function TodayPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const today = todayLocalKey();
  const puzzle = await getPuzzleForDate(today);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Today's Puzzle",
    description: "Today's hand-picked Go puzzle on go-daily.",
    url: absoluteUrl(localePath(locale, "/today")),
  };
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 pt-20 pb-8 sm:pt-24 sm:pb-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <TodayClient puzzle={puzzle} metaLabel={today} />
    </div>
  );
}

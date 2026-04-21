import { Metadata } from "next";

import { TodayClient } from "@/app/TodayClient";
import { getPuzzleForDate, todayLocalKey } from "@/lib/puzzleOfTheDay";
import { absoluteUrl } from "@/lib/siteUrl";

export const metadata: Metadata = {
  title: "Today's Puzzle — Go Daily",
  description:
    "Challenge yourself with today's hand-picked Go puzzle and improve your reading with AI coaching.",
  alternates: {
    canonical: "/today",
  },
  openGraph: {
    title: "Today's Puzzle — Go Daily",
    description:
      "Challenge yourself with today's hand-picked Go puzzle and improve your reading with AI coaching.",
    url: "/today",
  },
};

export default async function TodayPage() {
  const today = todayLocalKey();
  const puzzle = await getPuzzleForDate(today);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Today's Puzzle",
    description: "Today's hand-picked Go puzzle on go-daily.",
    url: absoluteUrl("/today"),
  };
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 pt-20 pb-8 sm:pt-24 sm:pb-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <TodayClient puzzle={puzzle} metaLabel={today} />
    </div>
  );
}

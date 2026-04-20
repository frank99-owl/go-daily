import { Metadata } from "next";

import { TodayClient } from "@/app/TodayClient";
import { getPuzzleForDate, todayLocalKey } from "@/lib/puzzleOfTheDay";

export const metadata: Metadata = {
  title: "Today's Puzzle — Go Daily",
  description:
    "Challenge yourself with today's hand-picked Go puzzle and improve your reading with AI coaching.",
};

export default async function TodayPage() {
  const today = todayLocalKey();
  const puzzle = await getPuzzleForDate(today);
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 pt-20 pb-8 sm:pt-24 sm:pb-12">
      <TodayClient puzzle={puzzle} metaLabel={today} />
    </div>
  );
}

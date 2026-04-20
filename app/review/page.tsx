import { Metadata } from "next";

import { getAllSummaries } from "@/content/puzzles";

import { ReviewClient } from "./ReviewClient";

export const metadata: Metadata = {
  title: "Review Your Mistakes — Go Daily",
  description: "Review the puzzles you've missed and master the shapes you find difficult.",
};

export default async function ReviewPage() {
  const summaries = await getAllSummaries();

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 pt-20 pb-8 sm:pt-24 sm:pb-12">
      <ReviewClient summaries={summaries} />
    </div>
  );
}

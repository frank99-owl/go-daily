import { Metadata } from "next";

import { getAllSummaries } from "@/content/puzzles";

import { PuzzleListClient } from "./PuzzleListClient";

export const metadata: Metadata = {
  title: "Go Puzzle Library — Go Daily",
  description:
    "Browse hundreds of life-and-death, tesuji, and endgame puzzles. Filter by difficulty and track your progress.",
};

export default async function PuzzlesPage() {
  const summaries = await getAllSummaries();

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pt-20 pb-8 sm:pt-24 sm:pb-12">
      <PuzzleListClient summaries={summaries} />
    </div>
  );
}

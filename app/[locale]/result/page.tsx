import { notFound } from "next/navigation";
import { Suspense } from "react";

import { getPuzzle } from "@/content/puzzles";
import { toPublicPuzzle } from "@/lib/puzzle/publicPuzzle";
import { getPuzzleForDate, todayLocalKey } from "@/lib/puzzle/puzzleOfTheDay";

import { ResultClient, type ResultSource } from "./ResultClient";

function normalizeResultSource(source: string | undefined): ResultSource {
  return source === "onboarding" ? "onboarding" : "result";
}

export default async function ResultPage(props: {
  searchParams: Promise<{ id?: string; source?: string }>;
}) {
  const searchParams = await props.searchParams;
  const id = searchParams.id;

  if (!id) {
    return notFound();
  }

  const [puzzle, todayPuzzle] = await Promise.all([
    getPuzzle(id),
    getPuzzleForDate(todayLocalKey()),
  ]);

  if (!puzzle) {
    return notFound();
  }

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 pt-20 pb-8 sm:pt-24 sm:pb-12">
      <Suspense fallback={null}>
        <ResultClient
          initialPuzzle={toPublicPuzzle(puzzle)}
          todayPuzzleId={todayPuzzle.id}
          source={normalizeResultSource(searchParams.source)}
        />
      </Suspense>
    </div>
  );
}

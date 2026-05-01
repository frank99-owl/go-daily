import { notFound } from "next/navigation";
import { Suspense } from "react";

import { getPuzzle } from "@/content/puzzles";
import { toPublicPuzzle } from "@/lib/puzzle/publicPuzzle";
import { getPuzzleForDate, todayLocalKey } from "@/lib/puzzle/puzzleOfTheDay";

import { ResultClient } from "./ResultClient";

export default async function ResultPage(props: { searchParams: Promise<{ id?: string }> }) {
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
    <div className="mx-auto max-w-4xl px-4 sm:px-6 pt-20 pb-8 sm:pt-24 sm:pb-12">
      <Suspense fallback={null}>
        <ResultClient initialPuzzle={toPublicPuzzle(puzzle)} todayPuzzleId={todayPuzzle.id} />
      </Suspense>
    </div>
  );
}

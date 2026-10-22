import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { getPuzzle } from "@/content/puzzles";
import { getMessages } from "@/lib/i18n/metadata";
import { parseOnboardingLevel } from "@/lib/puzzle/onboardingLevels";
import { toPublicPuzzle } from "@/lib/puzzle/publicPuzzle";
import { getPuzzleForDate, todayLocalKey } from "@/lib/puzzle/puzzleOfTheDay";
import type { Locale } from "@/types";

import { ResultClient, type ResultSource } from "./ResultClient";

function normalizeResultSource(source: string | undefined): ResultSource {
  return source === "onboarding" ? "onboarding" : "result";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = getMessages(locale);
  return {
    title: t.metadata.result.title,
    description: t.metadata.result.description,
  };
}

// No loading.tsx in this segment, on purpose: a Suspense boundary above the
// notFound() calls below commits a 200 before they run, so a missing or
// unknown id answered as a soft 404. The page only reads bundled puzzle data.
export default async function ResultPage(props: {
  searchParams: Promise<{ id?: string; source?: string; level?: string }>;
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
          onboardingLevel={parseOnboardingLevel(searchParams.level) ?? undefined}
        />
      </Suspense>
    </div>
  );
}

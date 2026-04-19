import { notFound } from "next/navigation";
import { getPuzzleById, PUZZLES } from "@/content/puzzles";
import { TodayClient } from "@/app/TodayClient";

interface Props {
  params: Promise<{ id: string }>;
}

export function generateStaticParams() {
  return PUZZLES.map((p) => ({ id: p.id }));
}

export default async function PuzzleDetailPage({ params }: Props) {
  const { id } = await params;
  const puzzle = getPuzzleById(decodeURIComponent(id));
  if (!puzzle) notFound();

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8 sm:py-12">
      <TodayClient puzzle={puzzle} />
    </div>
  );
}

import { getPuzzleForDate, todayLocalKey } from "@/lib/puzzleOfTheDay";
import { TodayClient } from "@/app/TodayClient";

export default function TodayPage() {
  const puzzle = getPuzzleForDate(todayLocalKey());
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 pt-20 pb-8 sm:pt-24 sm:pb-12">
      <TodayClient puzzle={puzzle} />
    </div>
  );
}

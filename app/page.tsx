import { getPuzzleForDate, todayLocalKey } from "@/lib/puzzleOfTheDay";
import { TodayClient } from "./TodayClient";

export default function Home() {
  const puzzle = getPuzzleForDate(todayLocalKey());
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8 sm:py-12">
      <TodayClient puzzle={puzzle} />
    </div>
  );
}

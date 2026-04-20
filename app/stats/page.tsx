import { Metadata } from "next";

import { StatsClient } from "./StatsClient";

export const metadata: Metadata = {
  title: "Your Progress & Stats — Go Daily",
  description: "View your Go puzzle solving streak, accuracy, and detailed progress statistics.",
};

export default function StatsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 pt-20 pb-8 sm:pt-24 sm:pb-12">
      <StatsClient />
    </div>
  );
}

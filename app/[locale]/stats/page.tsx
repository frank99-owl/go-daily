import { Metadata } from "next";

import { localePath } from "@/lib/localePath";
import { getMessages } from "@/lib/metadata";
import type { Locale } from "@/types";

import { StatsClient } from "./StatsClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = getMessages(locale);
  const path = localePath(locale, "/stats");
  return {
    title: t.metadata.stats.title,
    description: t.metadata.stats.description,
    alternates: { canonical: path },
    openGraph: {
      title: t.metadata.stats.title,
      description: t.metadata.stats.description,
      url: path,
    },
  };
}

export default function StatsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 pt-20 pb-8 sm:pt-24 sm:pb-12">
      <StatsClient />
    </div>
  );
}

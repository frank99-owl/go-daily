import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getMessages } from "@/lib/i18n/metadata";
import type { Locale } from "@/types";

// Lowest-priority catch-all: unmatched localized URLs land here so the
// localized app/[locale]/not-found.tsx boundary renders (with nav, footer,
// and translations) instead of Next's bare default 404 document.
//
// The status only comes out as a real 404 if nothing has been flushed before
// notFound() runs, so this segment must not sit under a loading.tsx: a
// Suspense boundary above it commits the response as 200 first. There is no
// app/[locale]/loading.tsx for that reason — the segments that need one
// declare it themselves.
export const dynamic = "force-dynamic";

// not-found.tsx is a client component and cannot export metadata, so the
// title has to come from here. Without it the 404 inherits the site default
// and reads like an ordinary page.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = getMessages(locale);
  return {
    title: t.metadata.notFound.title,
    description: t.metadata.notFound.description,
    robots: { index: false, follow: false },
  };
}

export default function CatchAllNotFound(): never {
  notFound();
}

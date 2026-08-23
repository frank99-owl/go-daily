import { notFound } from "next/navigation";

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

export default function CatchAllNotFound(): never {
  notFound();
}

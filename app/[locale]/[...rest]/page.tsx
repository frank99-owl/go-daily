import { notFound } from "next/navigation";

// Lowest-priority catch-all: unmatched localized URLs land here so the
// localized app/[locale]/not-found.tsx boundary renders (with nav, footer,
// and translations) instead of Next's bare default 404 document.
//
// force-static keeps the response from streaming through loading.tsx, so the
// HTTP status is a real 404 instead of a soft 200.
export const dynamic = "force-static";

export function generateStaticParams(): Array<{ rest: string[] }> {
  return [{ rest: ["__not-found__"] }];
}

export default function CatchAllNotFound(): never {
  notFound();
}

import type { Metadata } from "next";

import { localePath } from "@/lib/i18n/localePath";
import type { Locale } from "@/types";

import { getLegalCopy, LEGAL_PATHS, type LegalKind } from "./_content";

export async function buildLegalMetadata({
  params,
  kind,
}: {
  params: Promise<{ locale: Locale }>;
  kind: LegalKind;
}): Promise<Metadata> {
  const { locale } = await params;
  const copy = getLegalCopy(locale, kind);
  const path = localePath(locale, LEGAL_PATHS[kind]);

  return {
    title: `${copy.title} — go-daily`,
    description: copy.description,
    alternates: { canonical: path },
    openGraph: {
      title: `${copy.title} — go-daily`,
      description: copy.description,
      url: path,
    },
  };
}

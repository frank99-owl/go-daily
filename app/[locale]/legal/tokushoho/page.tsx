import type { Locale } from "@/types";

import { buildLegalMetadata } from "../_metadata";
import { LegalPage } from "../LegalPage";

export function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }) {
  return buildLegalMetadata({ params, kind: "tokushoho" });
}

export default async function TokushohoPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  return <LegalPage locale={locale} kind="tokushoho" />;
}

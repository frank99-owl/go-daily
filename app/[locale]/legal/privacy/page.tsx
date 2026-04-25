import type { Locale } from "@/types";

import { buildLegalMetadata } from "../_metadata";
import { LegalPage } from "../LegalPage";

export function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }) {
  return buildLegalMetadata({ params, kind: "privacy" });
}

export default async function PrivacyPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  return <LegalPage locale={locale} kind="privacy" />;
}

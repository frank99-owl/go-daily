import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AuthRedirectBridge } from "@/components/AuthRedirectBridge";
import { ClientInit } from "@/components/ClientInit";
import { Nav } from "@/components/Nav";
import { getAllSummaries } from "@/content/puzzles";
import { LocaleProvider } from "@/lib/i18n";
import { isLocale, SUPPORTED_LOCALES } from "@/lib/localePath";
import type { Locale } from "@/types";

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;

  const summaries = await getAllSummaries();
  const puzzleIds = summaries.map((s) => s.id);

  return (
    <LocaleProvider initialLocale={locale}>
      <Suspense fallback={null}>
        <AuthRedirectBridge />
      </Suspense>
      <ClientInit />
      <Nav puzzleIds={puzzleIds} />
      <main className="flex-1 w-full">{children}</main>
    </LocaleProvider>
  );
}

import { Metadata } from "next";
import dynamic from "next/dynamic";

import { HeroSection } from "@/components/HeroSection";
import { HomeLoginReminder } from "@/components/HomeLoginReminder";
import { localePath } from "@/lib/i18n/localePath";
import { getMessages } from "@/lib/i18n/metadata";
import { serializeJsonLd } from "@/lib/jsonLd";
import { absoluteUrl, buildHreflangAlternates } from "@/lib/siteUrl";
import type { Locale } from "@/types";

const BoardShowcase = dynamic(() =>
  import("@/components/BoardShowcase").then((m) => m.BoardShowcase),
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = getMessages(locale);
  const path = localePath(locale, "/");
  return {
    title: t.metadata.home.title,
    description: t.metadata.home.description,
    alternates: { canonical: path, languages: buildHreflangAlternates("/") },
    openGraph: {
      title: t.metadata.home.title,
      description: t.metadata.home.description,
      url: path,
    },
  };
}

export default async function Home({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const siteUrl = absoluteUrl(localePath(locale, "/"));
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "go-daily",
      description: "Daily Go puzzles with Socratic AI coaching.",
      url: siteUrl,
      applicationCategory: "EducationalApplication",
      operatingSystem: "Web",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "go-daily",
      url: siteUrl,
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${siteUrl}puzzles?q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "go-daily",
      url: siteUrl,
    },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <HomeLoginReminder />
      <HeroSection />
      <BoardShowcase />
    </>
  );
}

import { Metadata } from "next";

import { BoardShowcase } from "@/components/BoardShowcase";
import { HeroSection } from "@/components/HeroSection";
import { HomeLoginReminder } from "@/components/HomeLoginReminder";
import { serializeJsonLd } from "@/lib/jsonLd";
import { localePath } from "@/lib/localePath";
import { getMessages } from "@/lib/metadata";
import { absoluteUrl } from "@/lib/siteUrl";
import type { Locale } from "@/types";

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
    alternates: { canonical: path },
    openGraph: {
      title: t.metadata.home.title,
      description: t.metadata.home.description,
      url: path,
    },
  };
}

export default async function Home({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "go-daily",
    description: "Daily Go puzzles with Socratic AI coaching.",
    url: absoluteUrl(localePath(locale, "/")),
    applicationCategory: "EducationalApplication",
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
  };

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

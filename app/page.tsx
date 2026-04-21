import { Metadata } from "next";

import { BoardShowcase } from "@/components/BoardShowcase";
import { HeroSection } from "@/components/HeroSection";
import { absoluteUrl } from "@/lib/siteUrl";

export const metadata: Metadata = {
  title: "go-daily — Daily Go Puzzle with AI Coach",
  description:
    "Master Go (Weiqi/Baduk) with one hand-picked puzzle a day. Socratic AI coaching helps you understand the 'why', not just the 'where'. Available in English, Chinese, Japanese, and Korean.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "go-daily — Daily Go Puzzle with AI Coach",
    description:
      "Master Go with one hand-picked puzzle a day and Socratic AI coaching in four languages.",
    url: "/",
  },
};

export default function Home() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "go-daily",
    description: "Daily Go puzzles with Socratic AI coaching.",
    url: absoluteUrl("/"),
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <HeroSection />
      <BoardShowcase />
    </>
  );
}

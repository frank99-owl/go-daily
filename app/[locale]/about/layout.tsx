import type { Metadata } from "next";
import type { ReactNode } from "react";

import { localePath } from "@/lib/i18n/localePath";
import { getMessages } from "@/lib/i18n/metadata";
import { buildHreflangAlternates } from "@/lib/siteUrl";
import type { Locale } from "@/types";

// The page is a client component and cannot export metadata, so the segment's
// layout does. Without it the page inherited the site default: an English
// title in every locale and an og:url pointing at the home page.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = getMessages(locale);
  const path = localePath(locale, "/about");
  return {
    title: t.nav.about,
    description: t.about.title,
    alternates: { canonical: path, languages: buildHreflangAlternates("/about") },
    openGraph: {
      title: t.nav.about,
      description: t.about.title,
      url: path,
    },
  };
}

export default function AboutLayout({ children }: { children: ReactNode }) {
  return children;
}

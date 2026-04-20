import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata } from "next";
import { Playfair_Display } from "next/font/google";
import { headers } from "next/headers";

import "./globals.css";
import { GlobalCursor } from "@/components/GlobalCursor";
import { Nav } from "@/components/Nav";
import { getAllSummaries } from "@/content/puzzles";
import { LocaleProvider } from "@/lib/i18n";
import { getSiteUrl } from "@/lib/siteUrl";
import type { Locale } from "@/types";

const playfair = Playfair_Display({
  variable: "--font-headline",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: "go-daily — Daily Go Puzzle with AI Coach",
  description:
    "One Go problem a day, with a Socratic AI coach. Switch between Chinese, English, Japanese, and Korean.",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: getSiteUrl(),
    siteName: "go-daily",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const h = await headers();
  const locale = (h.get("x-locale") ?? "en") as Locale;
  const summaries = await getAllSummaries();
  const puzzleIds = summaries.map((s) => s.id);

  return (
    <html lang={locale} data-locale={locale} className={`${playfair.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-paper text-ink cursor-none">
        <LocaleProvider initialLocale={locale}>
          <Nav puzzleIds={puzzleIds} />
          <main className="flex-1 w-full">{children}</main>
        </LocaleProvider>
        <GlobalCursor />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}

import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata } from "next";
import { headers } from "next/headers";

import "./globals.css";
import { GlobalCursor } from "@/components/GlobalCursor";
import { PostHogProvider } from "@/components/PostHogProvider";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/localePath";
import { getSiteUrl } from "@/lib/siteUrl";
import type { Locale } from "@/types";

const OG_LOCALE_MAP: Record<Locale, string> = {
  zh: "zh_CN",
  en: "en_US",
  ja: "ja_JP",
  ko: "ko_KR",
};

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const rawLocale = h.get("x-locale");
  const locale: Locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

  return {
    metadataBase: new URL(getSiteUrl()),
    title: { template: "%s — go-daily", absolute: "go-daily — Daily Go Puzzle with AI Coach" },
    description:
      "One Go problem a day, with DeepSeek-backed AI coaching. Switch between Chinese, English, Japanese, and Korean.",
    openGraph: {
      type: "website",
      locale: OG_LOCALE_MAP[locale],
      url: getSiteUrl(),
      siteName: "go-daily",
    },
    twitter: {
      card: "summary_large_image",
    },
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      title: "go-daily",
      statusBarStyle: "black-translucent",
    },
    other: {
      "theme-color": "#0a0a0a",
    },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const h = await headers();
  const rawLocale = h.get("x-locale");
  const locale: Locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

  return (
    <html
      lang={locale}
      data-locale={locale}
      data-scroll-behavior="smooth"
      className="h-full antialiased"
    >
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link
          rel="preload"
          href="/fonts/PlayfairDisplay-Latin.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        {locale === "en" && (
          <>
            <link
              rel="preload"
              href="/fonts/PlayfairDisplay-LatinItalic.woff2"
              as="font"
              type="font/woff2"
              crossOrigin="anonymous"
            />
            <link
              rel="preload"
              href="/fonts/Inter-Latin.woff2"
              as="font"
              type="font/woff2"
              crossOrigin="anonymous"
            />
          </>
        )}
        {locale === "zh" && (
          <link
            rel="preload"
            href="/fonts/ZhiMangXing-Hero.woff2"
            as="font"
            type="font/woff2"
            crossOrigin="anonymous"
          />
        )}
      </head>
      <body className="min-h-full flex flex-col bg-paper text-ink cursor-none">
        <PostHogProvider>{children}</PostHogProvider>
        <GlobalCursor />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}

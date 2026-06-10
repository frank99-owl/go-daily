import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import "../globals.css";
import { AuthRedirectBridge } from "@/components/AuthRedirectBridge";
import { ClientInit } from "@/components/ClientInit";
import { Footer } from "@/components/Footer";
import { GlobalCursor } from "@/components/GlobalCursor";
import { Nav } from "@/components/Nav";
import { PostHogProvider } from "@/components/PostHogProvider";
import { LocaleProvider } from "@/lib/i18n/i18n";
import { DEFAULT_LOCALE, isLocale, SUPPORTED_LOCALES } from "@/lib/i18n/localePath";
import { getSiteUrl } from "@/lib/siteUrl";
import type { Locale } from "@/types";

const OG_LOCALE_MAP: Record<Locale, string> = {
  zh: "zh_CN",
  en: "en_US",
  ja: "ja_JP",
  ko: "ko_KR",
};

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : DEFAULT_LOCALE;

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

// This is a root layout (there is no app/layout.tsx): it owns <html>/<body>
// and derives the lang attribute from the [locale] segment instead of the
// middleware-injected x-locale header, so pages under it can be rendered
// statically (SSG/ISR) instead of being forced dynamic by headers().
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
        <PostHogProvider>
          <LocaleProvider initialLocale={locale}>
            <Suspense fallback={null}>
              <AuthRedirectBridge />
            </Suspense>
            <ClientInit />
            <div className="flex flex-col min-h-screen">
              <Nav />
              <main className="flex-1 w-full pb-24 sm:pb-32">{children}</main>
              <Footer />
            </div>
          </LocaleProvider>
        </PostHogProvider>
        <GlobalCursor />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}

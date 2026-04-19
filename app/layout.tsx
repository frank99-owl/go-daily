import type { Metadata } from "next";
import { headers } from "next/headers";
import { Playfair_Display } from "next/font/google";
import "./globals.css";
import { LocaleProvider } from "@/lib/i18n";
import { Nav } from "@/components/Nav";
import { GlobalCursor } from "@/components/GlobalCursor";
import type { Locale } from "@/types";

const playfair = Playfair_Display({
  variable: "--font-headline",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "go-daily — Daily Go Puzzle with AI Coach",
  description:
    "One Go problem a day, with a Socratic AI coach. Switch between Chinese, English, Japanese, and Korean.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const h = await headers();
  const locale = (h.get("x-locale") ?? "en") as Locale;

  return (
    <html lang={locale} data-locale={locale} className={`${playfair.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-paper text-ink cursor-none">
        <LocaleProvider initialLocale={locale}>
          <Nav />
          <main className="flex-1 w-full">{children}</main>
        </LocaleProvider>
        <GlobalCursor />
      </body>
    </html>
  );
}

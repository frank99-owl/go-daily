import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { LocaleProvider } from "@/lib/i18n";
import { Nav } from "@/components/Nav";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "go-daily — Daily Go Puzzle with AI Coach",
  description:
    "One Go problem a day, with a Socratic AI coach. Switch between Chinese, English, Japanese, and Korean.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${playfair.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-paper text-ink">
        <LocaleProvider>
          <Nav />
          <main className="flex-1 w-full">{children}</main>
        </LocaleProvider>
      </body>
    </html>
  );
}

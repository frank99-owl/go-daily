import { Metadata } from "next";
import { cookies } from "next/headers";

import { localePath } from "@/lib/i18n/localePath";
import { getMessages } from "@/lib/i18n/metadata";
import { serializeJsonLd } from "@/lib/jsonLd";
import {
  normalizeOnboardingLevel,
  parseOnboardingLevel,
  type OnboardingLevel,
} from "@/lib/puzzle/onboardingLevels";
import {
  DAILY_PUZZLE_SEED_COOKIE,
  ONBOARDING_LEVEL_COOKIE,
} from "@/lib/puzzle/onboardingPreference";
import { toPublicPuzzle } from "@/lib/puzzle/publicPuzzle";
import { getPuzzleForDate, todayLocalKey } from "@/lib/puzzle/puzzleOfTheDay";
import { absoluteUrl, buildHreflangAlternates } from "@/lib/siteUrl";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import type { Locale } from "@/types";

import { TodayClient } from "../TodayClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = getMessages(locale);
  const path = localePath(locale, "/today");
  return {
    title: t.metadata.today.title,
    description: t.metadata.today.description,
    alternates: { canonical: path, languages: buildHreflangAlternates("/today") },
    openGraph: {
      title: t.metadata.today.title,
      description: t.metadata.today.description,
      url: path,
    },
  };
}

export default async function TodayPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const today = todayLocalKey();
  const cookieStore = await cookies();
  const cookieLevel = normalizeOnboardingLevel(cookieStore.get(ONBOARDING_LEVEL_COOKIE)?.value);
  const dailySeed = cookieStore.get(DAILY_PUZZLE_SEED_COOKIE)?.value;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let accountLevel: OnboardingLevel | null = null;
  if (user?.id) {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("training_level")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) {
      console.error("[today] failed to read training level", {
        userId: user.id,
        message: error.message,
      });
    } else {
      accountLevel = parseOnboardingLevel(
        (profile as { training_level?: string | null } | null)?.training_level,
      );
    }
  }

  const level = accountLevel ?? cookieLevel;
  const viewerKey = user?.id ? `user:${user.id}` : dailySeed ? `device:${dailySeed}` : "global";
  const puzzle = toPublicPuzzle(await getPuzzleForDate(today, { level, viewerKey }));
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Today's Puzzle",
    description: "Today's hand-picked Go puzzle on go-daily.",
    url: absoluteUrl(localePath(locale, "/today")),
  };
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 pt-20 pb-8 sm:pt-24 sm:pb-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <TodayClient puzzle={puzzle} metaLabel={today} dailyLevel={level} showRandomAction />
    </div>
  );
}

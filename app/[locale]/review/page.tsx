import { Metadata } from "next";

import { getAllSummaries } from "@/content/puzzles";
import { getViewerPlan, type ViewerPlan } from "@/lib/entitlements";
import { localePath } from "@/lib/i18n/localePath";
import { getMessages } from "@/lib/i18n/metadata";
import { sanitizeTimeZone, syncAndReadDueSrsItems } from "@/lib/puzzle/reviewSrs";
import type { ReviewSrsItem } from "@/lib/puzzle/reviewSrs";
import { isAuthSessionMissingError } from "@/lib/supabase/authErrors";
import { createClient } from "@/lib/supabase/server";
import type { Locale, PuzzleSummary } from "@/types";

import { ReviewClient } from "./ReviewClient";

export const dynamic = "force-dynamic";

const FREE_REVIEW_LIMIT = 20;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = getMessages(locale);
  const path = localePath(locale, "/review");
  return {
    title: t.metadata.review.title,
    description: t.metadata.review.description,
    alternates: { canonical: path },
    openGraph: {
      title: t.metadata.review.title,
      description: t.metadata.review.description,
      url: path,
    },
  };
}

export default async function ReviewPage() {
  const summaries = await getAllSummaries();
  const reviewState = await getReviewState(summaries);

  return (
    <div className="mx-auto max-w-4xl px-4 pb-8 pt-20 sm:px-6 sm:pb-12 sm:pt-24">
      <ReviewClient
        summaries={summaries}
        viewerPlan={reviewState.viewerPlan}
        srsItems={reviewState.srsItems}
        freeLimit={FREE_REVIEW_LIMIT}
      />
    </div>
  );
}

async function getReviewState(
  summaries: PuzzleSummary[],
): Promise<{ viewerPlan: ViewerPlan; srsItems: ReviewSrsItem[] }> {
  let viewerPlan: ViewerPlan = "guest";

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr && !isAuthSessionMissingError(userErr)) {
      console.error("[review] failed to fetch user", userErr.message);
    }
    if (!user) return { viewerPlan, srsItems: [] };

    const [{ data: subscription, error: subErr }, { data: profile, error: profileErr }] =
      await Promise.all([
        supabase.from("subscriptions").select("status").eq("user_id", user.id).maybeSingle(),
        supabase.from("profiles").select("timezone").eq("user_id", user.id).maybeSingle(),
      ]);

    if (subErr) console.error("[review] failed to read subscription", subErr.message);
    if (profileErr) console.error("[review] failed to read profile", profileErr.message);

    viewerPlan = getViewerPlan({ user, subscriptionStatus: subscription?.status ?? null });
    if (viewerPlan !== "pro") return { viewerPlan, srsItems: [] };

    const timeZone = sanitizeTimeZone(profile?.timezone);
    const srsItems = await syncAndReadDueSrsItems({
      supabase,
      userId: user.id,
      summaries,
      timeZone,
      now: new Date(),
    });
    return { viewerPlan, srsItems };
  } catch (error) {
    console.error("[review] failed to load review state", error);
    return { viewerPlan, srsItems: [] };
  }
}

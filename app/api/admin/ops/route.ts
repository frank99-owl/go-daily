import {
  COACH_BASIC_ELIGIBLE_IDS,
  COACH_READY_IDS,
  COACH_VARIATION_GROUPS,
  CONTENT_REVIEW_BATCHES,
} from "@/content/coachContent";
import { PUZZLES } from "@/content/puzzles.server";
import { createApiResponse } from "@/lib/apiHeaders";
import { checkCoachEligibility } from "@/lib/coach/coachEligibility";
import { isPastDueWithinGrace } from "@/lib/entitlements";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type SubscriptionOpsRow = {
  status?: string | null;
  current_period_end?: string | null;
};

type CoachUsageOpsRow = {
  user_id?: string | null;
  count?: number | null;
};

type StripeEventOpsRow = {
  processed_at?: string | null;
  processing_started_at?: string | null;
  last_error?: string | null;
};

function isAdmin(userId: string | undefined | null): boolean {
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map((id) => id.trim());
  return !!userId && adminIds.includes(userId);
}

async function verifyAdmin() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id || !isAdmin(user.id)) {
    return null;
  }
  return user;
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function yyyyMmDdDaysAgo(days: number): string {
  return isoDaysAgo(days).slice(0, 10);
}

function buildContentOpsSummary() {
  let coachReadyCandidates = 0;
  let mainlineBackfillCandidates = 0;
  let wrongBranchBackfillCandidates = 0;

  for (const puzzle of PUZZLES) {
    const eligibility = checkCoachEligibility(puzzle);
    if (eligibility.qualityTier === "coach-ready") coachReadyCandidates += 1;
    if (eligibility.eligible && (puzzle.solutionSequence?.length ?? 0) === 0) {
      mainlineBackfillCandidates += 1;
    }
    if (
      eligibility.eligible &&
      (puzzle.solutionSequence?.length ?? 0) > 0 &&
      (puzzle.wrongBranches?.length ?? 0) === 0
    ) {
      wrongBranchBackfillCandidates += 1;
    }
  }

  return {
    totalPuzzles: PUZZLES.length,
    coachBasicEligibleCount: COACH_BASIC_ELIGIBLE_IDS.length,
    coachReadyApprovedCount: COACH_READY_IDS.length,
    coachReadyCandidateCount: coachReadyCandidates,
    variationGroupCount: COACH_VARIATION_GROUPS.length,
    variationReadyPuzzleCount: new Set(COACH_VARIATION_GROUPS.flatMap((group) => group.puzzleIds))
      .size,
    mainlineBackfillCandidates,
    wrongBranchBackfillCandidates,
    reviewBatches: CONTENT_REVIEW_BATCHES.map((batch) => ({
      id: batch.id,
      scope: batch.scope,
      status: batch.status,
      puzzleCount: batch.puzzleIds.length,
      updatedAt: batch.updatedAt,
      generatedSolutionContent: batch.generatedSolutionContent,
      requiresHumanReview: batch.requiresHumanReview,
    })),
  };
}

function countByStatus(rows: SubscriptionOpsRow[]): Record<string, number> {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const status = row.status?.trim() || "unknown";
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, {});
}

export async function GET() {
  const user = await verifyAdmin();
  if (!user) {
    return createApiResponse({ error: "forbidden" }, { status: 403 });
  }

  const admin = createServiceClient();
  const since30Day = yyyyMmDdDaysAgo(30);
  const since7DayIso = isoDaysAgo(7);

  const [subscriptions, coachUsage, attempts, devices, stripeEvents] = await Promise.all([
    admin.from("subscriptions").select("status, current_period_end"),
    admin.from("coach_usage").select("user_id, count").gte("day", since30Day),
    admin.from("attempts").select("id").gte("created_at", since7DayIso),
    admin.from("user_devices").select("device_id").gte("last_seen", since7DayIso),
    admin
      .from("stripe_events")
      .select("processed_at, processing_started_at, last_error")
      .order("received_at", { ascending: false })
      .limit(100),
  ]);

  for (const [name, result] of Object.entries({
    subscriptions,
    coachUsage,
    attempts,
    devices,
    stripeEvents,
  })) {
    if (result.error) {
      console.error("[admin/ops] query failed", { name, message: result.error.message });
      return createApiResponse({ error: `${name}_lookup_failed` }, { status: 500 });
    }
  }

  const subscriptionRows = (subscriptions.data ?? []) as SubscriptionOpsRow[];
  const coachUsageRows = (coachUsage.data ?? []) as CoachUsageOpsRow[];
  const stripeEventRows = (stripeEvents.data ?? []) as StripeEventOpsRow[];
  const pastDueRows = subscriptionRows.filter((row) => row.status === "past_due");

  return createApiResponse({
    generatedAt: new Date().toISOString(),
    content: buildContentOpsSummary(),
    coach: {
      usageRowsLast30Days: coachUsageRows.length,
      messagesLast30Days: coachUsageRows.reduce((sum, row) => sum + Number(row.count ?? 0), 0),
      activeUsersLast30Days: new Set(
        coachUsageRows.map((row) => row.user_id).filter((id): id is string => Boolean(id)),
      ).size,
    },
    stripe: {
      subscriptionsByStatus: countByStatus(subscriptionRows),
      pastDueWithinGrace: pastDueRows.filter((row) =>
        isPastDueWithinGrace({ currentPeriodEnd: row.current_period_end }),
      ).length,
      pastDueExpired: pastDueRows.filter(
        (row) => !isPastDueWithinGrace({ currentPeriodEnd: row.current_period_end }),
      ).length,
    },
    webhooks: {
      recentStripeEvents: stripeEventRows.length,
      inProgress: stripeEventRows.filter((row) => row.processing_started_at && !row.processed_at)
        .length,
      failedOpen: stripeEventRows.filter((row) => row.last_error && !row.processed_at).length,
    },
    sync: {
      attemptRowsLast7Days: (attempts.data ?? []).length,
      devicesSeenLast7Days: (devices.data ?? []).length,
    },
  });
}

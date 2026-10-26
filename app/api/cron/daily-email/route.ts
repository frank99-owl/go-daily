import { createApiResponse } from "@/lib/apiHeaders";
import { sendDailyPuzzleEmail } from "@/lib/email";
import { isLocale } from "@/lib/i18n/localePath";
import { getPuzzleForDate, todayLocalKey } from "@/lib/puzzle/puzzleOfTheDay";
import { constantTimeEqual } from "@/lib/secureCompare";
import { createServiceClient } from "@/lib/supabase/service";
import type { Locale } from "@/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 100;

type ProfileEmailRow = {
  user_id: string;
  locale: string | null;
  email_opt_out: boolean | null;
  email_unsubscribe_token: string | null;
  daily_email_last_sent_on: string | null;
};

function parseBatchSize(): number {
  const raw = process.env.EMAIL_CRON_BATCH_SIZE?.trim();
  if (!raw) return DEFAULT_BATCH_SIZE;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_BATCH_SIZE;
  return Math.min(parsed, MAX_BATCH_SIZE);
}

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  return constantTimeEqual(authorization.slice("Bearer ".length), secret);
}

function localeFromProfile(value: string | null | undefined): Locale {
  return isLocale(value) ? value : "en";
}

function markSentToday(
  admin: ReturnType<typeof createServiceClient>,
  userId: string,
  today: string,
) {
  return admin
    .from("profiles")
    .update({ daily_email_last_sent_on: today, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return createApiResponse({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const localeParam = url.searchParams.get("locale");
  const localeFilter = isLocale(localeParam) ? localeParam : null;
  const today = todayLocalKey();
  const batchSize = parseBatchSize();

  const admin = createServiceClient();
  const puzzle = await getPuzzleForDate(today);

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let attempted = 0;

  // Every row is marked sent for today, which drops it from the next select.
  // When that update fails the row still matches, and without this set the loop
  // fetched it again, emailed the same person again, and ran until the function
  // timed out.
  const handled = new Set<string>();

  while (true) {
    let profileQuery = admin
      .from("profiles")
      .select("user_id, locale, email_opt_out, email_unsubscribe_token, daily_email_last_sent_on")
      .eq("email_opt_out", false)
      // fetch users whose sent date is NOT today (using or filter for null or diff date)
      .or(`daily_email_last_sent_on.is.null,daily_email_last_sent_on.neq.${today}`)
      .limit(batchSize);

    if (localeFilter) {
      profileQuery = profileQuery.eq("locale", localeFilter);
    }

    const { data, error } = await profileQuery;
    if (error) {
      console.error("[cron/daily-email] profile query failed", { message: error.message });
      return createApiResponse({ error: "profile_query_failed" }, { status: 500 });
    }

    const profiles = ((data ?? []) as ProfileEmailRow[]).filter(
      (profile) => !handled.has(profile.user_id),
    );
    if (profiles.length === 0) break;

    for (const profile of profiles) {
      handled.add(profile.user_id);

      if (profile.daily_email_last_sent_on === today || profile.email_opt_out) {
        // Belt-and-suspenders: if DB filter slipped, we must still update the row
        // to drop it from the query and prevent an infinite loop.
        await markSentToday(admin, profile.user_id, today);
        continue;
      }

      attempted += 1;

      const { data: userData, error: userError } = await admin.auth.admin.getUserById(
        profile.user_id,
      );
      const email = userData.user?.email;
      if (userError || !email) {
        skipped += 1;
        // Marked like any other row, or it holds a place in every later batch.
        await markSentToday(admin, profile.user_id, today);
        continue;
      }

      const result = await sendDailyPuzzleEmail({
        to: email,
        locale: localeFromProfile(profile.locale),
        puzzle,
        unsubscribeToken: profile.email_unsubscribe_token,
      });

      if (!result.sent) {
        if (result.reason === "not_configured") skipped += 1;
        else failed += 1;
        // Even if failed, we should probably mark it to avoid infinite loops, but we'll
        // mark it failed later. For now, mark it sent to advance the batch.
      }

      const { error: updateError } = await markSentToday(admin, profile.user_id, today);

      if (updateError) {
        failed += 1;
        console.warn("[cron/daily-email] failed to mark profile sent", {
          userId: profile.user_id,
          message: updateError.message,
        });
        continue;
      }

      if (result.sent) sent += 1;
    }
  }

  return createApiResponse({
    ok: true,
    date: today,
    locale: localeFilter,
    attempted,
    sent,
    skipped,
    failed,
  });
}

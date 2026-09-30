/**
 * The columns `scripts/productionPreflight.ts --check-remote` expects in the
 * production Supabase database.
 *
 * Migrations in `supabase/migrations/` are applied to production by hand, and
 * in 2026-09 two of them (0008, 0009) turned out never to have been applied.
 * The remote check could not notice the missing `profiles.training_level`
 * column because this list had not been updated when 0008 added it.
 * `tests/scripts/supabaseSchema.test.ts` now derives the columns from the
 * migrations and fails when this list falls behind them.
 */
export const EXPECTED_SUPABASE_COLUMNS: Record<string, string[]> = {
  profiles: [
    "user_id",
    "locale",
    "timezone",
    "kyu_rank",
    "display_name",
    "email_opt_out",
    "deleted_at",
    "created_at",
    "updated_at",
    "welcome_email_sent_at",
    "daily_email_last_sent_on",
    "email_unsubscribe_token",
    "training_level",
  ],
  attempts: [
    "id",
    "user_id",
    "puzzle_id",
    "date",
    "user_move_x",
    "user_move_y",
    "correct",
    "duration_ms",
    "client_solved_at_ms",
    "created_at",
  ],
  coach_usage: ["user_id", "day", "count"],
  guest_coach_usage: ["device_id", "day", "count", "created_at"],
  subscriptions: [
    "user_id",
    "stripe_customer_id",
    "stripe_subscription_id",
    "plan",
    "status",
    "current_period_end",
    "cancel_at_period_end",
    "trial_end",
    "updated_at",
    "first_paid_at",
    "coach_anchor_day",
  ],
  srs_cards: [
    "user_id",
    "puzzle_id",
    "ease_factor",
    "interval_days",
    "due_date",
    "last_reviewed_at",
  ],
  stripe_events: [
    "id",
    "event_type",
    "received_at",
    "processed_at",
    "processing_started_at",
    "last_error",
  ],
  user_devices: ["user_id", "device_id", "first_seen", "last_seen", "user_agent"],
  manual_grants: ["email", "expires_at", "granted_by", "created_at"],
};

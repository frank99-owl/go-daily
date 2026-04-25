#!/usr/bin/env tsx
import fs from "node:fs";

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import Stripe from "stripe";

config({ path: ".env.local", quiet: true });

type Status = "PASS" | "WARN" | "FAIL";
type Check = { status: Status; label: string; detail?: string };

const checks: Check[] = [];

const REQUIRED_ENV = [
  ["DEEPSEEK_API_KEY", "AI Coach provider key"],
  ["NEXT_PUBLIC_SITE_URL", "canonical production URL"],
  ["NEXT_PUBLIC_SUPABASE_URL", "Supabase project URL"],
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "Supabase browser publishable key"],
  ["SUPABASE_SERVICE_ROLE_KEY", "Supabase server secret key"],
  ["NEXT_PUBLIC_POSTHOG_KEY", "PostHog project API key"],
  ["NEXT_PUBLIC_SENTRY_DSN", "Sentry DSN"],
  ["STRIPE_SECRET_KEY", "Stripe server secret key"],
  ["STRIPE_WEBHOOK_SECRET", "Stripe webhook signing secret"],
  ["STRIPE_PRO_MONTHLY_PRICE_ID", "Stripe monthly Price ID"],
  ["STRIPE_PRO_YEARLY_PRICE_ID", "Stripe yearly Price ID"],
  ["RESEND_API_KEY", "Resend server API key"],
  ["EMAIL_FROM", "verified sender address"],
  ["CRON_SECRET", "daily email cron bearer token"],
] as const;

const OPTIONAL_DEFAULTS = [
  ["NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com"],
  ["COACH_MODEL", "deepseek-chat"],
  ["STRIPE_TRIAL_DAYS", "7"],
  ["NEXT_PUBLIC_ENABLE_EMAIL_LOGIN", "false"],
  ["EMAIL_CRON_BATCH_SIZE", "50"],
] as const;

const SERVER_ONLY_ENV = [
  "DEEPSEEK_API_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRO_MONTHLY_PRICE_ID",
  "STRIPE_PRO_YEARLY_PRICE_ID",
  "RESEND_API_KEY",
  "CRON_SECRET",
] as const;

const PUBLIC_SECRET_PATTERNS = [
  /sk_(live|test)_/i,
  /whsec_/i,
  /re_[a-z0-9]/i,
  /sb_secret_/i,
  /service_role/i,
];

const EXPECTED_SUPABASE_COLUMNS: Record<string, string[]> = {
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
};

function argValue(name: string): string | null {
  const prefix = `${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function hasArg(name: string): boolean {
  return process.argv.slice(2).includes(name);
}

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function isFilled(name: string): boolean {
  return env(name).length > 0;
}

function add(status: Status, label: string, detail?: string): void {
  checks.push({ status, label, detail });
}

function pass(label: string, detail?: string): void {
  add("PASS", label, detail);
}

function warn(label: string, detail?: string): void {
  add("WARN", label, detail);
}

function fail(label: string, detail?: string): void {
  add("FAIL", label, detail);
}

function isPlaceholder(value: string): boolean {
  return /^(todo|tbd|changeme|change-me|placeholder|your_|xxx+|example)$/i.test(value);
}

function validateUrl(name: string, { requireHttps }: { requireHttps: boolean }): void {
  const value = env(name);
  if (!value) return;
  try {
    const parsed = new URL(value);
    if (requireHttps && parsed.protocol !== "https:") {
      fail(`${name} must use https in production`);
      return;
    }
    pass(`${name} is a valid URL`);
  } catch {
    fail(`${name} must be a valid URL`);
  }
}

function validateEnvironment(stripeMode: string): void {
  if (!fs.existsSync(".env.local")) {
    warn(".env.local not found", "Run `vercel env pull .env.local` or copy `.env.example`.");
  } else {
    pass(".env.local exists");
  }

  for (const [name, description] of REQUIRED_ENV) {
    const value = env(name);
    if (!value) {
      fail(`${name} is set`, description);
    } else if (isPlaceholder(value)) {
      fail(`${name} is not a placeholder`, description);
    } else {
      pass(`${name} is set`, description);
    }
  }

  for (const [name, defaultValue] of OPTIONAL_DEFAULTS) {
    if (isFilled(name)) pass(`${name} is set`);
    else warn(`${name} is not set`, `App default is ${defaultValue}.`);
  }

  validateUrl("NEXT_PUBLIC_SITE_URL", { requireHttps: true });
  validateUrl("NEXT_PUBLIC_SUPABASE_URL", { requireHttps: true });
  validateUrl("NEXT_PUBLIC_POSTHOG_HOST", { requireHttps: true });
  validateUrl("NEXT_PUBLIC_SENTRY_DSN", { requireHttps: true });

  if (
    isFilled("NEXT_PUBLIC_SUPABASE_URL") &&
    !/\.supabase\.(co|in)$/.test(env("NEXT_PUBLIC_SUPABASE_URL"))
  ) {
    warn("NEXT_PUBLIC_SUPABASE_URL does not look like a hosted Supabase URL");
  }

  const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (anonKey.startsWith("sb_secret_")) {
    fail("NEXT_PUBLIC_SUPABASE_ANON_KEY is not a secret key");
  } else if (anonKey) {
    pass("NEXT_PUBLIC_SUPABASE_ANON_KEY does not use the secret-key prefix");
  }

  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceKey.startsWith("sb_publishable_")) {
    fail("SUPABASE_SERVICE_ROLE_KEY is not a publishable key");
  } else if (serviceKey) {
    pass("SUPABASE_SERVICE_ROLE_KEY does not use the publishable-key prefix");
  }

  const stripeSecret = env("STRIPE_SECRET_KEY");
  if (stripeSecret) {
    if (!/^sk_(live|test)_/.test(stripeSecret)) {
      fail("STRIPE_SECRET_KEY has a Stripe secret-key prefix");
    } else if (stripeMode === "live" && !stripeSecret.startsWith("sk_live_")) {
      fail("STRIPE_SECRET_KEY is live mode", "Use `--stripe-mode=test` for sandbox preflight.");
    } else if (stripeMode === "test" && !stripeSecret.startsWith("sk_test_")) {
      fail("STRIPE_SECRET_KEY is test mode", "Use `--stripe-mode=live` for production preflight.");
    } else {
      pass("STRIPE_SECRET_KEY mode matches preflight mode");
    }
  }

  if (isFilled("STRIPE_WEBHOOK_SECRET")) {
    if (env("STRIPE_WEBHOOK_SECRET").startsWith("whsec_"))
      pass("STRIPE_WEBHOOK_SECRET has whsec_ prefix");
    else fail("STRIPE_WEBHOOK_SECRET has whsec_ prefix");
  }

  for (const name of ["STRIPE_PRO_MONTHLY_PRICE_ID", "STRIPE_PRO_YEARLY_PRICE_ID"]) {
    if (!isFilled(name)) continue;
    if (env(name).startsWith("price_")) pass(`${name} has price_ prefix`);
    else fail(`${name} has price_ prefix`);
  }

  if (isFilled("RESEND_API_KEY")) {
    if (env("RESEND_API_KEY").startsWith("re_")) pass("RESEND_API_KEY has re_ prefix");
    else warn("RESEND_API_KEY does not have the usual re_ prefix");
  }

  if (isFilled("EMAIL_FROM")) {
    if (env("EMAIL_FROM").includes("@")) pass("EMAIL_FROM contains an email address");
    else fail("EMAIL_FROM contains an email address");
  }

  if (isFilled("CRON_SECRET")) {
    if (env("CRON_SECRET").length >= 24) pass("CRON_SECRET length is reasonable");
    else warn("CRON_SECRET should be at least 24 characters");
  }

  const trialDays = env("STRIPE_TRIAL_DAYS");
  if (trialDays) {
    const parsed = Number.parseInt(trialDays, 10);
    if (!Number.isFinite(parsed) || parsed < 0) fail("STRIPE_TRIAL_DAYS is a non-negative integer");
    else pass("STRIPE_TRIAL_DAYS is a non-negative integer");
  }

  const batchSize = env("EMAIL_CRON_BATCH_SIZE");
  if (batchSize) {
    const parsed = Number.parseInt(batchSize, 10);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100) {
      fail("EMAIL_CRON_BATCH_SIZE is between 1 and 100");
    } else {
      pass("EMAIL_CRON_BATCH_SIZE is between 1 and 100");
    }
  }

  if (env("NEXT_PUBLIC_ENABLE_EMAIL_LOGIN") === "true") {
    warn(
      "NEXT_PUBLIC_ENABLE_EMAIL_LOGIN is true",
      "Only keep this on after Resend DNS and Supabase Auth SMTP delivery are verified.",
    );
  }

  for (const name of SERVER_ONLY_ENV) {
    if (name.startsWith("NEXT_PUBLIC_")) {
      fail(`${name} is not server-only`);
    }
  }

  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith("NEXT_PUBLIC_") || !value) continue;
    if (PUBLIC_SECRET_PATTERNS.some((pattern) => pattern.test(value))) {
      fail(`${name} appears to contain a server secret`, "Remove this from public env.");
    }
  }
}

async function checkSupabaseRemote(skipRemote: boolean): Promise<void> {
  const hasSupabase =
    isFilled("NEXT_PUBLIC_SUPABASE_URL") &&
    isFilled("NEXT_PUBLIC_SUPABASE_ANON_KEY") &&
    isFilled("SUPABASE_SERVICE_ROLE_KEY");

  if (!hasSupabase) {
    warn("Supabase remote check skipped", "Supabase env vars are incomplete.");
    return;
  }
  if (skipRemote) {
    warn("Supabase remote check skipped", "--skip-remote was provided.");
    return;
  }

  try {
    const settingsRes = await fetch(`${env("NEXT_PUBLIC_SUPABASE_URL")}/auth/v1/settings`, {
      headers: { apikey: env("NEXT_PUBLIC_SUPABASE_ANON_KEY") },
    });
    if (!settingsRes.ok) {
      fail(
        "Supabase publishable key is accepted",
        `auth settings returned HTTP ${settingsRes.status}.`,
      );
    } else {
      pass("Supabase publishable key is accepted");
    }
  } catch (error) {
    fail("Supabase auth settings endpoint is reachable", errorMessage(error));
  }

  const admin = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  for (const [table, columns] of Object.entries(EXPECTED_SUPABASE_COLUMNS)) {
    const { error } = await admin.from(table).select(columns.join(",")).limit(0);
    if (error) {
      fail(`Supabase table/columns exist: ${table}`, error.message);
    } else {
      pass(`Supabase table/columns exist: ${table}`);
    }
  }
}

async function checkStripeRemote(skipRemote: boolean): Promise<void> {
  const hasStripe =
    isFilled("STRIPE_SECRET_KEY") &&
    isFilled("STRIPE_PRO_MONTHLY_PRICE_ID") &&
    isFilled("STRIPE_PRO_YEARLY_PRICE_ID");

  if (!hasStripe) {
    warn("Stripe remote price check skipped", "Stripe env vars are incomplete.");
    return;
  }
  if (skipRemote) {
    warn("Stripe remote price check skipped", "--skip-remote was provided.");
    return;
  }

  const stripe = new Stripe(env("STRIPE_SECRET_KEY"), {
    apiVersion: "2026-03-25.dahlia",
  });

  try {
    const [monthly, yearly] = await Promise.all([
      stripe.prices.retrieve(env("STRIPE_PRO_MONTHLY_PRICE_ID")),
      stripe.prices.retrieve(env("STRIPE_PRO_YEARLY_PRICE_ID")),
    ]);

    checkPrice(monthly, "monthly", "month");
    checkPrice(yearly, "yearly", "year");

    if (monthly.currency !== yearly.currency) {
      warn("Stripe monthly/yearly prices use the same currency");
    } else {
      pass("Stripe monthly/yearly prices use the same currency");
    }
  } catch (error) {
    fail("Stripe prices are retrievable", errorMessage(error));
  }
}

function checkPrice(price: Stripe.Price, label: string, interval: "month" | "year"): void {
  if (price.active) pass(`Stripe ${label} price is active`);
  else fail(`Stripe ${label} price is active`);

  if (price.type === "recurring") pass(`Stripe ${label} price is recurring`);
  else fail(`Stripe ${label} price is recurring`);

  if (price.recurring?.interval === interval) pass(`Stripe ${label} price interval is ${interval}`);
  else fail(`Stripe ${label} price interval is ${interval}`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function printSummary(): void {
  const counts = {
    PASS: checks.filter((check) => check.status === "PASS").length,
    WARN: checks.filter((check) => check.status === "WARN").length,
    FAIL: checks.filter((check) => check.status === "FAIL").length,
  };

  console.log("\ngo-daily production preflight");
  console.log("No secret values are printed by this script.\n");

  for (const check of checks) {
    const suffix = check.detail ? ` - ${check.detail}` : "";
    console.log(`[${check.status}] ${check.label}${suffix}`);
  }

  console.log(`\nSummary: ${counts.PASS} pass, ${counts.WARN} warn, ${counts.FAIL} fail`);
  if (counts.FAIL > 0) {
    console.log("Result: NOT READY");
    process.exit(1);
  }
  console.log("Result: READY FOR DASHBOARD / PRODUCTION SMOKE CHECKS");
}

async function main(): Promise<void> {
  const stripeMode = argValue("--stripe-mode") ?? "live";
  if (!["live", "test", "any"].includes(stripeMode)) {
    fail("--stripe-mode must be live, test, or any");
  }

  const skipRemote = hasArg("--skip-remote");

  validateEnvironment(stripeMode);
  await checkSupabaseRemote(skipRemote);
  await checkStripeRemote(skipRemote);
  printSummary();
}

main().catch((error) => {
  fail("preflight crashed", errorMessage(error));
  printSummary();
});

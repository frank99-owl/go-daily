/**
 * Centralized environment variable validation.
 *
 * Each domain accessor validates its own env vars lazily on first call,
 * so missing variables surface as clear startup-style errors rather than
 * silent 500s deep in a route handler.
 *
 * NOTE: This module must only be imported on the server.
 */
import { z } from "zod";

if (typeof window !== "undefined") {
  throw new Error("lib/env.ts must only be imported on the server.");
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function required(varName: string) {
  return z.string().min(1, `${varName} is not set. Check your .env.local file.`);
}

function optionalDefault(defaultValue: string) {
  return z.string().optional().default(defaultValue);
}

// ---------------------------------------------------------------------------
// Domain schemas
// ---------------------------------------------------------------------------

const coachSchema = z.object({
  DEEPSEEK_API_KEY: required("DEEPSEEK_API_KEY"),
  COACH_MODEL: optionalDefault("deepseek-chat"),
  COACH_API_URL: optionalDefault("https://api.deepseek.com"),
});

const stripeSchema = z.object({
  STRIPE_SECRET_KEY: required("STRIPE_SECRET_KEY"),
  STRIPE_WEBHOOK_SECRET: required("STRIPE_WEBHOOK_SECRET"),
  STRIPE_PRO_MONTHLY_PRICE_ID: required("STRIPE_PRO_MONTHLY_PRICE_ID"),
  STRIPE_PRO_YEARLY_PRICE_ID: required("STRIPE_PRO_YEARLY_PRICE_ID"),
  STRIPE_TRIAL_DAYS: optionalDefault("7"),
});

const supabaseSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: required("NEXT_PUBLIC_SUPABASE_URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  SUPABASE_SERVICE_ROLE_KEY: required("SUPABASE_SERVICE_ROLE_KEY"),
});

const revealSchema = z.object({
  PUZZLE_REVEAL_SECRET: required("PUZZLE_REVEAL_SECRET"),
});

// ---------------------------------------------------------------------------
// Lazy-validated singletons
// ---------------------------------------------------------------------------

type CoachEnv = z.infer<typeof coachSchema>;
type StripeEnv = z.infer<typeof stripeSchema>;
type SupabaseEnv = z.infer<typeof supabaseSchema>;
type RevealEnv = z.infer<typeof revealSchema>;

let _coach: CoachEnv | null = null;
let _stripe: StripeEnv | null = null;
let _supabase: SupabaseEnv | null = null;
let _reveal: RevealEnv | null = null;

function pickEnv(keys: string[]): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const k of keys) out[k] = process.env[k];
  return out;
}

export function getCoachEnv(): CoachEnv {
  if (!_coach) {
    _coach = coachSchema.parse(pickEnv(["DEEPSEEK_API_KEY", "COACH_MODEL", "COACH_API_URL"]));
  }
  return _coach;
}

export function getStripeEnv(): StripeEnv {
  if (!_stripe) {
    _stripe = stripeSchema.parse(
      pickEnv([
        "STRIPE_SECRET_KEY",
        "STRIPE_WEBHOOK_SECRET",
        "STRIPE_PRO_MONTHLY_PRICE_ID",
        "STRIPE_PRO_YEARLY_PRICE_ID",
        "STRIPE_TRIAL_DAYS",
      ]),
    );
  }
  return _stripe;
}

export function getSupabaseEnv(): SupabaseEnv {
  if (!_supabase) {
    _supabase = supabaseSchema.parse(
      pickEnv([
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
      ]),
    );
  }
  return _supabase;
}

export function getRevealEnv(): RevealEnv {
  if (!_reveal) {
    _reveal = revealSchema.parse(pickEnv(["PUZZLE_REVEAL_SECRET"]));
  }
  return _reveal;
}

/**
 * Reset cached env values. Only useful in tests.
 */
export function _resetEnvCache() {
  _coach = null;
  _stripe = null;
  _supabase = null;
  _reveal = null;
}

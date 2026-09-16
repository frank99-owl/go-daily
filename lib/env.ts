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
  // Total generation budget for one coach reply. On a reasoning model this
  // budget covers the hidden reasoning AND the visible answer, so it is not a
  // length cap — the system prompt ("2–4 short paragraphs") controls length.
  // It was a hardcoded 400 until 2026-09, which a reasoning model spends
  // entirely on reasoning: finish_reason "length", zero content, and an empty
  // reply on exactly the analysis questions students pay for. Measured on
  // deepseek-v4-flash, a simple "where should I have played?" used 637
  // reasoning tokens before its first visible one. On a non-reasoning model
  // (the deepseek-chat default) this is only a ceiling and costs nothing unused.
  COACH_MAX_TOKENS: z.coerce.number().int().min(256).max(16000).default(2000),
  // DeepSeek's thinking switch, sent as `thinking: { type }`. When unset, the
  // provider sends "disabled" to api.deepseek.com and nothing to any other
  // host — see resolveThinking in lib/coach/coachProvider.ts. Set "enabled"
  // only on purpose: the prompt already carries the accepted answer, the wrong
  // branches and the solution note, so hidden reasoning mostly re-derives
  // ground truth. Measured on deepseek-v4-flash with thinking on, "why was my
  // move wrong?" took 1.5k–2k+ reasoning tokens and ~10s, and DeepSeek
  // documents that thinking mode ignores `temperature`.
  COACH_THINKING: z.enum(["enabled", "disabled"]).optional(),
});

const stripeSchema = z.object({
  STRIPE_SECRET_KEY: required("STRIPE_SECRET_KEY"),
  STRIPE_WEBHOOK_SECRET: required("STRIPE_WEBHOOK_SECRET"),
  STRIPE_PRO_MONTHLY_PRICE_ID: required("STRIPE_PRO_MONTHLY_PRICE_ID"),
  STRIPE_PRO_YEARLY_PRICE_ID: required("STRIPE_PRO_YEARLY_PRICE_ID"),
  STRIPE_TRIAL_DAYS: optionalDefault("3"),
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
    _coach = coachSchema.parse(
      pickEnv([
        "DEEPSEEK_API_KEY",
        "COACH_MODEL",
        "COACH_API_URL",
        "COACH_MAX_TOKENS",
        "COACH_THINKING",
      ]),
    );
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

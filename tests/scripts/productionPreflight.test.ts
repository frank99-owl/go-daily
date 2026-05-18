/**
 * @vitest-environment node
 */
import { spawnSync } from "node:child_process";
import path from "node:path";

import { describe, expect, it } from "vitest";

const safeEnv = {
  DEEPSEEK_API_KEY: "deepseek-test-key",
  PUZZLE_REVEAL_SECRET: "local-preflight-secret-1234567890",
  NEXT_PUBLIC_SITE_URL: "https://go-daily.app",
  NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_test",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
  NEXT_PUBLIC_POSTHOG_KEY: "phc_test",
  NEXT_PUBLIC_SENTRY_DSN: "https://sentry.example/1",
  STRIPE_SECRET_KEY: "sk_test_123",
  STRIPE_WEBHOOK_SECRET: "whsec_test",
  STRIPE_PRO_MONTHLY_PRICE_ID: "price_monthly",
  STRIPE_PRO_YEARLY_PRICE_ID: "price_yearly",
  RESEND_API_KEY: "re_test",
  EMAIL_FROM: "go-daily <hello@go-daily.app>",
  CRON_SECRET: "cron-secret-with-safe-length",
};

describe("production preflight", () => {
  it("runs the default P2-C smoke checks without live remote probes", () => {
    const result = spawnSync(
      path.join("node_modules", ".bin", "tsx"),
      ["scripts/productionPreflight.ts"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          ...safeEnv,
        },
        encoding: "utf8",
        timeout: 30_000,
      },
    );

    const output = `${result.stdout}\n${result.stderr}`;
    expect(result.status, output).toBe(0);
    expect(output).toContain("Smoke page route exists: /today");
    expect(output).toContain("Stripe webhook is bounded/idempotent");
    expect(output).toContain("Email smoketest is send-safe by default");
    expect(output).toContain("Remote checks skipped");
    expect(output).toContain("Supabase remote check skipped");
    expect(output).toContain("Stripe remote price check skipped");
    expect(output).toContain("Result: READY");
  });
});

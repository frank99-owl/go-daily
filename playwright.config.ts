import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end config.
 *
 * The suite runs against a production build so it exercises the same
 * rendering paths as Vercel: static pages prerendered, puzzle pages on
 * on-demand ISR, and the locale redirect handled by `proxy.ts`.
 *
 * No real credentials are required, but placeholders are: `proxy.ts` tolerates
 * missing Supabase env (it short-circuits to anonymous), while the page-level
 * `createClient()` throws on it, so /today and /result would render their error
 * boundary instead of a board. The values below only have to exist — a
 * signed-out visitor carries no auth cookie, so nothing is ever dialled.
 *
 * Every spec here covers the signed-out visitor. Flows behind a session
 * (device registration, coach quota, Stripe checkout and its webhook) need
 * real test-mode credentials and are documented in e2e/README.md rather than
 * silently skipped.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx next start --port ${PORT}`,
        url: baseURL,
        // Never reuse: a server started by hand inherits .env.local and its
        // real Supabase keys, which makes a local run pass where CI fails.
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          // Placeholders. These only have to exist, not resolve — see above.
          DEEPSEEK_API_KEY: "e2e-placeholder-not-called",
          NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "e2e-placeholder-not-called",
        },
      },
});

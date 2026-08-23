import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end config.
 *
 * The suite runs against a production build so it exercises the same
 * rendering paths as Vercel: static pages prerendered, puzzle pages on
 * on-demand ISR, and the locale redirect handled by `proxy.ts`.
 *
 * Supabase credentials are deliberately not required. `refreshSupabaseSession`
 * short-circuits to anonymous when they are absent, so every spec here covers
 * the signed-out visitor. Flows behind a session (device registration, coach
 * quota, Stripe checkout and its webhook) need test-mode credentials and are
 * documented in e2e/README.md rather than silently skipped.
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
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          // The build already ran; these only need to exist, not be valid.
          // Anything that would actually call out is out of scope here.
          DEEPSEEK_API_KEY: "e2e-placeholder-not-called",
        },
      },
});

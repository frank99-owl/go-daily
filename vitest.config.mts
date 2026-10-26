import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
  test: {
    // Playwright owns e2e/; vitest's default glob would otherwise try to run
    // those specs in jsdom and fail on the Playwright imports.
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["lib/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "app/**/*.{ts,tsx}"],
      exclude: ["**/*.test.{ts,tsx}", "**/*.d.ts"],
      // Ratchet, not a target. Each floor sits just under the measurement
      // taken on 2026-10-26 (72.98 / 68.31 / 71.77 / 74.36), so the gate is
      // green today and a change that removes tested code or adds untested
      // code fails CI instead of quietly eroding the number. Raise these when
      // coverage rises; never lower them to make a red build pass.
      thresholds: {
        statements: 72,
        branches: 67,
        functions: 71,
        lines: 73,
      },
    },
  },
});

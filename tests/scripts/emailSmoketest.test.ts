/**
 * @vitest-environment node
 */
import { spawnSync } from "node:child_process";
import path from "node:path";

import { describe, expect, it } from "vitest";

function runEmailSmoketest(env: Record<string, string>) {
  return spawnSync(path.join("node_modules", ".bin", "tsx"), ["scripts/emailSmoketest.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...env,
    },
    encoding: "utf8",
    timeout: 30_000,
  });
}

describe("email smoketest", () => {
  it("defaults to local dry-run and skips Resend remote checks", () => {
    const result = runEmailSmoketest({
      RESEND_API_KEY: "re_test",
      EMAIL_FROM: "go-daily <hello@go-daily.app>",
    });

    const output = `${result.stdout}\n${result.stderr}`;
    expect(result.status, output).toBe(0);
    expect(output).toContain("[PASS] EMAIL_FROM format");
    expect(output).toContain("[WARN] Resend remote check - Skipped");
    expect(output).toContain("[WARN] Live send - Skipped");
    expect(output).not.toContain("Resend API key accepted");
    expect(output).toContain("Result: READY");
  });

  it("safe-skips missing email env in default dry-run mode", () => {
    const result = runEmailSmoketest({
      RESEND_API_KEY: "",
      EMAIL_FROM: "",
    });

    const output = `${result.stdout}\n${result.stderr}`;
    expect(result.status, output).toBe(0);
    expect(output).toContain("[WARN] RESEND_API_KEY");
    expect(output).toContain("[WARN] EMAIL_FROM");
    expect(output).toContain("Result: READY");
  });
});

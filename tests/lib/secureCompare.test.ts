/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";

import { constantTimeEqual } from "@/lib/secureCompare";

describe("constantTimeEqual", () => {
  it("matches equal secrets", () => {
    expect(constantTimeEqual("secret-value", "secret-value")).toBe(true);
  });

  it("rejects different secrets, including different-length inputs", () => {
    expect(constantTimeEqual("secret-value", "secret-value-2")).toBe(false);
    expect(constantTimeEqual("short", "a much longer secret")).toBe(false);
  });
});

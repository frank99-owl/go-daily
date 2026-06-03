import { describe, expect, it } from "vitest";

import { describeUserAgent } from "@/lib/auth/deviceId";

describe("describeUserAgent", () => {
  it("returns 'Unknown device' for empty string", () => {
    expect(describeUserAgent("")).toBe("Unknown device");
  });

  it("detects Chrome on macOS", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    expect(describeUserAgent(ua)).toBe("Chrome on macOS");
  });

  it("detects Safari on iPhone", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    expect(describeUserAgent(ua)).toBe("Safari on iPhone");
  });

  it("detects Safari on iPad", () => {
    const ua =
      "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    expect(describeUserAgent(ua)).toBe("Safari on iPad");
  });

  it("detects Firefox on Windows", () => {
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0";
    expect(describeUserAgent(ua)).toBe("Firefox on Windows");
  });

  it("detects Edge on Windows", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0";
    expect(describeUserAgent(ua)).toBe("Edge on Windows");
  });

  it("detects Chrome on Android", () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
    expect(describeUserAgent(ua)).toBe("Chrome on Android");
  });

  it("detects Opera on Linux", () => {
    const ua =
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0";
    expect(describeUserAgent(ua)).toBe("Opera on Linux");
  });

  it("returns browser only when OS not detected", () => {
    expect(describeUserAgent("Chrome/120.0.0.0")).toBe("Chrome");
  });

  it("truncates very long unknown UA", () => {
    const ua = "a".repeat(100);
    const result = describeUserAgent(ua);
    expect(result.length).toBeLessThanOrEqual(61); // 60 + ellipsis
    expect(result).toContain("…");
  });
});

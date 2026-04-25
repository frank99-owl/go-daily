// @vitest-environment node
import { describe, expect, it } from "vitest";

import { getClientIP, isValidIP } from "./clientIp";

function req(headers: Record<string, string>): Request {
  return new Request("http://localhost/", { headers });
}

describe("isValidIP", () => {
  it("accepts well-formed IPv4", () => {
    expect(isValidIP("1.2.3.4")).toBe(true);
    expect(isValidIP("255.255.255.255")).toBe(true);
    expect(isValidIP("0.0.0.0")).toBe(true);
  });

  it("rejects IPv4 with out-of-range octets", () => {
    expect(isValidIP("256.0.0.1")).toBe(false);
    expect(isValidIP("1.2.3.999")).toBe(false);
  });

  it("accepts IPv6-ish strings", () => {
    expect(isValidIP("::1")).toBe(true);
    expect(isValidIP("2001:db8::1")).toBe(true);
    expect(isValidIP("fe80::1234:5678:9abc:def0")).toBe(true);
  });

  it("rejects empty / whitespace / oversized / injection-like strings", () => {
    expect(isValidIP("")).toBe(false);
    expect(isValidIP("10.0.0.1 ")).toBe(false); // space
    expect(isValidIP("<script>")).toBe(false);
    expect(isValidIP("'; drop")).toBe(false);
    expect(isValidIP("a".repeat(50))).toBe(false); // > 45 chars
  });
});

describe("getClientIP — priority chain", () => {
  it("prefers CF-Connecting-IP over everything else", () => {
    const ip = getClientIP(
      req({
        "cf-connecting-ip": "1.1.1.1",
        "x-forwarded-for": "2.2.2.2",
        "x-real-ip": "3.3.3.3",
      }),
    );
    expect(ip).toBe("1.1.1.1");
  });

  it("skips CF-Connecting-IP when it's invalid and falls through to X-Forwarded-For", () => {
    const ip = getClientIP(
      req({
        "cf-connecting-ip": "not-an-ip-<script>",
        "x-forwarded-for": "2.2.2.2",
      }),
    );
    expect(ip).toBe("2.2.2.2");
  });

  it("takes only the first entry from X-Forwarded-For (subsequent hops are user-supplied)", () => {
    const ip = getClientIP(
      req({
        "x-forwarded-for": "1.2.3.4, 5.6.7.8, 9.9.9.9",
      }),
    );
    expect(ip).toBe("1.2.3.4");
  });

  it("trims whitespace around the first X-Forwarded-For entry", () => {
    const ip = getClientIP(req({ "x-forwarded-for": "   1.2.3.4   , 5.6.7.8" }));
    expect(ip).toBe("1.2.3.4");
  });

  it("falls through to X-Real-IP when earlier headers are absent/invalid", () => {
    const ip = getClientIP(req({ "x-real-ip": "10.0.0.1" }));
    expect(ip).toBe("10.0.0.1");
  });

  it("returns 'unknown' sentinel when no valid IP header is present", () => {
    expect(getClientIP(req({}))).toBe("unknown");
    expect(getClientIP(req({ "x-forwarded-for": "" }))).toBe("unknown");
    expect(getClientIP(req({ "x-real-ip": "nope" }))).toBe("unknown");
  });

  it("does not fall through when CF-Connecting-IP is valid but X-Forwarded-For is spoofed", () => {
    // Real-world scenario: attacker sets X-Forwarded-For to try to look like
    // someone else, but we're behind Cloudflare so the true source is CF.
    const ip = getClientIP(
      req({
        "cf-connecting-ip": "100.100.100.100",
        "x-forwarded-for": "1.2.3.4",
      }),
    );
    expect(ip).toBe("100.100.100.100");
  });
});

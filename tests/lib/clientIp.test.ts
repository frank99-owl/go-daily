// @vitest-environment node
import { describe, expect, it } from "vitest";

import { getClientIP, isValidIP, getClientCountry } from "@/lib/clientIp";

function makeRequest(headers: Record<string, string>): Request {
  return new Request("https://example.com", { headers });
}

describe("isValidIP", () => {
  it("accepts valid IPv4", () => {
    expect(isValidIP("192.168.1.1")).toBe(true);
  });

  it("accepts 0.0.0.0", () => {
    expect(isValidIP("0.0.0.0")).toBe(true);
  });

  it("accepts 255.255.255.255", () => {
    expect(isValidIP("255.255.255.255")).toBe(true);
  });

  it("rejects IPv4 with octet > 255", () => {
    expect(isValidIP("256.1.1.1")).toBe(false);
  });

  it("rejects non-IP string", () => {
    expect(isValidIP("not-an-ip")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidIP("")).toBe(false);
  });

  it("accepts valid IPv6", () => {
    expect(isValidIP("::1")).toBe(true);
  });

  it("accepts full IPv6", () => {
    expect(isValidIP("2001:0db8:85a3:0000:0000:8a2e:0370:7334")).toBe(true);
  });

  it("rejects string with spaces", () => {
    expect(isValidIP("192.168.1.1 extra")).toBe(false);
  });
});

describe("getClientIP", () => {
  it("returns x-forwarded-for first entry", () => {
    const req = makeRequest({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    expect(getClientIP(req)).toBe("1.2.3.4");
  });

  it("trims whitespace from forwarded-for", () => {
    const req = makeRequest({ "x-forwarded-for": "  1.2.3.4  , 5.6.7.8" });
    expect(getClientIP(req)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip", () => {
    const req = makeRequest({ "x-real-ip": "10.0.0.1" });
    expect(getClientIP(req)).toBe("10.0.0.1");
  });

  it("falls back to cf-connecting-ip", () => {
    const req = makeRequest({ "cf-connecting-ip": "172.16.0.1" });
    expect(getClientIP(req)).toBe("172.16.0.1");
  });

  it("returns 'unknown' when no headers present", () => {
    const req = makeRequest({});
    expect(getClientIP(req)).toBe("unknown");
  });

  it("prefers x-forwarded-for over x-real-ip", () => {
    const req = makeRequest({
      "x-forwarded-for": "1.1.1.1",
      "x-real-ip": "2.2.2.2",
    });
    expect(getClientIP(req)).toBe("1.1.1.1");
  });

  it("skips invalid IP in forwarded-for and falls back", () => {
    const req = makeRequest({
      "x-forwarded-for": "not-an-ip",
      "x-real-ip": "10.0.0.1",
    });
    expect(getClientIP(req)).toBe("10.0.0.1");
  });
});

// ---- Merged from the former co-located lib/clientIp.test.ts (2026-09-16) ----

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
  it("prefers X-Forwarded-For over CF-Connecting-IP", () => {
    const ip = getClientIP(
      req({
        "cf-connecting-ip": "1.1.1.1",
        "x-forwarded-for": "2.2.2.2",
        "x-real-ip": "3.3.3.3",
      }),
    );
    expect(ip).toBe("2.2.2.2");
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
    expect(ip).toBe("1.2.3.4");
  });
});

describe("getClientCountry — edge geo headers", () => {
  it("reads the Vercel country header (primary host)", () => {
    expect(getClientCountry(req({ "x-vercel-ip-country": "CN" }))).toBe("CN");
  });

  it("prefers the Vercel header over the Cloudflare one", () => {
    const country = getClientCountry(req({ "x-vercel-ip-country": "JP", "cf-ipcountry": "US" }));
    expect(country).toBe("JP");
  });

  it("falls back to the Cloudflare header when Vercel's is absent", () => {
    expect(getClientCountry(req({ "cf-ipcountry": "kr" }))).toBe("KR");
  });

  it("normalises case and surrounding whitespace", () => {
    expect(getClientCountry(req({ "x-vercel-ip-country": "  de  " }))).toBe("DE");
  });

  it("returns null for unknown/sentinel/malformed codes so callers fall back to UTC", () => {
    expect(getClientCountry(req({}))).toBeNull();
    expect(getClientCountry(req({ "x-vercel-ip-country": "XX" }))).toBeNull(); // unknown
    expect(getClientCountry(req({ "cf-ipcountry": "T1" }))).toBeNull(); // Tor
    expect(getClientCountry(req({ "x-vercel-ip-country": "USA" }))).toBeNull(); // not alpha-2
    expect(getClientCountry(req({ "x-vercel-ip-country": "" }))).toBeNull();
  });
});

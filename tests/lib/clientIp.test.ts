// @vitest-environment node
import { describe, expect, it } from "vitest";

import { getClientCountry, getClientIP, isCloudflareIP, isValidIP } from "@/lib/clientIp";

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

// ---- Behind Cloudflare (2026-11) ----
//
// Vercel overwrites X-Forwarded-For with the address that connected to it, so
// behind Cloudflare that header names an edge and the visitor is in
// CF-Connecting-IP — believable only when the connection came from Cloudflare.

describe("isCloudflareIP", () => {
  it("recognizes addresses inside Cloudflare's IPv4 ranges", () => {
    expect(isCloudflareIP("172.70.1.5")).toBe(true); // 172.64.0.0/13
    expect(isCloudflareIP("162.158.90.12")).toBe(true); // 162.158.0.0/15
    expect(isCloudflareIP("104.16.0.0")).toBe(true); // first address of 104.16.0.0/13
    expect(isCloudflareIP("104.23.255.255")).toBe(true); // last address of 104.16.0.0/13
    expect(isCloudflareIP("131.0.75.255")).toBe(true); // last address of 131.0.72.0/22
  });

  it("rejects the addresses just outside a range", () => {
    expect(isCloudflareIP("104.15.255.255")).toBe(false);
    expect(isCloudflareIP("104.28.0.0")).toBe(false); // past 104.24.0.0/14
    expect(isCloudflareIP("172.72.0.0")).toBe(false); // past 172.64.0.0/13
    expect(isCloudflareIP("131.0.76.0")).toBe(false);
    expect(isCloudflareIP("8.8.8.8")).toBe(false);
  });

  it("recognizes Cloudflare's IPv6 ranges, compressed or not", () => {
    expect(isCloudflareIP("2606:4700::6810:1")).toBe(true);
    expect(isCloudflareIP("2606:4700:0000:0000:0000:0000:6810:0001")).toBe(true);
    expect(isCloudflareIP("2a06:98c7:ffff::1")).toBe(true); // top of 2a06:98c0::/29
    expect(isCloudflareIP("2a06:98c8::1")).toBe(false); // just past it
    expect(isCloudflareIP("2001:db8::1")).toBe(false);
  });

  it("reads an IPv4-mapped IPv6 peer as IPv4", () => {
    expect(isCloudflareIP("::ffff:172.70.1.5")).toBe(true);
    expect(isCloudflareIP("::ffff:8.8.8.8")).toBe(false);
  });

  it("rejects anything that is not an address", () => {
    for (const value of ["", "unknown", "172.70.1", "999.70.1.5", "2606:4700:::1", "g::1"]) {
      expect(isCloudflareIP(value)).toBe(false);
    }
  });
});

describe("getClientIP — behind Cloudflare", () => {
  it("returns the visitor, not the edge, when Cloudflare connected", () => {
    const ip = getClientIP(
      req({
        "x-forwarded-for": "172.70.1.5",
        "x-real-ip": "172.70.1.5",
        "cf-connecting-ip": "203.0.113.7",
      }),
    );
    expect(ip).toBe("203.0.113.7");
  });

  it("gives two visitors behind one edge different keys", () => {
    const edge = { "x-forwarded-for": "162.158.90.12" };
    const first = getClientIP(req({ ...edge, "cf-connecting-ip": "203.0.113.7" }));
    const second = getClientIP(req({ ...edge, "cf-connecting-ip": "198.51.100.9" }));
    expect(first).not.toBe(second);
  });

  it("gives one visitor the same key whichever edge carried the request", () => {
    const visitor = { "cf-connecting-ip": "203.0.113.7" };
    const first = getClientIP(req({ ...visitor, "x-forwarded-for": "172.70.1.5" }));
    const second = getClientIP(req({ ...visitor, "x-forwarded-for": "2606:4700::6810:1" }));
    expect(first).toBe("203.0.113.7");
    expect(second).toBe("203.0.113.7");
  });

  it("ignores CF-Connecting-IP on a request that reached Vercel directly", () => {
    // Anyone can skip Cloudflare and send the header; believing it would hand
    // out a fresh rate-limit bucket per request.
    const ip = getClientIP(
      req({ "x-forwarded-for": "198.51.100.9", "cf-connecting-ip": "203.0.113.7" }),
    );
    expect(ip).toBe("198.51.100.9");
  });

  it("keeps the edge address when Cloudflare sent no usable visitor address", () => {
    expect(getClientIP(req({ "x-forwarded-for": "172.70.1.5" }))).toBe("172.70.1.5");
    expect(
      getClientIP(req({ "x-forwarded-for": "172.70.1.5", "cf-connecting-ip": "<script>" })),
    ).toBe("172.70.1.5");
  });
});

describe("getClientCountry — behind Cloudflare", () => {
  it("prefers Cloudflare's country, since Vercel located the edge", () => {
    const country = getClientCountry(
      req({
        "x-forwarded-for": "172.70.1.5",
        "x-vercel-ip-country": "US",
        "cf-ipcountry": "CN",
      }),
    );
    expect(country).toBe("CN");
  });

  it("falls back to Vercel's country when Cloudflare reports unknown", () => {
    const country = getClientCountry(
      req({
        "x-forwarded-for": "172.70.1.5",
        "x-vercel-ip-country": "JP",
        "cf-ipcountry": "XX",
      }),
    );
    expect(country).toBe("JP");
  });

  it("prefers Vercel's country on a direct request", () => {
    const country = getClientCountry(
      req({
        "x-forwarded-for": "198.51.100.9",
        "x-vercel-ip-country": "US",
        "cf-ipcountry": "CN",
      }),
    );
    expect(country).toBe("US");
  });
});

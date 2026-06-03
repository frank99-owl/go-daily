import { describe, expect, it } from "vitest";

import { getClientIP, isValidIP } from "@/lib/clientIp";

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

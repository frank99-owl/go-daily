// @vitest-environment node
import { describe, expect, it } from "vitest";

import { isSameOriginMutationRequest } from "./requestSecurity";

function req(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { method: "POST", headers });
}

describe("isSameOriginMutationRequest", () => {
  describe("Origin header path", () => {
    it("accepts a matching Origin header", () => {
      expect(
        isSameOriginMutationRequest(
          req("https://go-daily.app/api/foo", { origin: "https://go-daily.app" }),
        ),
      ).toBe(true);
    });

    it("rejects a cross-origin POST", () => {
      expect(
        isSameOriginMutationRequest(
          req("https://go-daily.app/api/foo", { origin: "https://evil.example" }),
        ),
      ).toBe(false);
    });

    it("is strict about port differences", () => {
      expect(
        isSameOriginMutationRequest(
          req("https://go-daily.app/api/foo", { origin: "https://go-daily.app:8443" }),
        ),
      ).toBe(false);
    });

    it("is strict about scheme differences (http vs https)", () => {
      expect(
        isSameOriginMutationRequest(
          req("https://go-daily.app/api/foo", { origin: "http://go-daily.app" }),
        ),
      ).toBe(false);
    });
  });

  describe("Sec-Fetch-Site fallback", () => {
    it("accepts 'same-origin' when Origin is absent", () => {
      expect(
        isSameOriginMutationRequest(
          req("https://go-daily.app/api/foo", { "sec-fetch-site": "same-origin" }),
        ),
      ).toBe(true);
    });

    it("accepts 'same-site' (e.g. subdomain) when Origin is absent", () => {
      expect(
        isSameOriginMutationRequest(
          req("https://go-daily.app/api/foo", { "sec-fetch-site": "same-site" }),
        ),
      ).toBe(true);
    });

    it("accepts 'none' (user-initiated navigation) when Origin is absent", () => {
      expect(
        isSameOriginMutationRequest(
          req("https://go-daily.app/api/foo", { "sec-fetch-site": "none" }),
        ),
      ).toBe(true);
    });

    it("rejects 'cross-site' when Origin is absent", () => {
      expect(
        isSameOriginMutationRequest(
          req("https://go-daily.app/api/foo", { "sec-fetch-site": "cross-site" }),
        ),
      ).toBe(false);
    });
  });

  describe("no-headers fallback", () => {
    it("allows the request when both Origin and Sec-Fetch-Site are missing", () => {
      // Rationale: non-browser clients (curl, server-to-server) legitimately
      // omit these. Auth is a separate gate — this guard is best-effort CSRF.
      expect(isSameOriginMutationRequest(req("https://go-daily.app/api/foo"))).toBe(true);
    });
  });

  describe("Origin takes precedence over Sec-Fetch-Site", () => {
    it("rejects when Origin is cross-origin even if Sec-Fetch-Site says same-origin", () => {
      // Attacker can't spoof either of these in a real browser, but if they
      // could, we should prefer the stricter signal.
      expect(
        isSameOriginMutationRequest(
          req("https://go-daily.app/api/foo", {
            origin: "https://evil.example",
            "sec-fetch-site": "same-origin",
          }),
        ),
      ).toBe(false);
    });
  });
});

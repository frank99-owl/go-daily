import { describe, expect, it } from "vitest";

import { isSameOriginMutationRequest } from "@/lib/requestSecurity";

function makeRequest(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { method: "POST", headers });
}

describe("isSameOriginMutationRequest", () => {
  it("allows same-origin request via Origin header", () => {
    const req = makeRequest("https://example.com/api/test", {
      origin: "https://example.com",
    });
    expect(isSameOriginMutationRequest(req)).toBe(true);
  });

  it("blocks cross-origin request via Origin header", () => {
    const req = makeRequest("https://example.com/api/test", {
      origin: "https://evil.com",
    });
    expect(isSameOriginMutationRequest(req)).toBe(false);
  });

  it("allows same-origin via sec-fetch-site", () => {
    const req = makeRequest("https://example.com/api/test", {
      "sec-fetch-site": "same-origin",
    });
    expect(isSameOriginMutationRequest(req)).toBe(true);
  });

  it("allows same-site via sec-fetch-site", () => {
    const req = makeRequest("https://example.com/api/test", {
      "sec-fetch-site": "same-site",
    });
    expect(isSameOriginMutationRequest(req)).toBe(true);
  });

  it("allows none (navigation) via sec-fetch-site", () => {
    const req = makeRequest("https://example.com/api/test", {
      "sec-fetch-site": "none",
    });
    expect(isSameOriginMutationRequest(req)).toBe(true);
  });

  it("blocks cross-site via sec-fetch-site", () => {
    const req = makeRequest("https://example.com/api/test", {
      "sec-fetch-site": "cross-site",
    });
    expect(isSameOriginMutationRequest(req)).toBe(false);
  });

  it("allows request when neither Origin nor sec-fetch-site present", () => {
    const req = makeRequest("https://example.com/api/test");
    expect(isSameOriginMutationRequest(req)).toBe(true);
  });

  it("Origin takes precedence over sec-fetch-site", () => {
    const req = makeRequest("https://example.com/api/test", {
      origin: "https://evil.com",
      "sec-fetch-site": "same-origin",
    });
    expect(isSameOriginMutationRequest(req)).toBe(false);
  });
});

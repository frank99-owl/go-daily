/**
 * @vitest-environment node
 *
 * Covers proxy.ts, the app-wide Next.js middleware. Regressions here affect
 * every user-facing route: locale routing, auth guards, forwarded x-locale,
 * and static/API exemptions.
 */
import { NextRequest, type NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMocks = vi.hoisted(() => ({
  refreshSupabaseSession: vi.fn(),
}));

vi.mock("@/lib/supabase/middleware", () => ({
  refreshSupabaseSession: supabaseMocks.refreshSupabaseSession,
}));

import { LOCALE_COOKIE } from "@/lib/i18n/localePath";
import { config, proxy } from "@/proxy";

function request(path: string, init: { headers?: Record<string, string> } = {}) {
  return new NextRequest(new URL(path, "https://go-daily.local"), {
    headers: init.headers,
  });
}

function forwardedLocale(response: NextResponse): string | null {
  return response.headers.get("x-middleware-request-x-locale");
}

function setCookieHeader(response: Response): string {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  return (headers.getSetCookie?.() ?? [response.headers.get("set-cookie") ?? ""]).join("; ");
}

describe("proxy locale negotiation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMocks.refreshSupabaseSession.mockResolvedValue({ user: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("redirects unprefixed paths using the locale cookie first and persists it", async () => {
    const response = await proxy(
      request("/today?mode=review", {
        headers: {
          cookie: `${LOCALE_COOKIE}=ja`,
          "accept-language": "ko-KR,ko;q=0.9",
        },
      }),
    );

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://go-daily.local/ja/today?mode=review");
    expect(setCookieHeader(response)).toContain(`${LOCALE_COOKIE}=ja`);
    expect(supabaseMocks.refreshSupabaseSession).not.toHaveBeenCalled();
  });

  it("falls back to Accept-Language for unprefixed paths when the cookie is invalid", async () => {
    const response = await proxy(
      request("/puzzles", {
        headers: {
          cookie: `${LOCALE_COOKIE}=xx`,
          "accept-language": "zh-CN,zh;q=0.9,en;q=0.5",
        },
      }),
    );

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://go-daily.local/zh/puzzles");
    expect(setCookieHeader(response)).toContain(`${LOCALE_COOKIE}=zh`);
  });

  it("passes locale-prefixed pages through with x-locale and refreshes the session", async () => {
    const response = await proxy(request("/ko/stats"));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(forwardedLocale(response)).toBe("ko");
    expect(supabaseMocks.refreshSupabaseSession).toHaveBeenCalledOnce();
  });

  it("injects x-locale for manifest.webmanifest without redirecting or refreshing auth", async () => {
    const response = await proxy(
      request("/manifest.webmanifest", {
        headers: { "accept-language": "ja,en;q=0.5" },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(forwardedLocale(response)).toBe("ja");
    expect(supabaseMocks.refreshSupabaseSession).not.toHaveBeenCalled();
  });
});

describe("proxy auth guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMocks.refreshSupabaseSession.mockResolvedValue({ user: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("redirects anonymous /account users to localized login with a normalized next param", async () => {
    supabaseMocks.refreshSupabaseSession.mockImplementationOnce(async (_request, response) => {
      response.cookies.set("sb-refreshed", "1", { path: "/" });
      return { user: null };
    });

    const response = await proxy(request("/zh/account?tab=billing"));

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/zh/login");
    expect(location.searchParams.get("next")).toBe("/zh/account?tab=billing");
    expect(setCookieHeader(response)).toContain("sb-refreshed=1");
  });

  it("redirects authenticated /login users to a safe localized next target", async () => {
    supabaseMocks.refreshSupabaseSession.mockResolvedValueOnce({ user: { id: "u-1" } });

    const response = await proxy(
      request("/en/login?next=" + encodeURIComponent("/ja/review?due=1")),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://go-daily.local/en/review?due=1");
  });

  it("prevents authenticated /login redirect loops by falling back to account", async () => {
    supabaseMocks.refreshSupabaseSession.mockResolvedValueOnce({ user: { id: "u-1" } });

    const response = await proxy(
      request("/ja/login?next=" + encodeURIComponent("/ja/login?next=/ja/login")),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://go-daily.local/ja/account");
  });

  it("lets anonymous users view the login page", async () => {
    const response = await proxy(request("/en/login?next=/en/account"));

    expect(response.status).toBe(200);
    expect(forwardedLocale(response)).toBe("en");
  });
});

describe("proxy exemptions and matcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMocks.refreshSupabaseSession.mockResolvedValue({ user: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["/api/coach"],
    ["/auth/callback"],
    ["/email/unsubscribe?token=tok-123"],
    ["/_next/static/chunk.js"],
    ["/_next/image?url=%2Fstone.png&w=64&q=75"],
    ["/opengraph-image"],
    ["/robots.txt"],
    ["/sitemap.xml"],
    ["/sw.js"],
    ["/twitter-image"],
    ["/images/stone.png"],
  ])("passes exempt path %s through without redirecting or refreshing auth", async (path) => {
    const response = await proxy(request(path));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
    expect(supabaseMocks.refreshSupabaseSession).not.toHaveBeenCalled();
  });

  it("keeps the Next matcher aligned with API/auth/static exclusions", () => {
    expect(config.matcher).toEqual([
      "/((?!_next/static|_next/image|api|auth|email|favicon.ico|opengraph-image|robots.txt|sitemap.xml|twitter-image).*)",
    ]);
  });
});

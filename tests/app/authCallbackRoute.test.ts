import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  getUser: vi.fn(),
  sendWelcomeEmail: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/email", () => ({
  sendWelcomeEmail: mocks.sendWelcomeEmail,
}));

import { GET } from "@/app/auth/callback/route";

type QueryResult = { data?: unknown; error?: { message: string } | null };

function query(result: QueryResult) {
  const q: Record<string, unknown> = {
    select: vi.fn(() => q),
    update: vi.fn(() => q),
    eq: vi.fn(() => q),
    is: vi.fn(() => q),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
  };
  return q;
}

describe("/auth/callback", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createClient.mockResolvedValue({
      auth: {
        exchangeCodeForSession: mocks.exchangeCodeForSession,
        getUser: mocks.getUser,
      },
    });
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    mocks.sendWelcomeEmail.mockResolvedValue({ sent: false, reason: "not_configured" });
  });

  it("redirects missing-code errors to the explicit locale login page", async () => {
    const response = await GET(
      new Request("https://go-daily.app/auth/callback?locale=zh&next=%2Fen"),
    );
    const location = new URL(response.headers.get("location") ?? "");

    expect(response.status).toBe(307);
    expect(location.pathname).toBe("/zh/login");
    expect(location.searchParams.get("next")).toBe("/zh");
    expect(location.searchParams.get("auth_error")).toBe("missing_code");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("rewrites stale next locales before redirecting after a successful exchange", async () => {
    const response = await GET(
      new Request(
        "https://go-daily.app/auth/callback?code=abc&locale=ja&next=%2Fen%2Ftoday%3Ffrom%3Dlogin",
      ),
    );

    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(response.headers.get("location")).toBe("https://go-daily.app/ja/today?from=login");
  });

  it("uses the next path locale when no explicit locale is provided", async () => {
    const response = await GET(
      new Request("https://go-daily.app/auth/callback?code=abc&next=%2Fko%2Freview"),
    );

    expect(response.headers.get("location")).toBe("https://go-daily.app/ko/review");
  });

  it("sends a first-login welcome email without blocking the redirect", async () => {
    const profileSelect = query({
      data: {
        locale: "zh",
        email_opt_out: false,
        welcome_email_sent_at: null,
        email_unsubscribe_token: "tok_1",
      },
      error: null,
    });
    const profileUpdate = query({ error: null });
    mocks.createClient.mockResolvedValue({
      auth: {
        exchangeCodeForSession: mocks.exchangeCodeForSession,
        getUser: mocks.getUser,
      },
      from: vi.fn().mockReturnValueOnce(profileSelect).mockReturnValueOnce(profileUpdate),
    });
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user_1", email: "user@example.com" } },
      error: null,
    });
    mocks.sendWelcomeEmail.mockResolvedValue({ sent: true, id: "email_1" });

    const response = await GET(
      new Request("https://go-daily.app/auth/callback?code=abc&locale=zh&next=%2Fzh%2Ftoday"),
    );

    expect(response.headers.get("location")).toBe("https://go-daily.app/zh/today");
    expect(mocks.sendWelcomeEmail).toHaveBeenCalledWith({
      to: "user@example.com",
      locale: "zh",
      unsubscribeToken: "tok_1",
    });
    expect(profileUpdate.update).toHaveBeenCalledWith({
      welcome_email_sent_at: expect.any(String),
    });
  });

  it("falls back to the pending auth redirect cookie when callback params are stripped", async () => {
    const cookie = encodeURIComponent("locale=zh&next=%2Fzh%2Freview");
    const response = await GET(
      new Request("https://go-daily.app/auth/callback?code=abc", {
        headers: {
          cookie: `go-daily.auth-redirect=${cookie}`,
        },
      }),
    );

    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(response.headers.get("location")).toBe("https://go-daily.app/zh/review");
    expect(response.headers.get("set-cookie")).toContain("go-daily.auth-redirect=");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("keeps exchange errors on the localized login page", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: new Error("bad verifier") });

    const response = await GET(
      new Request("https://go-daily.app/auth/callback?code=abc&locale=ko&next=%2Fen%2Freview"),
    );
    const location = new URL(response.headers.get("location") ?? "");

    expect(location.pathname).toBe("/ko/login");
    expect(location.searchParams.get("next")).toBe("/ko/review");
    expect(location.searchParams.get("auth_error")).toBe("bad verifier");
  });

  it("catches thrown exchange failures instead of returning a 500", async () => {
    mocks.createClient.mockRejectedValue(new Error("supabase unavailable"));

    const response = await GET(
      new Request("https://go-daily.app/auth/callback?code=abc&locale=en&next=%2Fen"),
    );
    const location = new URL(response.headers.get("location") ?? "");

    expect(location.pathname).toBe("/en/login");
    expect(location.searchParams.get("next")).toBe("/en");
    expect(location.searchParams.get("auth_error")).toBe("supabase unavailable");
  });
});

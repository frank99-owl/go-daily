/**
 * @vitest-environment node
 *
 * Covers app/auth/callback/route.ts — the OAuth / magic-link callback. This
 * route is security-critical: it accepts attacker-controlled `next` and
 * `locale` query parameters and turns them into redirects. A regression here
 * is one of: open redirect (sending users off-origin), locale drift (post-login
 * page in the wrong language), duplicate welcome email, or a broken auth flow.
 *
 * We deliberately let lib/authRedirect and lib/localePath run for real — they
 * are the source of truth for the normalization being asserted, so mocking
 * them would let bugs slip through. Only Supabase + the Resend wrapper are
 * mocked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));
const emailMocks = vi.hoisted(() => ({
  sendWelcomeEmail: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: supabaseMocks.createClient,
}));

vi.mock("@/lib/email", () => ({
  sendWelcomeEmail: emailMocks.sendWelcomeEmail,
}));

import { GET } from "@/app/auth/callback/route";
import { AUTH_REDIRECT_COOKIE } from "@/lib/auth/authRedirect";

type ProfileRow = {
  locale?: string | null;
  email_opt_out?: boolean | null;
  welcome_email_sent_at?: string | null;
  email_unsubscribe_token?: string | null;
};

interface SupabaseStubOptions {
  user?: { id?: string; email?: string | null } | null;
  userError?: { message: string } | null;
  exchangeError?: { message: string } | null;
  exchangeThrows?: Error;
  profile?: ProfileRow | null;
  profileError?: { message: string } | null;
  updateError?: { message: string } | null;
}

function buildSupabase(opts: SupabaseStubOptions = {}) {
  const exchangeCodeForSession = vi.fn(async () => {
    if (opts.exchangeThrows) throw opts.exchangeThrows;
    return { data: {}, error: opts.exchangeError ?? null };
  });

  const getUser = vi.fn(async () => ({
    data: { user: opts.user === undefined ? { id: "u-1", email: "u-1@example.com" } : opts.user },
    error: opts.userError ?? null,
  }));

  const updateEqIs = vi.fn(async () => ({ error: opts.updateError ?? null }));
  const updateEq = vi.fn(() => ({ is: updateEqIs }));
  const update = vi.fn(() => ({ eq: updateEq }));

  const maybeSingle = vi.fn(async () => ({
    data: opts.profile ?? null,
    error: opts.profileError ?? null,
  }));
  const selectEq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq: selectEq }));

  const fromSpy = vi.fn(() => ({
    select,
    update,
  }));

  const client = {
    auth: { exchangeCodeForSession, getUser },
    from: fromSpy,
  };

  return {
    client,
    spies: {
      exchangeCodeForSession,
      getUser,
      fromSpy,
      update,
      updateEq,
      updateEqIs,
      maybeSingle,
    },
  };
}

function makeRequest(url: string, init: { headers?: Record<string, string> } = {}): Request {
  return new Request(url, {
    method: "GET",
    headers: { ...(init.headers ?? {}) },
  });
}

function getCookieHeader(response: Response): string {
  // Headers.getSetCookie() is supported in Node 20+; fall back if not.
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const list = headers.getSetCookie?.() ?? [];
  return list.join("; ");
}

describe("/auth/callback — pre-exchange validation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    emailMocks.sendWelcomeEmail.mockReset();
    const { client } = buildSupabase();
    supabaseMocks.createClient.mockResolvedValue(client);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redirects to /{locale}/login?auth_error=missing_code when ?code is absent", async () => {
    const response = await GET(
      makeRequest("https://go-daily.local/auth/callback?next=%2Fen%2Ftoday"),
    );

    expect(response.status).toBe(307);
    const location = response.headers.get("location") ?? "";
    expect(location).toMatch(/\/en\/login\?next=/);
    expect(location).toContain("auth_error=missing_code");
  });

  it("clears the AUTH_REDIRECT_COOKIE on every redirect (success and failure)", async () => {
    const response = await GET(makeRequest("https://go-daily.local/auth/callback"));

    const cookieHeader = getCookieHeader(response);
    expect(cookieHeader).toContain(`${AUTH_REDIRECT_COOKIE}=`);
    expect(cookieHeader).toMatch(/Max-Age=0/i);
  });
});

describe("/auth/callback — locale resolution", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    emailMocks.sendWelcomeEmail.mockReset();
    const { client } = buildSupabase();
    supabaseMocks.createClient.mockResolvedValue(client);
  });

  it("prefers the explicit ?locale= param", async () => {
    const response = await GET(
      makeRequest("https://go-daily.local/auth/callback?locale=ja", {
        headers: { "accept-language": "en-US,en;q=0.9" },
      }),
    );

    expect(response.headers.get("location")).toMatch(/\/ja\/login\?/);
  });

  it("falls back to the locale embedded in `next` when ?locale= is missing", async () => {
    const response = await GET(
      makeRequest("https://go-daily.local/auth/callback?next=%2Fzh%2Ftoday"),
    );

    expect(response.headers.get("location")).toMatch(/\/zh\/login\?/);
  });

  it("falls back to Accept-Language when neither ?locale= nor `next` carry one", async () => {
    const response = await GET(
      makeRequest("https://go-daily.local/auth/callback", {
        headers: { "accept-language": "ko-KR,ko;q=0.9,en;q=0.5" },
      }),
    );

    expect(response.headers.get("location")).toMatch(/\/ko\/login\?/);
  });

  it("falls back to the default locale (en) when nothing else is available", async () => {
    const response = await GET(makeRequest("https://go-daily.local/auth/callback"));

    expect(response.headers.get("location")).toMatch(/\/en\/login\?/);
  });

  it("ignores an unsupported ?locale= value (e.g. 'xx') and tries the next signal", async () => {
    const response = await GET(
      makeRequest("https://go-daily.local/auth/callback?locale=xx", {
        headers: { "accept-language": "ja" },
      }),
    );

    expect(response.headers.get("location")).toMatch(/\/ja\/login\?/);
  });

  it("uses the locale stored in the AUTH_REDIRECT_COOKIE when ?locale= is missing", async () => {
    const response = await GET(
      makeRequest("https://go-daily.local/auth/callback", {
        headers: {
          cookie: `${AUTH_REDIRECT_COOKIE}=${encodeURIComponent("locale=ja&next=%2Fja%2Ftoday")}`,
        },
      }),
    );

    expect(response.headers.get("location")).toMatch(/\/ja\/login\?/);
  });
});

describe("/auth/callback — `next` redirect normalization", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    emailMocks.sendWelcomeEmail.mockReset();
    emailMocks.sendWelcomeEmail.mockResolvedValue({ sent: false, reason: "not_configured" });
    const { client } = buildSupabase({
      profile: { welcome_email_sent_at: "2026-04-01T00:00:00Z" }, // skip welcome email
    });
    supabaseMocks.createClient.mockResolvedValue(client);
  });

  it("redirects to the normalized same-origin `next` after a successful exchange", async () => {
    const response = await GET(
      makeRequest("https://go-daily.local/auth/callback?code=abc&next=%2Fen%2Ftoday"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://go-daily.local/en/today");
  });

  it("rejects a protocol-relative `next` (//evil.com) and falls back to /{locale}", async () => {
    const response = await GET(
      makeRequest(
        "https://go-daily.local/auth/callback?code=abc&next=" +
          encodeURIComponent("//evil.com/steal"),
      ),
    );

    expect(response.headers.get("location")).toBe("https://go-daily.local/en");
  });

  it("rejects an absolute http:// `next` URL and falls back to /{locale}", async () => {
    const response = await GET(
      makeRequest(
        "https://go-daily.local/auth/callback?code=abc&next=" +
          encodeURIComponent("https://evil.com/steal"),
      ),
    );

    expect(response.headers.get("location")).toBe("https://go-daily.local/en");
  });

  it("rejects a `javascript:` URL `next` and falls back to /{locale}", async () => {
    const response = await GET(
      makeRequest(
        "https://go-daily.local/auth/callback?code=abc&next=" +
          encodeURIComponent("javascript:alert(1)"),
      ),
    );

    expect(response.headers.get("location")).toBe("https://go-daily.local/en");
  });

  it("strips a stale locale prefix from `next` and re-prefixes with the active one", async () => {
    // Caller passed ?locale=zh but `next` already has /en/. The active locale
    // (zh) must win — otherwise a Chinese login would land on the English page.
    const response = await GET(
      makeRequest("https://go-daily.local/auth/callback?code=abc&locale=zh&next=%2Fen%2Ftoday"),
    );

    expect(response.headers.get("location")).toBe("https://go-daily.local/zh/today");
  });

  it("preserves query string and hash on the redirected `next`", async () => {
    const response = await GET(
      makeRequest(
        "https://go-daily.local/auth/callback?code=abc&next=" +
          encodeURIComponent("/en/today?ref=email#solve"),
      ),
    );

    expect(response.headers.get("location")).toBe(
      "https://go-daily.local/en/today?ref=email#solve",
    );
  });

  it("falls back to the cookie's `next` when the URL has no `next` param", async () => {
    const response = await GET(
      makeRequest("https://go-daily.local/auth/callback?code=abc", {
        headers: {
          cookie: `${AUTH_REDIRECT_COOKIE}=${encodeURIComponent("locale=ja&next=%2Fja%2Ftoday")}`,
        },
      }),
    );

    expect(response.headers.get("location")).toBe("https://go-daily.local/ja/today");
  });
});

describe("/auth/callback — exchange error paths", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    emailMocks.sendWelcomeEmail.mockReset();
  });

  it("redirects to /login with the Supabase error message when exchangeCodeForSession returns error", async () => {
    const { client } = buildSupabase({ exchangeError: { message: "otp_expired" } });
    supabaseMocks.createClient.mockResolvedValue(client);

    const response = await GET(
      makeRequest("https://go-daily.local/auth/callback?code=abc&next=%2Fen%2Ftoday"),
    );

    const location = response.headers.get("location") ?? "";
    expect(location).toContain("/en/login");
    expect(location).toContain("auth_error=otp_expired");
    expect(emailMocks.sendWelcomeEmail).not.toHaveBeenCalled();
  });

  it("redirects to /login with the thrown error message when exchange throws", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = buildSupabase({ exchangeThrows: new Error("network down") });
    supabaseMocks.createClient.mockResolvedValue(client);

    const response = await GET(
      makeRequest("https://go-daily.local/auth/callback?code=abc&next=%2Fen%2Ftoday"),
    );

    const location = response.headers.get("location") ?? "";
    expect(location).toContain("/en/login");
    expect(location).toContain("auth_error=network");
    expect(errorSpy).toHaveBeenCalledWith(
      "[auth/callback] session exchange failed",
      "network down",
    );
  });

  it("uses 'callback_failed' when a non-Error value is thrown", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = {
      auth: {
        exchangeCodeForSession: vi.fn(() => {
          throw "string-not-error";
        }),
        getUser: vi.fn(),
      },
      from: vi.fn(),
    };
    supabaseMocks.createClient.mockResolvedValue(supabase);

    const response = await GET(
      makeRequest("https://go-daily.local/auth/callback?code=abc&next=%2Fen%2Ftoday"),
    );

    expect(response.headers.get("location")).toContain("auth_error=callback_failed");
  });
});

describe("/auth/callback — welcome email", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    emailMocks.sendWelcomeEmail.mockReset();
  });

  it("does NOT send when getUser returns no user", async () => {
    const { client } = buildSupabase({ user: null });
    supabaseMocks.createClient.mockResolvedValue(client);

    await GET(makeRequest("https://go-daily.local/auth/callback?code=abc"));

    expect(emailMocks.sendWelcomeEmail).not.toHaveBeenCalled();
  });

  it("does NOT send when the user has no email", async () => {
    const { client } = buildSupabase({ user: { id: "u-1", email: null } });
    supabaseMocks.createClient.mockResolvedValue(client);

    await GET(makeRequest("https://go-daily.local/auth/callback?code=abc"));

    expect(emailMocks.sendWelcomeEmail).not.toHaveBeenCalled();
  });

  it("does NOT send when the profile lookup fails (logs warning)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { client } = buildSupabase({
      profile: null,
      profileError: { message: "RLS denied" },
    });
    supabaseMocks.createClient.mockResolvedValue(client);

    await GET(makeRequest("https://go-daily.local/auth/callback?code=abc"));

    expect(emailMocks.sendWelcomeEmail).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      "[auth/callback] welcome profile lookup failed",
      expect.objectContaining({ message: "RLS denied" }),
    );
  });

  it("does NOT send when email_opt_out=true", async () => {
    const { client } = buildSupabase({ profile: { email_opt_out: true } });
    supabaseMocks.createClient.mockResolvedValue(client);

    await GET(makeRequest("https://go-daily.local/auth/callback?code=abc"));

    expect(emailMocks.sendWelcomeEmail).not.toHaveBeenCalled();
  });

  it("does NOT send when welcome_email_sent_at already has a value (idempotency)", async () => {
    const { client } = buildSupabase({
      profile: { welcome_email_sent_at: "2026-04-01T00:00:00Z" },
    });
    supabaseMocks.createClient.mockResolvedValue(client);

    await GET(makeRequest("https://go-daily.local/auth/callback?code=abc"));

    expect(emailMocks.sendWelcomeEmail).not.toHaveBeenCalled();
  });

  it("uses the profile's locale when valid (overrides the URL-resolved fallback)", async () => {
    const { client } = buildSupabase({
      profile: {
        locale: "zh",
        email_opt_out: false,
        welcome_email_sent_at: null,
        email_unsubscribe_token: "tok",
      },
    });
    supabaseMocks.createClient.mockResolvedValue(client);
    emailMocks.sendWelcomeEmail.mockResolvedValue({ sent: true, id: "id-1" });

    await GET(makeRequest("https://go-daily.local/auth/callback?code=abc&locale=ja"));

    expect(emailMocks.sendWelcomeEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "u-1@example.com",
        locale: "zh",
        unsubscribeToken: "tok",
      }),
    );
  });

  it("falls back to the URL-resolved locale when profile.locale is invalid", async () => {
    const { client } = buildSupabase({
      profile: {
        locale: "klingon",
        email_opt_out: false,
        welcome_email_sent_at: null,
        email_unsubscribe_token: null,
      },
    });
    supabaseMocks.createClient.mockResolvedValue(client);
    emailMocks.sendWelcomeEmail.mockResolvedValue({ sent: true, id: null });

    await GET(makeRequest("https://go-daily.local/auth/callback?code=abc&locale=ja"));

    expect(emailMocks.sendWelcomeEmail).toHaveBeenCalledWith(
      expect.objectContaining({ locale: "ja" }),
    );
  });

  it("marks welcome_email_sent_at on a successful send (with .is(null) race guard)", async () => {
    const { client, spies } = buildSupabase({
      profile: { welcome_email_sent_at: null },
    });
    supabaseMocks.createClient.mockResolvedValue(client);
    emailMocks.sendWelcomeEmail.mockResolvedValue({ sent: true, id: "msg" });

    await GET(makeRequest("https://go-daily.local/auth/callback?code=abc"));

    expect(spies.update).toHaveBeenCalledWith(
      expect.objectContaining({
        welcome_email_sent_at: expect.any(String),
      }),
    );
    expect(spies.updateEq).toHaveBeenCalledWith("user_id", "u-1");
    // The .is("welcome_email_sent_at", null) is the optimistic concurrency
    // guard: if a parallel callback already wrote a timestamp, this update
    // turns into a no-op instead of overwriting.
    expect(spies.updateEqIs).toHaveBeenCalled();
  });

  it("does NOT call update when the send returns sent=false", async () => {
    const { client, spies } = buildSupabase({
      profile: { welcome_email_sent_at: null },
    });
    supabaseMocks.createClient.mockResolvedValue(client);
    emailMocks.sendWelcomeEmail.mockResolvedValue({ sent: false, reason: "not_configured" });

    await GET(makeRequest("https://go-daily.local/auth/callback?code=abc"));

    expect(spies.update).not.toHaveBeenCalled();
  });

  it("logs a warning when the post-send profile update fails (but still redirects)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { client } = buildSupabase({
      profile: { welcome_email_sent_at: null },
      updateError: { message: "DB unavailable" },
    });
    supabaseMocks.createClient.mockResolvedValue(client);
    emailMocks.sendWelcomeEmail.mockResolvedValue({ sent: true, id: "msg" });

    const response = await GET(makeRequest("https://go-daily.local/auth/callback?code=abc"));

    expect(warnSpy).toHaveBeenCalledWith(
      "[auth/callback] failed to mark welcome email sent",
      expect.objectContaining({ userId: "u-1", message: "DB unavailable" }),
    );
    // Still redirects to the target — DB bookkeeping failure does not break
    // the user's login flow.
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://go-daily.local/en");
  });

  it("swallows unexpected errors in the welcome-email helper without breaking the redirect", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const supabase = {
      auth: {
        exchangeCodeForSession: vi.fn(async () => ({ data: {}, error: null })),
        getUser: vi.fn(async () => {
          throw new Error("auth subsystem panic");
        }),
      },
      from: vi.fn(),
    };
    supabaseMocks.createClient.mockResolvedValue(supabase);

    const response = await GET(
      makeRequest("https://go-daily.local/auth/callback?code=abc&next=%2Fen%2Ftoday"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://go-daily.local/en/today");
    expect(warnSpy).toHaveBeenCalledWith(
      "[auth/callback] welcome email skipped",
      expect.any(Error),
    );
  });
});

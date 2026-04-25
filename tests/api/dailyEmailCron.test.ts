/**
 * @vitest-environment node
 *
 * Covers app/api/cron/daily-email/route.ts — the Vercel cron entrypoint that
 * fans out the daily puzzle email. This is the only API route Frank just wired
 * up via Resend DNS, so it carries the highest blast-radius if it regresses:
 * a silent miss = users get no email; a silent retry = users get duplicates.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMocks = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
}));
const emailMocks = vi.hoisted(() => ({
  sendDailyPuzzleEmail: vi.fn(),
}));
const puzzleMocks = vi.hoisted(() => ({
  getPuzzleForDate: vi.fn(),
  todayLocalKey: vi.fn(() => "2026-04-25"),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: supabaseMocks.createServiceClient,
}));

vi.mock("@/lib/email", () => ({
  sendDailyPuzzleEmail: emailMocks.sendDailyPuzzleEmail,
}));

vi.mock("@/lib/puzzleOfTheDay", () => ({
  getPuzzleForDate: puzzleMocks.getPuzzleForDate,
  todayLocalKey: puzzleMocks.todayLocalKey,
}));

import { GET } from "@/app/api/cron/daily-email/route";

type ProfileRow = {
  user_id: string;
  locale: string | null;
  email_opt_out: boolean | null;
  email_unsubscribe_token: string | null;
  daily_email_last_sent_on: string | null;
};

type ProfileQueryResult = { data?: ProfileRow[] | null; error?: { message: string } | null };
type UpdateResult = { error?: { message: string } | null };

interface AdminClientOptions {
  profileResult?: ProfileQueryResult;
  updateResult?: UpdateResult;
  // Maps user_id → response. Falls back to a per-user synthetic email if
  // missing so happy-path tests don't need to enumerate every row.
  userLookups?: Record<
    string,
    { data?: { user?: { email?: string | null } | null }; error?: { message: string } | null }
  >;
}

function buildAdminClient({
  profileResult = { data: [], error: null },
  updateResult = { error: null },
  userLookups = {},
}: AdminClientOptions = {}) {
  // Spies live outside the chain factory so tests can assert on them.
  const eqSpy = vi.fn();
  const limitSpy = vi.fn();
  const updateSpy = vi.fn();
  const updateEqSpy = vi.fn();
  const getUserByIdSpy = vi.fn(async (userId: string) => {
    if (userId in userLookups) {
      return userLookups[userId];
    }
    return { data: { user: { email: `${userId}@example.com` } }, error: null };
  });

  // Supabase query builders are thenables: you can keep chaining filters and
  // then await the whole thing. The route does:
  //   admin.from("profiles").select(...).eq(...).limit(...);  // optional .eq for locale
  //   await profileQuery;
  // So .limit() must return something that exposes BOTH another .eq() AND
  // an awaitable then().
  function selectThenable(): Record<string, unknown> {
    const node: Record<string, unknown> = {
      eq: vi.fn((column: string, value: unknown) => {
        eqSpy(column, value);
        return selectThenable();
      }),
      then: (
        resolve: (value: ProfileQueryResult) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => Promise.resolve(profileResult).then(resolve, reject),
    };
    return node;
  }

  const fromSpy = vi.fn(() => {
    const chain: Record<string, unknown> = {
      select: vi.fn(() => chain),
      eq: vi.fn((column: string, value: unknown) => {
        eqSpy(column, value);
        return chain;
      }),
      limit: vi.fn((value: number) => {
        limitSpy(value);
        return selectThenable();
      }),
      update: vi.fn((payload: unknown) => {
        updateSpy(payload);
        // After update(), the route does .eq("user_id", id) and awaits.
        return {
          eq: vi.fn((column: string, value: unknown) => {
            updateEqSpy(column, value);
            return Promise.resolve(updateResult);
          }),
        };
      }),
    };
    return chain;
  });

  const client = {
    from: fromSpy,
    auth: {
      admin: {
        getUserById: getUserByIdSpy,
      },
    },
  };

  return { client, fromSpy, eqSpy, limitSpy, updateSpy, updateEqSpy, getUserByIdSpy };
}

function makeRequest(url = "http://localhost/api/cron/daily-email", init?: RequestInit): Request {
  return new Request(url, {
    method: "GET",
    ...init,
  });
}

const samplePuzzle = {
  id: "cld-001",
  date: "2026-04-25",
  prompt: {
    zh: "黑先活",
    en: "Black to live",
    ja: "黒先活",
    ko: "흑선활",
  },
};

describe("/api/cron/daily-email — auth", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    emailMocks.sendDailyPuzzleEmail.mockReset();
    puzzleMocks.getPuzzleForDate.mockResolvedValue(samplePuzzle);
    puzzleMocks.todayLocalKey.mockReturnValue("2026-04-25");
    process.env = {
      ...originalEnv,
      NODE_ENV: "production",
      CRON_SECRET: "expected-secret",
    };
    const { client } = buildAdminClient();
    supabaseMocks.createServiceClient.mockReturnValue(client);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns 401 when CRON_SECRET is set but Authorization is missing", async () => {
    const response = await GET(makeRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
    expect(emailMocks.sendDailyPuzzleEmail).not.toHaveBeenCalled();
  });

  it("returns 401 when CRON_SECRET is set but the bearer is wrong", async () => {
    const response = await GET(
      makeRequest("http://localhost/api/cron/daily-email", {
        headers: { authorization: "Bearer wrong-secret" },
      }),
    );

    expect(response.status).toBe(401);
    expect(emailMocks.sendDailyPuzzleEmail).not.toHaveBeenCalled();
  });

  it("returns 401 in production when CRON_SECRET is unset (refuses to fail-open)", async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(makeRequest());

    expect(response.status).toBe(401);
  });

  it("allows the request in non-production when CRON_SECRET is unset (local dev)", async () => {
    delete process.env.CRON_SECRET;
    vi.stubEnv("NODE_ENV", "development");

    const response = await GET(makeRequest());

    expect(response.status).toBe(200);
    vi.unstubAllEnvs();
  });

  it("accepts the request when the bearer matches CRON_SECRET", async () => {
    const response = await GET(
      makeRequest("http://localhost/api/cron/daily-email", {
        headers: { authorization: "Bearer expected-secret" },
      }),
    );

    expect(response.status).toBe(200);
  });

  it("trims whitespace from CRON_SECRET so accidental newline-padded env vars still validate", async () => {
    process.env.CRON_SECRET = "  padded-secret  ";

    const response = await GET(
      makeRequest("http://localhost/api/cron/daily-email", {
        headers: { authorization: "Bearer padded-secret" },
      }),
    );

    expect(response.status).toBe(200);
  });
});

describe("/api/cron/daily-email — locale filter & batch size", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    emailMocks.sendDailyPuzzleEmail.mockReset();
    puzzleMocks.getPuzzleForDate.mockResolvedValue(samplePuzzle);
    puzzleMocks.todayLocalKey.mockReturnValue("2026-04-25");
    process.env = { ...originalEnv, NODE_ENV: "development" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("applies ?locale=zh as an extra eq filter on the profile query", async () => {
    const { client, eqSpy } = buildAdminClient();
    supabaseMocks.createServiceClient.mockReturnValue(client);

    const response = await GET(makeRequest("http://localhost/api/cron/daily-email?locale=zh"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.locale).toBe("zh");
    // First eq is the email_opt_out=false filter, second is the locale filter.
    expect(eqSpy).toHaveBeenCalledWith("email_opt_out", false);
    expect(eqSpy).toHaveBeenCalledWith("locale", "zh");
  });

  it("ignores ?locale=xx (unsupported) and falls back to no locale filter", async () => {
    const { client, eqSpy } = buildAdminClient();
    supabaseMocks.createServiceClient.mockReturnValue(client);

    const response = await GET(makeRequest("http://localhost/api/cron/daily-email?locale=xx"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.locale).toBeNull();
    expect(eqSpy).toHaveBeenCalledWith("email_opt_out", false);
    expect(eqSpy).not.toHaveBeenCalledWith("locale", expect.any(String));
  });

  it("uses default batch size of 50 when EMAIL_CRON_BATCH_SIZE is unset", async () => {
    delete process.env.EMAIL_CRON_BATCH_SIZE;
    const { client, limitSpy } = buildAdminClient();
    supabaseMocks.createServiceClient.mockReturnValue(client);

    await GET(makeRequest());

    expect(limitSpy).toHaveBeenCalledWith(50);
  });

  it("respects a valid EMAIL_CRON_BATCH_SIZE", async () => {
    process.env.EMAIL_CRON_BATCH_SIZE = "25";
    const { client, limitSpy } = buildAdminClient();
    supabaseMocks.createServiceClient.mockReturnValue(client);

    await GET(makeRequest());

    expect(limitSpy).toHaveBeenCalledWith(25);
  });

  it("caps EMAIL_CRON_BATCH_SIZE at the 100-row maximum", async () => {
    process.env.EMAIL_CRON_BATCH_SIZE = "5000";
    const { client, limitSpy } = buildAdminClient();
    supabaseMocks.createServiceClient.mockReturnValue(client);

    await GET(makeRequest());

    expect(limitSpy).toHaveBeenCalledWith(100);
  });

  it("falls back to default batch size when EMAIL_CRON_BATCH_SIZE is non-numeric", async () => {
    process.env.EMAIL_CRON_BATCH_SIZE = "not-a-number";
    const { client, limitSpy } = buildAdminClient();
    supabaseMocks.createServiceClient.mockReturnValue(client);

    await GET(makeRequest());

    expect(limitSpy).toHaveBeenCalledWith(50);
  });

  it("falls back to default batch size when EMAIL_CRON_BATCH_SIZE is zero or negative", async () => {
    process.env.EMAIL_CRON_BATCH_SIZE = "-5";
    const { client, limitSpy } = buildAdminClient();
    supabaseMocks.createServiceClient.mockReturnValue(client);

    await GET(makeRequest());

    expect(limitSpy).toHaveBeenCalledWith(50);
  });
});

describe("/api/cron/daily-email — send pipeline", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    emailMocks.sendDailyPuzzleEmail.mockReset();
    puzzleMocks.getPuzzleForDate.mockResolvedValue(samplePuzzle);
    puzzleMocks.todayLocalKey.mockReturnValue("2026-04-25");
    process.env = { ...originalEnv, NODE_ENV: "development" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns 500 when the profile query fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = buildAdminClient({
      profileResult: { data: null, error: { message: "boom" } },
    });
    supabaseMocks.createServiceClient.mockReturnValue(client);

    const response = await GET(makeRequest());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "profile_query_failed" });
    expect(errorSpy).toHaveBeenCalledWith(
      "[cron/daily-email] profile query failed",
      expect.objectContaining({ message: "boom" }),
    );
  });

  it("returns 200 with zero counts when no profiles match", async () => {
    const { client } = buildAdminClient({ profileResult: { data: [], error: null } });
    supabaseMocks.createServiceClient.mockReturnValue(client);

    const response = await GET(makeRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      date: "2026-04-25",
      attempted: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
    });
    expect(emailMocks.sendDailyPuzzleEmail).not.toHaveBeenCalled();
  });

  it("filters out users whose daily_email_last_sent_on already equals today", async () => {
    const { client } = buildAdminClient({
      profileResult: {
        data: [
          {
            user_id: "user-already",
            locale: "en",
            email_opt_out: false,
            email_unsubscribe_token: "tok-1",
            daily_email_last_sent_on: "2026-04-25",
          },
          {
            user_id: "user-new",
            locale: "en",
            email_opt_out: false,
            email_unsubscribe_token: "tok-2",
            daily_email_last_sent_on: "2026-04-24",
          },
        ],
        error: null,
      },
    });
    supabaseMocks.createServiceClient.mockReturnValue(client);
    emailMocks.sendDailyPuzzleEmail.mockResolvedValue({ sent: true, id: "msg-1" });

    const response = await GET(makeRequest());

    const body = await response.json();
    expect(body.attempted).toBe(1);
    expect(body.sent).toBe(1);
    expect(emailMocks.sendDailyPuzzleEmail).toHaveBeenCalledTimes(1);
    expect(emailMocks.sendDailyPuzzleEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "user-new@example.com", locale: "en" }),
    );
  });

  it("defends against email_opt_out=true rows even if the DB filter slips", async () => {
    // The query already includes .eq("email_opt_out", false) but the route
    // re-filters in-memory. Belt-and-suspenders: this test exercises the
    // post-fetch filter explicitly.
    const { client } = buildAdminClient({
      profileResult: {
        data: [
          {
            user_id: "user-opted-out",
            locale: "en",
            email_opt_out: true,
            email_unsubscribe_token: "tok",
            daily_email_last_sent_on: null,
          },
        ],
        error: null,
      },
    });
    supabaseMocks.createServiceClient.mockReturnValue(client);

    const response = await GET(makeRequest());

    const body = await response.json();
    expect(body.attempted).toBe(0);
    expect(body.sent).toBe(0);
    expect(emailMocks.sendDailyPuzzleEmail).not.toHaveBeenCalled();
  });

  it("skips users whose auth lookup returns an error", async () => {
    const { client } = buildAdminClient({
      profileResult: {
        data: [
          {
            user_id: "user-broken",
            locale: "en",
            email_opt_out: false,
            email_unsubscribe_token: "tok",
            daily_email_last_sent_on: null,
          },
        ],
        error: null,
      },
      userLookups: {
        "user-broken": { data: { user: null }, error: { message: "user not found" } },
      },
    });
    supabaseMocks.createServiceClient.mockReturnValue(client);

    const response = await GET(makeRequest());

    const body = await response.json();
    expect(body.skipped).toBe(1);
    expect(body.sent).toBe(0);
    expect(emailMocks.sendDailyPuzzleEmail).not.toHaveBeenCalled();
  });

  it("skips users whose auth row has no email", async () => {
    const { client } = buildAdminClient({
      profileResult: {
        data: [
          {
            user_id: "user-no-email",
            locale: "en",
            email_opt_out: false,
            email_unsubscribe_token: null,
            daily_email_last_sent_on: null,
          },
        ],
        error: null,
      },
      userLookups: {
        "user-no-email": { data: { user: { email: null } }, error: null },
      },
    });
    supabaseMocks.createServiceClient.mockReturnValue(client);

    const response = await GET(makeRequest());

    const body = await response.json();
    expect(body.skipped).toBe(1);
    expect(emailMocks.sendDailyPuzzleEmail).not.toHaveBeenCalled();
  });

  it("counts not_configured send results as skipped, not failed", async () => {
    const { client } = buildAdminClient({
      profileResult: {
        data: [
          {
            user_id: "user-1",
            locale: "en",
            email_opt_out: false,
            email_unsubscribe_token: "tok",
            daily_email_last_sent_on: null,
          },
        ],
        error: null,
      },
    });
    supabaseMocks.createServiceClient.mockReturnValue(client);
    emailMocks.sendDailyPuzzleEmail.mockResolvedValue({ sent: false, reason: "not_configured" });

    const response = await GET(makeRequest());

    const body = await response.json();
    expect(body.skipped).toBe(1);
    expect(body.failed).toBe(0);
    expect(body.sent).toBe(0);
  });

  it("counts send_failed and timeout reasons as failed", async () => {
    const { client } = buildAdminClient({
      profileResult: {
        data: [
          {
            user_id: "user-a",
            locale: "en",
            email_opt_out: false,
            email_unsubscribe_token: "tok-a",
            daily_email_last_sent_on: null,
          },
          {
            user_id: "user-b",
            locale: "en",
            email_opt_out: false,
            email_unsubscribe_token: "tok-b",
            daily_email_last_sent_on: null,
          },
        ],
        error: null,
      },
    });
    supabaseMocks.createServiceClient.mockReturnValue(client);
    emailMocks.sendDailyPuzzleEmail
      .mockResolvedValueOnce({ sent: false, reason: "send_failed" })
      .mockResolvedValueOnce({ sent: false, reason: "timeout" });

    const response = await GET(makeRequest());

    const body = await response.json();
    expect(body.failed).toBe(2);
    expect(body.skipped).toBe(0);
    expect(body.sent).toBe(0);
  });

  it("marks the profile sent on a successful send and increments the sent counter", async () => {
    const { client, fromSpy, updateSpy, updateEqSpy } = buildAdminClient({
      profileResult: {
        data: [
          {
            user_id: "user-1",
            locale: "ja",
            email_opt_out: false,
            email_unsubscribe_token: "unsub-1",
            daily_email_last_sent_on: null,
          },
        ],
        error: null,
      },
    });
    supabaseMocks.createServiceClient.mockReturnValue(client);
    emailMocks.sendDailyPuzzleEmail.mockResolvedValue({ sent: true, id: "resend-id" });

    const response = await GET(makeRequest());

    const body = await response.json();
    expect(body.sent).toBe(1);
    expect(body.skipped).toBe(0);
    expect(body.failed).toBe(0);

    // Both the select and the update go through admin.from("profiles").
    expect(fromSpy).toHaveBeenCalledWith("profiles");
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        daily_email_last_sent_on: "2026-04-25",
        updated_at: expect.any(String),
      }),
    );
    expect(updateEqSpy).toHaveBeenCalledWith("user_id", "user-1");

    // Locale was forwarded verbatim.
    expect(emailMocks.sendDailyPuzzleEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user-1@example.com",
        locale: "ja",
        unsubscribeToken: "unsub-1",
      }),
    );
  });

  it("falls back to 'en' when profile.locale is invalid or missing", async () => {
    const { client } = buildAdminClient({
      profileResult: {
        data: [
          {
            user_id: "user-bad-locale",
            locale: "klingon",
            email_opt_out: false,
            email_unsubscribe_token: null,
            daily_email_last_sent_on: null,
          },
          {
            user_id: "user-null-locale",
            locale: null,
            email_opt_out: false,
            email_unsubscribe_token: null,
            daily_email_last_sent_on: null,
          },
        ],
        error: null,
      },
    });
    supabaseMocks.createServiceClient.mockReturnValue(client);
    emailMocks.sendDailyPuzzleEmail.mockResolvedValue({ sent: true, id: null });

    await GET(makeRequest());

    expect(emailMocks.sendDailyPuzzleEmail).toHaveBeenCalledTimes(2);
    expect(emailMocks.sendDailyPuzzleEmail).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ locale: "en" }),
    );
    expect(emailMocks.sendDailyPuzzleEmail).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ locale: "en" }),
    );
  });

  it("counts a failure when sending succeeds but the profile update fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { client } = buildAdminClient({
      profileResult: {
        data: [
          {
            user_id: "user-update-fail",
            locale: "en",
            email_opt_out: false,
            email_unsubscribe_token: null,
            daily_email_last_sent_on: null,
          },
        ],
        error: null,
      },
      updateResult: { error: { message: "DB unavailable" } },
    });
    supabaseMocks.createServiceClient.mockReturnValue(client);
    emailMocks.sendDailyPuzzleEmail.mockResolvedValue({ sent: true, id: "resend-id" });

    const response = await GET(makeRequest());

    const body = await response.json();
    // Email went out but bookkeeping failed — counted as failed so the
    // operator can investigate. Sent is NOT incremented (would risk a duplicate
    // tomorrow without the marker).
    expect(body.sent).toBe(0);
    expect(body.failed).toBe(1);
    expect(warnSpy).toHaveBeenCalledWith(
      "[cron/daily-email] failed to mark profile sent",
      expect.objectContaining({ userId: "user-update-fail", message: "DB unavailable" }),
    );
  });

  it("processes a mixed batch and tallies sent/skipped/failed correctly", async () => {
    const { client } = buildAdminClient({
      profileResult: {
        data: [
          {
            user_id: "user-ok",
            locale: "en",
            email_opt_out: false,
            email_unsubscribe_token: "ok-tok",
            daily_email_last_sent_on: null,
          },
          {
            user_id: "user-no-email",
            locale: "en",
            email_opt_out: false,
            email_unsubscribe_token: null,
            daily_email_last_sent_on: null,
          },
          {
            user_id: "user-fail",
            locale: "en",
            email_opt_out: false,
            email_unsubscribe_token: "fail-tok",
            daily_email_last_sent_on: null,
          },
          {
            user_id: "user-already",
            locale: "en",
            email_opt_out: false,
            email_unsubscribe_token: null,
            daily_email_last_sent_on: "2026-04-25",
          },
        ],
        error: null,
      },
      userLookups: {
        "user-no-email": { data: { user: { email: null } }, error: null },
      },
    });
    supabaseMocks.createServiceClient.mockReturnValue(client);
    emailMocks.sendDailyPuzzleEmail
      .mockResolvedValueOnce({ sent: true, id: "ok-id" }) // user-ok
      // user-no-email is skipped before it reaches send.
      .mockResolvedValueOnce({ sent: false, reason: "send_failed" }); // user-fail

    const response = await GET(makeRequest());

    const body = await response.json();
    // user-already is filtered before attempted is computed.
    expect(body.attempted).toBe(3);
    expect(body.sent).toBe(1);
    expect(body.skipped).toBe(1);
    expect(body.failed).toBe(1);
  });

  it("forwards the resolved puzzle from getPuzzleForDate to sendDailyPuzzleEmail", async () => {
    const customPuzzle = { ...samplePuzzle, id: "custom-puzzle" };
    puzzleMocks.getPuzzleForDate.mockResolvedValueOnce(customPuzzle);

    const { client } = buildAdminClient({
      profileResult: {
        data: [
          {
            user_id: "user-1",
            locale: "en",
            email_opt_out: false,
            email_unsubscribe_token: null,
            daily_email_last_sent_on: null,
          },
        ],
        error: null,
      },
    });
    supabaseMocks.createServiceClient.mockReturnValue(client);
    emailMocks.sendDailyPuzzleEmail.mockResolvedValue({ sent: true, id: null });

    await GET(makeRequest());

    expect(puzzleMocks.getPuzzleForDate).toHaveBeenCalledWith("2026-04-25");
    expect(emailMocks.sendDailyPuzzleEmail).toHaveBeenCalledWith(
      expect.objectContaining({ puzzle: customPuzzle }),
    );
  });
});

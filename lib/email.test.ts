// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// siteUrl reads NEXT_PUBLIC_SITE_URL at import time — stub it before we
// import anything that transitively needs absoluteUrl().
process.env.NEXT_PUBLIC_SITE_URL = "https://go-daily.app";

import {
  sendDailyPuzzleEmail,
  sendPaymentFailedEmail,
  sendWelcomeEmail,
  unsubscribeUrl,
} from "./email";

const ORIGINAL_FETCH = globalThis.fetch;

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  process.env.RESEND_API_KEY = "re_test_key";
  delete process.env.EMAIL_FROM;
  delete process.env.EMAIL_REPLY_TO;
  vi.restoreAllMocks();
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

describe("unsubscribeUrl", () => {
  it("returns undefined for null / empty / whitespace tokens", () => {
    expect(unsubscribeUrl(null)).toBeUndefined();
    expect(unsubscribeUrl(undefined)).toBeUndefined();
    expect(unsubscribeUrl("")).toBeUndefined();
    expect(unsubscribeUrl("   ")).toBeUndefined();
  });

  it("percent-encodes the token into the unsubscribe URL", () => {
    const url = unsubscribeUrl("abc/def+ghi");
    expect(url).toBe("https://go-daily.app/email/unsubscribe?token=abc%2Fdef%2Bghi");
  });

  it("trims surrounding whitespace", () => {
    expect(unsubscribeUrl("  hello  ")).toBe("https://go-daily.app/email/unsubscribe?token=hello");
  });
});

describe("sendWelcomeEmail — guards", () => {
  it("returns missing_recipient when `to` is blank", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const result = await sendWelcomeEmail({ to: "  ", locale: "en" });
    expect(result).toEqual({ sent: false, reason: "missing_recipient" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns not_configured when RESEND_API_KEY missing", async () => {
    delete process.env.RESEND_API_KEY;
    const spy = vi.spyOn(globalThis, "fetch");
    const result = await sendWelcomeEmail({ to: "a@b.com", locale: "en" });
    expect(result).toEqual({ sent: false, reason: "not_configured" });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("sendWelcomeEmail — success path", () => {
  it("posts to Resend with expected payload and returns the message id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "em_abc123" }));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const result = await sendWelcomeEmail({
      to: "player@example.com",
      locale: "zh",
      unsubscribeToken: "tok123",
    });

    expect(result).toEqual({ sent: true, id: "em_abc123" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer re_test_key");

    const payload = JSON.parse(init.body as string);
    expect(payload.to).toEqual(["player@example.com"]);
    expect(payload.subject).toBe("欢迎来到 go-daily"); // zh copy
    expect(payload.html).toContain("https://go-daily.app/zh/today"); // CTA URL
    expect(payload.html).toContain("https://go-daily.app/email/unsubscribe?token=tok123"); // unsubscribe
    expect(payload.text).toContain("https://go-daily.app/zh/today");
  });

  it("omits unsubscribe when token absent", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "em_x" }));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await sendWelcomeEmail({ to: "a@b.com", locale: "en" });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.html).not.toContain("/email/unsubscribe");
    expect(body.text).not.toContain("Unsubscribe:");
  });

  it("honors EMAIL_FROM override", async () => {
    process.env.EMAIL_FROM = "custom <bot@go-daily.app>";
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "em_x" }));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await sendWelcomeEmail({ to: "a@b.com", locale: "en" });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.from).toBe("custom <bot@go-daily.app>");
  });
});

describe("sendWelcomeEmail — failure paths", () => {
  it("returns send_failed on non-2xx response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ message: "bad request" }, { status: 400 }));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const result = await sendWelcomeEmail({ to: "a@b.com", locale: "en" });
    expect(result).toEqual({ sent: false, reason: "send_failed" });
  });

  it("returns timeout when fetch aborts", async () => {
    const fetchMock = vi.fn().mockImplementation(() => {
      const err = new Error("The operation was aborted");
      (err as Error & { name: string }).name = "AbortError";
      return Promise.reject(err);
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const result = await sendWelcomeEmail({ to: "a@b.com", locale: "en" });
    expect(result).toEqual({ sent: false, reason: "timeout" });
  });

  it("returns send_failed on generic network error", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const result = await sendWelcomeEmail({ to: "a@b.com", locale: "en" });
    expect(result).toEqual({ sent: false, reason: "send_failed" });
  });
});

describe("sendPaymentFailedEmail", () => {
  it("uses portalUrl as CTA (not /today)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "em_y" }));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await sendPaymentFailedEmail({
      to: "a@b.com",
      locale: "ja",
      portalUrl: "https://billing.stripe.com/p/session_xyz",
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.subject).toBe("go-daily のお支払いに失敗しました");
    expect(body.html).toContain("https://billing.stripe.com/p/session_xyz");
    expect(body.html).not.toContain("/ja/today");
  });
});

describe("sendDailyPuzzleEmail", () => {
  const puzzle = {
    id: "tsumego-0042",
    prompt: {
      zh: "第一行\n第二行",
      en: "Line one\nLine two",
      ja: "一行目\n二行目",
      ko: "첫 번째 줄\n두 번째 줄",
    },
  };

  it("renders locale-specific prompt and puzzle URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "em_d" }));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await sendDailyPuzzleEmail({ to: "a@b.com", locale: "ko", puzzle });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);

    expect(body.subject).toBe("오늘의 go-daily 바둑 문제");
    expect(body.html).toContain("https://go-daily.app/ko/puzzles/tsumego-0042");
    // Regression: newlines should become <br> in HTML but stay as \n in text.
    expect(body.html).toContain("첫 번째 줄<br>두 번째 줄");
    expect(body.text).toContain("첫 번째 줄\n두 번째 줄");
  });

  it("falls back to en prompt when locale text missing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "em_e" }));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const partialPuzzle = {
      id: "p1",
      prompt: { zh: "", en: "English fallback", ja: "", ko: "" },
    };
    await sendDailyPuzzleEmail({ to: "a@b.com", locale: "ja", puzzle: partialPuzzle });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.html).toContain("English fallback");
  });

  it("URL-encodes puzzle id with special chars", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "em_f" }));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const p = { id: "foo bar/baz", prompt: puzzle.prompt };
    await sendDailyPuzzleEmail({ to: "a@b.com", locale: "en", puzzle: p });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.html).toContain("/puzzles/foo%20bar%2Fbaz");
  });
});

describe("HTML escaping", () => {
  it("escapes <, >, \", ', & in user-influenced fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "em_g" }));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const hostilePrompt = `<script>alert('xss')</script> & "quoted"`;
    await sendDailyPuzzleEmail({
      to: "a@b.com",
      locale: "en",
      puzzle: {
        id: "p",
        prompt: { zh: "", en: hostilePrompt, ja: "", ko: "" },
      },
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.html).not.toContain("<script>");
    expect(body.html).toContain("&lt;script&gt;");
    expect(body.html).toContain("&#39;xss&#39;");
    expect(body.html).toContain("&quot;quoted&quot;");
    expect(body.html).toContain("&amp;");
  });
});

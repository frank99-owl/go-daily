import { DEFAULT_LOCALE, localePath, negotiateLocaleFromHeader } from "@/lib/i18n/localePath";
import { createServiceClient } from "@/lib/supabase/service";
import type { Locale } from "@/types";

export const runtime = "nodejs";

type UnsubscribeResult = "unsubscribed" | "unsubscribe_invalid" | "unsubscribe_failed";

type UnsubscribeCopy = {
  title: string;
  body: string;
  cta: string;
};

const COPY: Record<Locale, Record<UnsubscribeResult, UnsubscribeCopy>> = {
  zh: {
    unsubscribed: {
      title: "已退订邮件提醒",
      body: "你不会再收到 go-daily 的每日题目提醒邮件。",
      cta: "返回 go-daily",
    },
    unsubscribe_invalid: {
      title: "退订链接无效",
      body: "这个链接缺少有效令牌，或者已经不再匹配任何账号。",
      cta: "返回 go-daily",
    },
    unsubscribe_failed: {
      title: "暂时无法退订",
      body: "我们没能保存这次退订。请稍后再试，或直接回复邮件联系支持。",
      cta: "返回 go-daily",
    },
  },
  en: {
    unsubscribed: {
      title: "You're unsubscribed",
      body: "You won't receive go-daily's daily puzzle reminder emails anymore.",
      cta: "Return to go-daily",
    },
    unsubscribe_invalid: {
      title: "This unsubscribe link is invalid",
      body: "The link is missing a valid token or no longer matches an account.",
      cta: "Return to go-daily",
    },
    unsubscribe_failed: {
      title: "Couldn't unsubscribe",
      body: "We couldn't save this unsubscribe request. Please try again later or reply to the email for support.",
      cta: "Return to go-daily",
    },
  },
  ja: {
    unsubscribed: {
      title: "配信停止しました",
      body: "go-daily の毎日のパズルリマインダーメールは今後送信されません。",
      cta: "go-daily に戻る",
    },
    unsubscribe_invalid: {
      title: "配信停止リンクが無効です",
      body: "有効なトークンがないか、どのアカウントにも一致しないリンクです。",
      cta: "go-daily に戻る",
    },
    unsubscribe_failed: {
      title: "配信停止できませんでした",
      body: "この配信停止リクエストを保存できませんでした。後でもう一度お試しください。",
      cta: "go-daily に戻る",
    },
  },
  ko: {
    unsubscribed: {
      title: "수신 거부되었습니다",
      body: "이제 go-daily의 일일 퍼즐 리마인더 이메일을 받지 않습니다.",
      cta: "go-daily로 돌아가기",
    },
    unsubscribe_invalid: {
      title: "수신 거부 링크가 올바르지 않습니다",
      body: "유효한 토큰이 없거나 어떤 계정과도 일치하지 않는 링크입니다.",
      cta: "go-daily로 돌아가기",
    },
    unsubscribe_failed: {
      title: "수신 거부할 수 없습니다",
      body: "이 수신 거부 요청을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      cta: "go-daily로 돌아가기",
    },
  },
};

async function markEmailOptOut(token: string | null | undefined): Promise<UnsubscribeResult> {
  const trimmed = token?.trim();
  if (!trimmed) return "unsubscribe_invalid";

  try {
    const admin = createServiceClient();
    const { data, error } = await admin
      .from("profiles")
      .update({ email_opt_out: true, updated_at: new Date().toISOString() })
      .eq("email_unsubscribe_token", trimmed)
      .select("user_id")
      .maybeSingle();

    if (error) return "unsubscribe_failed";
    return data ? "unsubscribed" : "unsubscribe_invalid";
  } catch (error) {
    console.warn("[email/unsubscribe] failed", error);
    return "unsubscribe_failed";
  }
}

function statusFor(result: UnsubscribeResult): number {
  if (result === "unsubscribe_failed") return 500;
  if (result === "unsubscribe_invalid") return 400;
  return 200;
}

function renderConfirmationPage(
  result: UnsubscribeResult,
  locale: Locale,
  origin: string,
): Response {
  const copy = COPY[locale][result];
  const homeUrl = new URL(localePath(locale, "/"), origin).toString();

  return new Response(
    `<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>${copy.title} · go-daily</title>
    <style>
      :root { color-scheme: dark; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #050505;
        color: #f7f7f2;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        width: min(520px, calc(100vw - 40px));
        text-align: center;
      }
      .mark {
        width: 40px;
        height: 40px;
        margin: 0 auto 20px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        border: 1px solid #0eddea;
        color: #0eddea;
        font-size: 24px;
        line-height: 1;
      }
      h1 {
        margin: 0;
        font-size: clamp(28px, 6vw, 44px);
        line-height: 1.1;
        letter-spacing: 0;
      }
      p {
        margin: 16px 0 28px;
        color: #b7b7b7;
        font-size: 17px;
        line-height: 1.6;
      }
      a {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 44px;
        padding: 0 18px;
        border: 1px solid #3a3a3a;
        border-radius: 6px;
        color: #f7f7f2;
        text-decoration: none;
        font-weight: 650;
      }
      a:focus-visible {
        outline: 2px solid #0eddea;
        outline-offset: 4px;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="mark" aria-hidden="true">${result === "unsubscribed" ? "✓" : "!"}</div>
      <h1>${copy.title}</h1>
      <p>${copy.body}</p>
      <a href="${homeUrl}">${copy.cta}</a>
    </main>
  </body>
</html>`,
    {
      status: statusFor(result),
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim();
  const locale =
    negotiateLocaleFromHeader(request.headers.get("accept-language")) || DEFAULT_LOCALE;
  const result = await markEmailOptOut(token);

  return renderConfirmationPage(result, locale, url.origin);
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const result = await markEmailOptOut(url.searchParams.get("token"));
  return new Response(null, { status: result === "unsubscribe_failed" ? 500 : 200 });
}

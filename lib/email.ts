import { localePath } from "@/lib/i18n/localePath";
import { absoluteUrl } from "@/lib/siteUrl";
import type { Locale, Puzzle } from "@/types";

if (typeof window !== "undefined") {
  throw new Error(
    "lib/email.ts must only be imported on the server. " +
      "Check that your client component is not importing this module.",
  );
}

type EmailSendResult =
  | { sent: true; id: string | null }
  | { sent: false; reason: "not_configured" | "send_failed" | "missing_recipient" | "timeout" };

const RESEND_TIMEOUT_MS = 15_000;

type EmailCopy = {
  subject: string;
  preheader: string;
  heading: string;
  body: string;
  cta: string;
  footer: string;
};

const DEFAULT_FROM = "go-daily <hello@go-daily.app>";

const WELCOME_COPY: Record<Locale, EmailCopy> = {
  zh: {
    subject: "欢迎来到 go-daily",
    preheader: "今天的围棋题已经准备好了。",
    heading: "欢迎来到 go-daily",
    body: "每天一题，稳稳推进。今天的题已经准备好，你可以从今日题目开始。",
    cta: "开始今日题目",
    footer: "你收到这封邮件，是因为你刚刚登录或注册了 go-daily。",
  },
  en: {
    subject: "Welcome to go-daily",
    preheader: "Today's Go puzzle is ready.",
    heading: "Welcome to go-daily",
    body: "One Go puzzle a day, with steady practice over time. Today's puzzle is ready when you are.",
    cta: "Start today's puzzle",
    footer: "You received this because you just signed in or signed up for go-daily.",
  },
  ja: {
    subject: "go-daily へようこそ",
    preheader: "今日の囲碁問題を用意しました。",
    heading: "go-daily へようこそ",
    body: "毎日一題、少しずつ積み上げましょう。今日の問題から始められます。",
    cta: "今日の問題を解く",
    footer: "このメールは、go-daily にログインまたは登録したため送信されています。",
  },
  ko: {
    subject: "go-daily에 오신 것을 환영합니다",
    preheader: "오늘의 바둑 문제가 준비되었습니다.",
    heading: "go-daily에 오신 것을 환영합니다",
    body: "하루 한 문제씩 차분히 쌓아가세요. 오늘의 문제가 준비되어 있습니다.",
    cta: "오늘의 문제 풀기",
    footer: "go-daily에 로그인하거나 가입했기 때문에 이 메일을 보냈습니다.",
  },
};

const PAYMENT_FAILED_COPY: Record<Locale, EmailCopy> = {
  zh: {
    subject: "go-daily 付款未成功",
    preheader: "请更新你的付款方式，以继续使用 Pro。",
    heading: "付款未成功",
    body: "Stripe 通知我们最近一次订阅付款未成功。请在账单门户更新付款方式，避免 Pro 权益中断。",
    cta: "更新付款方式",
    footer: "这是一封与订阅账单相关的服务邮件。",
  },
  en: {
    subject: "go-daily payment failed",
    preheader: "Update your payment method to keep Pro active.",
    heading: "Payment failed",
    body: "Stripe let us know your latest subscription payment did not go through. Please update your payment method in the billing portal to keep Pro active.",
    cta: "Update payment method",
    footer: "This is a service email about your subscription billing.",
  },
  ja: {
    subject: "go-daily のお支払いに失敗しました",
    preheader: "Pro を継続するにはお支払い方法を更新してください。",
    heading: "お支払いに失敗しました",
    body: "Stripe から、直近のサブスクリプション決済に失敗したという通知がありました。Pro を継続するには、請求ポータルでお支払い方法を更新してください。",
    cta: "お支払い方法を更新",
    footer: "これはサブスクリプション請求に関するサービスメールです。",
  },
  ko: {
    subject: "go-daily 결제 실패",
    preheader: "Pro를 계속 사용하려면 결제 수단을 업데이트하세요.",
    heading: "결제에 실패했습니다",
    body: "Stripe에서 최근 구독 결제가 실패했다고 알려왔습니다. Pro 이용이 중단되지 않도록 결제 포털에서 결제 수단을 업데이트하세요.",
    cta: "결제 수단 업데이트",
    footer: "구독 청구와 관련된 서비스 메일입니다.",
  },
};

const DAILY_PUZZLE_COPY: Record<Locale, Omit<EmailCopy, "body">> = {
  zh: {
    subject: "今天的 go-daily 围棋题",
    preheader: "今日题目已经更新。",
    heading: "今天的题目",
    cta: "打开今日题目",
    footer: "你可以通过邮件底部链接退订每日提醒。",
  },
  en: {
    subject: "Today's go-daily puzzle",
    preheader: "Your daily Go puzzle is ready.",
    heading: "Today's puzzle",
    cta: "Open today's puzzle",
    footer: "You can unsubscribe from daily reminders from the link below.",
  },
  ja: {
    subject: "今日の go-daily 囲碁問題",
    preheader: "今日の問題を更新しました。",
    heading: "今日の問題",
    cta: "今日の問題を開く",
    footer: "下のリンクから毎日のリマインダーを停止できます。",
  },
  ko: {
    subject: "오늘의 go-daily 바둑 문제",
    preheader: "오늘의 문제가 준비되었습니다.",
    heading: "오늘의 문제",
    cta: "오늘의 문제 열기",
    footer: "아래 링크에서 매일 알림 메일을 구독 해지할 수 있습니다.",
  },
};

function emailFrom(): string {
  return process.env.EMAIL_FROM?.trim() || DEFAULT_FROM;
}

function replyTo(): string | undefined {
  return process.env.EMAIL_REPLY_TO?.trim() || undefined;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * HTML-escape text AND convert newlines to <br> so multi-paragraph puzzle
 * prompts render as the author intended. Text parts keep native newlines.
 */
function escapeHtmlMultiline(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

function localizedText(value: Puzzle["prompt"], locale: Locale): string {
  return value[locale] || value.en;
}

export function unsubscribeUrl(token: string | null | undefined): string | undefined {
  const trimmed = token?.trim();
  if (!trimmed) return undefined;
  return absoluteUrl(`/email/unsubscribe?token=${encodeURIComponent(trimmed)}`);
}

function renderEmail({
  copy,
  body,
  ctaUrl,
  unsubscribe,
}: {
  copy: EmailCopy;
  body?: string;
  ctaUrl: string;
  unsubscribe?: string;
}): { html: string; text: string } {
  const safeHeading = escapeHtml(copy.heading);
  const safeBody = escapeHtmlMultiline(body ?? copy.body);
  const safeCta = escapeHtml(copy.cta);
  const safeCtaUrl = escapeHtml(ctaUrl);
  const safeFooter = escapeHtml(copy.footer);
  const unsubscribeText = unsubscribe ? `\n\nUnsubscribe: ${unsubscribe}` : "";
  const unsubscribeHtml = unsubscribe
    ? `<p style="margin:24px 0 0;font-size:12px;color:#6b7280"><a href="${escapeHtml(
        unsubscribe,
      )}" style="color:#6b7280">Unsubscribe</a></p>`
    : "";

  return {
    text: `${copy.heading}\n\n${body ?? copy.body}\n\n${copy.cta}: ${ctaUrl}\n\n${copy.footer}${unsubscribeText}`,
    html: `<!doctype html>
<html>
  <body style="margin:0;background:#f7f4ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1f2933">
    <div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0">${escapeHtml(
      copy.preheader,
    )}</div>
    <main style="max-width:560px;margin:0 auto;padding:32px 20px">
      <div style="background:#ffffff;border:1px solid #e5e0d8;border-radius:8px;padding:28px">
        <h1 style="margin:0 0 16px;font-size:24px;line-height:1.25">${safeHeading}</h1>
        <p style="margin:0 0 24px;font-size:16px;line-height:1.65;color:#374151">${safeBody}</p>
        <p style="margin:0 0 24px">
          <a href="${safeCtaUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;border-radius:6px;padding:12px 16px;font-weight:600">${safeCta}</a>
        </p>
        <p style="margin:0;font-size:13px;line-height:1.5;color:#6b7280">${safeFooter}</p>
        ${unsubscribeHtml}
      </div>
    </main>
  </body>
</html>`,
  };
}

async function sendTransactionalEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string | null | undefined;
  subject: string;
  html: string;
  text: string;
}): Promise<EmailSendResult> {
  const trimmedTo = to?.trim();
  if (!trimmedTo) return { sent: false, reason: "missing_recipient" };

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { sent: false, reason: "not_configured" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: emailFrom(),
        to: [trimmedTo],
        subject,
        html,
        text,
        reply_to: replyTo(),
      }),
      signal: controller.signal,
    });
  } catch (err) {
    const aborted = (err as { name?: string }).name === "AbortError";
    console.warn("[email] send failed", {
      subject,
      to: trimmedTo,
      reason: aborted ? "timeout" : "network",
      message: (err as Error).message,
    });
    return { sent: false, reason: aborted ? "timeout" : "send_failed" };
  } finally {
    clearTimeout(timer);
  }

  const data = (await response.json().catch(() => null)) as {
    id?: string;
    message?: string;
    name?: string;
  } | null;

  if (!response.ok) {
    console.warn("[email] send failed", {
      subject,
      to: trimmedTo,
      status: response.status,
      message: data?.message ?? data?.name ?? "unknown",
    });
    return { sent: false, reason: "send_failed" };
  }

  return { sent: true, id: data?.id ?? null };
}

export async function sendWelcomeEmail({
  to,
  locale,
  unsubscribeToken,
}: {
  to: string | null | undefined;
  locale: Locale;
  unsubscribeToken?: string | null;
}): Promise<EmailSendResult> {
  const copy = WELCOME_COPY[locale];
  const { html, text } = renderEmail({
    copy,
    ctaUrl: absoluteUrl(localePath(locale, "/today")),
    unsubscribe: unsubscribeUrl(unsubscribeToken),
  });

  return sendTransactionalEmail({ to, subject: copy.subject, html, text });
}

export async function sendPaymentFailedEmail({
  to,
  locale,
  portalUrl,
  unsubscribeToken,
}: {
  to: string | null | undefined;
  locale: Locale;
  portalUrl: string;
  unsubscribeToken?: string | null;
}): Promise<EmailSendResult> {
  const copy = PAYMENT_FAILED_COPY[locale];
  const { html, text } = renderEmail({
    copy,
    ctaUrl: portalUrl,
    unsubscribe: unsubscribeUrl(unsubscribeToken),
  });

  return sendTransactionalEmail({ to, subject: copy.subject, html, text });
}

export async function sendDailyPuzzleEmail({
  to,
  locale,
  puzzle,
  unsubscribeToken,
}: {
  to: string | null | undefined;
  locale: Locale;
  puzzle: Pick<Puzzle, "id" | "prompt">;
  unsubscribeToken?: string | null;
}): Promise<EmailSendResult> {
  const partialCopy = DAILY_PUZZLE_COPY[locale];
  const copy: EmailCopy = {
    ...partialCopy,
    body: localizedText(puzzle.prompt, locale),
  };
  const { html, text } = renderEmail({
    copy,
    ctaUrl: absoluteUrl(localePath(locale, `/puzzles/${encodeURIComponent(puzzle.id)}`)),
    unsubscribe: unsubscribeUrl(unsubscribeToken),
  });

  return sendTransactionalEmail({ to, subject: copy.subject, html, text });
}

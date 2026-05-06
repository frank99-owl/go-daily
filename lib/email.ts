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

const DEFAULT_FROM = "go-daily Team <hello@go-daily.app>";

const WELCOME_COPY: Record<Locale, EmailCopy> = {
  zh: {
    subject: "欢迎来到 go-daily",
    preheader: "今天的围棋题已经准备好了。",
    heading: "欢迎来到 go-daily",
    body: "你好，\n\n欢迎加入 go-daily。\n\n在这里，我们每天只做一件事：认真算一步棋。\n\n没有广告轰炸，没有功能堆砌，只有一道精选的死活题，和一个陪你思考的 AI 教练——它不会直接告诉你答案，而是在你犹豫时推你一把，引导你通过自己的计算找到那手棋。\n\n棋道漫漫，我们都是求道者。\n\n从今天的题目开始吧。",
    cta: "开始今日题目",
    footer: "你收到这封邮件，是因为你刚刚注册了 go-daily。",
  },
  en: {
    subject: "Welcome to go-daily",
    preheader: "Today's Go puzzle is ready.",
    heading: "Welcome to go-daily",
    body: "Welcome to go-daily.\n\nOne puzzle a day. That's all we ask.\n\nNo clutter, no distractions — just a carefully chosen tsumego and an AI coach that thinks alongside you. It won't hand you the answer. It will nudge you when you hesitate, ask the right questions, and let the insight be yours.\n\nThe board is 19 by 19, but the depth is infinite.\n\nStart with today's puzzle.",
    cta: "Start today's puzzle",
    footer: "You received this because you just signed up for go-daily.",
  },
  ja: {
    subject: "go-daily へようこそ",
    preheader: "今日の囲碁問題を用意しました。",
    heading: "go-daily へようこそ",
    body: "go-daily へようこそ。\n\n毎日一題。それだけ。\n\n余計な装飾も広告も取り払って、厳選された詰碁と、あなたと考えを共にする AI コーチだけを残しました。正解を教えるのではなく、迷ったときにそっと背中を押す。答えは、あなた自身の読みで見つけてほしい。\n\n十九路の盤上に、無限の深さがある。\n\n今日の一題から、はじめましょう。",
    cta: "今日の問題を解く",
    footer: "このメールは、go-daily に登録したため送信されています。",
  },
  ko: {
    subject: "go-daily에 오신 것을 환영합니다",
    preheader: "오늘의 바둑 문제가 준비되었습니다.",
    heading: "go-daily에 오신 것을 환영합니다",
    body: "go-daily에 오신 것을 환영합니다.\n\n하루 한 문제. 그게 전부입니다.\n\n불필요한 장식도, 광고도 걷어내고 엄선된 죽수와 함께 생각하는 AI 코치만 남겼습니다. 정답을 알려주는 대신, 망설일 때 곁에서 방향을 제시합니다. 답은 당신의 수읽기에서 찾으세요.\n\n열아홉 줄의 판 위에 무한한 깊이가 있습니다.\n\n오늘의 한 문제부터 시작해 보세요.",
    cta: "오늘의 문제 풀기",
    footer: "이 메일은 go-daily에 가입하여 보내졌습니다.",
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
  unsubscribe,
}: {
  to: string | null | undefined;
  subject: string;
  html: string;
  text: string;
  unsubscribe?: string;
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
        headers: unsubscribe
          ? {
              "List-Unsubscribe": `<${unsubscribe}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            }
          : undefined,
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
  const unsubscribe = unsubscribeUrl(unsubscribeToken);
  const { html, text } = renderEmail({
    copy,
    ctaUrl: absoluteUrl(localePath(locale, "/today")),
    unsubscribe,
  });

  return sendTransactionalEmail({ to, subject: copy.subject, html, text, unsubscribe });
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
  const unsubscribe = unsubscribeUrl(unsubscribeToken);
  const { html, text } = renderEmail({
    copy,
    ctaUrl: portalUrl,
    unsubscribe,
  });

  return sendTransactionalEmail({ to, subject: copy.subject, html, text, unsubscribe });
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
  const unsubscribe = unsubscribeUrl(unsubscribeToken);
  const { html, text } = renderEmail({
    copy,
    ctaUrl: absoluteUrl(localePath(locale, `/puzzles/${encodeURIComponent(puzzle.id)}`)),
    unsubscribe,
  });

  return sendTransactionalEmail({ to, subject: copy.subject, html, text, unsubscribe });
}

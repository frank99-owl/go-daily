"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect, useMemo } from "react";

import { reportError } from "@/lib/errorReporting";

const I18N = {
  en: {
    title: "Critical Error",
    description: "The entire goban has collapsed. Please try reloading the session.",
    retry: "Try Again",
  },
  zh: {
    title: "严重错误",
    description: "棋盘崩了，请尝试刷新页面。",
    retry: "再试一次",
  },
  ja: {
    title: "重大なエラー",
    description: "碁盤全体に問題が発生しました。ページを再読み込みしてください。",
    retry: "再読み込み",
  },
  ko: {
    title: "심각한 오류",
    description: "바둑판 전체에 문제가 발생했습니다. 페이지를 새로고침해 주세요.",
    retry: "다시 시도",
  },
} as const;

type UiLocale = keyof typeof I18N;

function detectLocale(): UiLocale {
  if (typeof navigator === "undefined") return "en";
  const lang = navigator.language.toLowerCase();
  if (lang.startsWith("zh")) return "zh";
  if (lang.startsWith("ja")) return "ja";
  if (lang.startsWith("ko")) return "ko";
  return "en";
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const messages = useMemo(() => I18N[detectLocale()], []);

  useEffect(() => {
    Sentry.captureException(error);
    reportError(error);
    console.error(error);
  }, [error]);

  return (
    <html>
      <body className="min-h-screen flex flex-col items-center justify-center bg-paper text-ink p-4 text-center">
        <h2 className="text-3xl font-headline mb-4 font-bold">{messages.title}</h2>
        <p className="text-lg text-ink/70 mb-8 max-w-md italic">{messages.description}</p>
        <button
          onClick={() => reset()}
          className="px-6 py-2 border border-ink/20 hover:border-ink hover:bg-ink hover:text-paper transition-colors duration-200 font-medium"
        >
          {messages.retry}
        </button>
      </body>
    </html>
  );
}

"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { LocalizedLink } from "@/components/LocalizedLink";
import { type CoachErrorCode, isCoachErrorCode } from "@/lib/coachErrorCodes";
import { useLocale } from "@/lib/i18n";
import { track } from "@/lib/posthog/events";
import type { CoachMessage, Coord, Locale } from "@/types";

type Props = {
  puzzleId: string;
  userMove: Coord;
  isCorrect: boolean;
};

type CoachError = { kind: CoachErrorCode } | { kind: "generic"; message: string };

const historyKey = (puzzleId: string, locale: Locale) => `go-daily.coach.${puzzleId}.${locale}`;

export function CoachDialogue({ puzzleId, userMove, isCorrect }: Props) {
  const { t, locale } = useLocale();
  const pathname = usePathname();
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<CoachError | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Load any saved conversation for this puzzle+locale from sessionStorage.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(historyKey(puzzleId, locale));
      if (raw) {
        const parsed = JSON.parse(raw) as CoachMessage[];
        // Hydrating from sessionStorage on mount.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (Array.isArray(parsed)) setMessages(parsed);
      } else {
        setMessages([]);
      }
    } catch {
      setMessages([]);
    }
  }, [puzzleId, locale]);

  // Persist on change.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(historyKey(puzzleId, locale), JSON.stringify(messages));
    } catch (e) {
      console.warn("[coach] failed to persist history:", e);
    }
  }, [messages, puzzleId, locale]);

  // Auto-scroll to the newest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, pending]);

  async function requestReply(historyForApi: CoachMessage[]) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          puzzleId,
          locale,
          userMove,
          isCorrect,
          history: historyForApi,
        }),
      });
      const data = (await res.json()) as { reply?: string; error?: string; code?: string };
      if (!res.ok || !data.reply) {
        if (isCoachErrorCode(data.code)) {
          track("coach_limit_hit", { code: data.code });
          setError({ kind: data.code });
        } else {
          setError({
            kind: "generic",
            message: data.error ?? `Request failed (${res.status})`,
          });
        }
        return;
      }
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply as string, ts: Date.now() },
      ]);
    } catch (e) {
      setError({
        kind: "generic",
        message: e instanceof Error ? e.message : "Network error",
      });
    } finally {
      setPending(false);
    }
  }

  const send = async () => {
    const text = input.trim();
    if (!text || pending) return;
    const next: CoachMessage[] = [...messages, { role: "user", content: text, ts: Date.now() }];
    setMessages(next);
    setInput("");
    await requestReply(next);
  };

  return (
    <section className="rounded-xl border border-[color:var(--color-line)] bg-white/5 backdrop-blur-sm overflow-hidden">
      <header className="px-4 py-3 border-b border-[color:var(--color-line)] flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-[color:var(--color-accent)]" />
        <h2 className="text-sm font-medium text-white">{t.result.coachTitle}</h2>
      </header>

      <div
        ref={scrollRef}
        className="max-h-[420px] overflow-y-auto px-4 py-4 flex flex-col gap-3"
        aria-live="polite"
        aria-atomic="false"
      >
        {messages.length === 0 && !pending && !error && (
          <p className="text-sm text-white/50">{t.result.coachEmpty}</p>
        )}
        {messages.map((m) => (
          <div
            key={m.ts}
            className={
              "text-sm leading-relaxed whitespace-pre-wrap " +
              (m.role === "assistant"
                ? "text-white/85"
                : "self-end max-w-[85%] rounded-lg bg-[color:var(--color-accent)]/15 text-white px-3 py-2 border border-[color:var(--color-accent)]/20")
            }
          >
            {m.content}
          </div>
        ))}
        {pending && <div className="text-sm text-white/50">{t.result.thinking}</div>}
        {error?.kind === "generic" && (
          <div className="text-sm text-[color:var(--color-warn)]" role="alert">
            {error.message}
          </div>
        )}
        {error && error.kind !== "generic" && (
          <CoachLimitCard kind={error.kind} pathname={pathname} />
        )}
      </div>

      <div className="border-t border-[color:var(--color-line)] p-3 flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={t.result.coachPlaceholder}
          aria-label={t.result.coachPlaceholder}
          disabled={pending}
          className="flex-1 rounded-full border border-[color:var(--color-line)] bg-white/5 text-white placeholder:text-white/35 px-4 py-2 text-sm focus:outline-none focus:border-[color:var(--color-accent)]"
        />
        <button
          type="button"
          onClick={send}
          disabled={pending || !input.trim()}
          className="px-4 py-2 rounded-full bg-white/10 text-white text-sm font-medium disabled:opacity-40 hover:bg-[color:var(--color-accent)] hover:text-black transition-colors"
        >
          {t.result.send}
        </button>
      </div>
    </section>
  );
}

function CoachLimitCard({ kind, pathname }: { kind: CoachErrorCode; pathname: string | null }) {
  const { t } = useLocale();

  const body =
    kind === "login_required"
      ? t.result.coachGuestLocked
      : kind === "device_limit"
        ? t.result.coachDeviceLimit
        : kind === "daily_limit_reached"
          ? t.result.coachDailyLimitReached
          : t.result.coachMonthlyLimitReached;

  const isLogin = kind === "login_required";
  const cta = isLogin ? t.result.coachSignInCta : t.result.coachUpgradeCta;
  const href = isLogin
    ? `/login${pathname ? `?next=${encodeURIComponent(pathname)}` : ""}`
    : "/pricing";

  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-4"
    >
      <p className="text-sm leading-relaxed text-white/80">{body}</p>
      <LocalizedLink
        href={href}
        className="self-start rounded-full bg-[#00f2ff] px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90"
      >
        {cta}
      </LocalizedLink>
    </div>
  );
}

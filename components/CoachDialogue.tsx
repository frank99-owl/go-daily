"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { CoachPersonaSelector } from "@/components/CoachPersonaSelector";
import { LocalizedLink } from "@/components/LocalizedLink";
import { useCurrentUser } from "@/lib/auth/auth";
import { getOrCreateDeviceId } from "@/lib/auth/deviceId";
import { type CoachErrorCode, isCoachErrorCode } from "@/lib/coach/coachErrorCodes";
import { DEFAULT_PERSONA, type PersonaId } from "@/lib/coach/personas";
import { useLocale } from "@/lib/i18n/i18n";
import { track } from "@/lib/posthog/events";
import type { CoachMessage, Coord, Locale } from "@/types";

type Props = {
  puzzleId: string;
  userMove: Coord;
};

type CoachError = { kind: CoachErrorCode } | { kind: "generic"; message: string };

const PERSONA_SWITCH_DELAY_MS = 300;

const historyKey = (puzzleId: string, locale: Locale, personaId: string) =>
  `go-daily.coach.${puzzleId}.${locale}.${personaId}`;

export function CoachDialogue({ puzzleId, userMove }: Props) {
  const { t, locale } = useLocale();
  const pathname = usePathname();
  const { user } = useCurrentUser();
  const [personaId, setPersonaId] = useState<PersonaId>(DEFAULT_PERSONA.id);
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [error, setError] = useState<CoachError | null>(null);
  const [switching, setSwitching] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const prevPersonaRef = useRef(personaId);

  // Load any saved conversation for this puzzle+locale from sessionStorage.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isPersonaSwitch = prevPersonaRef.current !== personaId;
    prevPersonaRef.current = personaId;
    if (isPersonaSwitch) setSwitching(true);
    try {
      const raw = window.sessionStorage.getItem(historyKey(puzzleId, locale, personaId));
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
    if (isPersonaSwitch) {
      // Brief delay so the loading skeleton is visible even when hydration is instant.
      setTimeout(() => setSwitching(false), PERSONA_SWITCH_DELAY_MS);
    }
  }, [puzzleId, locale, personaId]);

  // Persist on change.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(
        historyKey(puzzleId, locale, personaId),
        JSON.stringify(messages),
      );
    } catch (e) {
      console.warn("[coach] failed to persist history:", e);
    }
  }, [messages, puzzleId, locale, personaId]);

  // Auto-scroll to the newest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, pending, streamingContent]);

  // AbortController to cancel in-flight requests on unmount or locale change.
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  async function requestReply(historyForApi: CoachMessage[]) {
    // Cancel any previous in-flight request.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setPending(true);
    setStreamingContent("");
    setError(null);
    let fullContent = "";
    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
      };
      const deviceId = getOrCreateDeviceId();
      headers[user ? "x-go-daily-device-id" : "x-go-daily-guest-device-id"] = deviceId;
      const res = await fetch("/api/coach", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers,
        body: JSON.stringify({
          puzzleId,
          locale,
          userMove,
          personaId,
          history: historyForApi,
        }),
        signal: controller.signal,
      });

      // Non-200 means JSON error (auth/validation/quota) — not SSE
      if (!res.ok) {
        const data = (await res.json()) as { error?: string; code?: string };
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

      // Read SSE stream
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");
      const decoder = new TextDecoder();
      let buffer = "";

      const processLine = (line: string) => {
        if (!line.startsWith("data: ")) return;
        try {
          const evt = JSON.parse(line.slice(6)) as {
            delta?: string;
            done?: boolean;
            usage?: unknown;
            error?: string;
          };
          if (evt.error) {
            const errorMessages: Record<string, string> = {
              timeout: "Coach is taking too long. Please try again.",
              rate_limit: "Coach is busy. Please try again in a moment.",
              auth_error: "Coach authentication failed. Please contact support.",
            };
            throw new Error(errorMessages[evt.error] ?? "Coach is temporarily unavailable.");
          }
          if (evt.delta) {
            fullContent += evt.delta;
            setStreamingContent(fullContent);
          }
        } catch (e) {
          if (e instanceof Error && e.message !== "Ignore") throw e;
          // Ignore malformed SSE lines
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE lines
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? ""; // Keep incomplete line in buffer

          for (const line of lines) {
            processLine(line);
          }
        }

        // Process any residual content in the buffer (e.g. proxy stripped trailing newline)
        if (buffer.trim()) {
          for (const line of buffer.split("\n")) {
            processLine(line);
          }
        }
      } catch (e) {
        if (e instanceof Error) {
          setError({ kind: "generic", message: e.message });
          return;
        }
        throw e;
      }

      if (!fullContent) {
        setError({ kind: "generic", message: "Empty reply from the model." });
        return;
      }

      const reply = fullContent.trim();
      setMessages((prev) => [...prev, { role: "assistant", content: reply, ts: Date.now() }]);
      setStreamingContent("");
    } catch (e) {
      // Ignore abort errors from locale change / unmount.
      if (e instanceof DOMException && e.name === "AbortError") return;
      console.error("[coach] request failed", e);
      setError({
        kind: "generic",
        message: e instanceof Error ? e.message : "Network error",
      });
    } finally {
      setPending(false);
      // Don't clear streamingContent here — let the error handler or success
      // path manage it. Only clear if nothing was streamed (e.g. early abort).
      if (!fullContent) setStreamingContent("");
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

  const retry = async () => {
    if (pending) return;
    setError(null);
    await requestReply(messages);
  };

  return (
    <section
      data-coach-section
      className="rounded-xl border border-[color:var(--color-line)] bg-white/5 backdrop-blur-sm overflow-hidden text-left"
    >
      <header className="px-4 py-2 border-b border-[color:var(--color-line)] flex items-center justify-between min-h-[56px]">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[color:var(--color-accent)] animate-pulse" />
          <h2 className="text-sm font-medium text-white">{t.result.coachTitle}</h2>
        </div>
        <CoachPersonaSelector
          selectedId={personaId}
          onSelect={(id: PersonaId) => setPersonaId(id)}
        />
      </header>

      <div
        ref={scrollRef}
        className="max-h-[420px] overflow-y-auto px-4 py-4 flex flex-col gap-3"
        aria-live="polite"
        aria-atomic="false"
      >
        {switching && (
          <div className="flex flex-col gap-2 animate-pulse" aria-label="Switching mentor…">
            <div className="h-3 w-3/4 rounded bg-white/10" />
            <div className="h-3 w-1/2 rounded bg-white/10" />
          </div>
        )}
        {!switching && messages.length === 0 && !pending && !error && (
          <p className="text-sm text-white/50">{t.result.coachEmpty}</p>
        )}
        {!switching &&
          messages.map((m, i) => (
            <div
              key={`${m.ts}-${i}`}
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
        {!switching && pending && !streamingContent && (
          <div className="text-sm text-white/50 flex items-center gap-1.5">
            <span>{t.result.thinking}</span>
            <span className="inline-flex gap-0.5" aria-hidden="true">
              <span className="w-1 h-1 rounded-full bg-white/50 animate-[dotPulse_1.4s_ease-in-out_infinite]" />
              <span className="w-1 h-1 rounded-full bg-white/50 animate-[dotPulse_1.4s_ease-in-out_0.2s_infinite]" />
              <span className="w-1 h-1 rounded-full bg-white/50 animate-[dotPulse_1.4s_ease-in-out_0.4s_infinite]" />
            </span>
          </div>
        )}
        {!switching && pending && streamingContent && (
          <div className="text-sm leading-relaxed whitespace-pre-wrap text-white/85">
            {streamingContent}
          </div>
        )}
        {error?.kind === "generic" && (
          <div
            className="flex items-center gap-2 text-sm text-[color:var(--color-warn)]"
            role="alert"
          >
            <span>{error.message}</span>
            <button
              type="button"
              onClick={retry}
              disabled={pending}
              className="ml-auto shrink-0 rounded-full border border-white/15 px-3 py-1 text-xs text-white/60 hover:text-white hover:border-white/30 disabled:opacity-40 transition-colors"
            >
              {t.result.retry ?? "Retry"}
            </button>
          </div>
        )}
        {error && error.kind !== "generic" && (
          <CoachLimitCard kind={error.kind} pathname={pathname} isGuest={!user} />
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
          disabled={pending || switching}
          className="flex-1 rounded-full border border-[color:var(--color-line)] bg-white/5 text-white placeholder:text-white/35 px-4 py-2 text-sm focus:outline-none focus:border-[color:var(--color-accent)]"
        />
        <button
          type="button"
          onClick={send}
          disabled={pending || switching || !input.trim()}
          className="px-4 py-2 rounded-full bg-white/10 text-white text-sm font-medium disabled:opacity-40 hover:bg-[color:var(--color-accent)] hover:text-black transition-colors"
        >
          {t.result.send}
        </button>
      </div>
    </section>
  );
}

function CoachLimitCard({
  kind,
  pathname,
  isGuest,
}: {
  kind: CoachErrorCode;
  pathname: string | null;
  isGuest: boolean;
}) {
  const { t } = useLocale();

  const body =
    kind === "login_required"
      ? t.result.coachGuestLocked
      : kind === "device_limit"
        ? t.result.coachDeviceLimit
        : isGuest && kind === "daily_limit_reached"
          ? t.result.coachGuestDailyLimit
          : isGuest && kind === "monthly_limit_reached"
            ? t.result.coachGuestMonthlyLimit
            : kind === "daily_limit_reached"
              ? t.result.coachDailyLimitReached
              : t.result.coachMonthlyLimitReached;

  const showSignup = isGuest && kind !== "login_required";
  const isLogin = kind === "login_required";
  const cta = showSignup
    ? t.result.coachSignUpCta
    : isLogin
      ? t.result.coachSignInCta
      : t.result.coachUpgradeCta;
  const href =
    showSignup || isLogin
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
        className="self-start rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90"
      >
        {cta}
      </LocalizedLink>
    </div>
  );
}

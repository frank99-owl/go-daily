"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/lib/i18n";
import type { CoachMessage, Coord, Locale } from "@/types";

type Props = {
  puzzleId: string;
  userMove: Coord;
  isCorrect: boolean;
};

const historyKey = (puzzleId: string, locale: Locale) =>
  `go-daily.coach.${puzzleId}.${locale}`;

export function CoachDialogue({ puzzleId, userMove, isCorrect }: Props) {
  const { t, locale } = useLocale();
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    window.sessionStorage.setItem(
      historyKey(puzzleId, locale),
      JSON.stringify(messages),
    );
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
      const data = (await res.json()) as { reply?: string; error?: string };
      if (!res.ok || !data.reply) {
        setError(data.error ?? `Request failed (${res.status})`);
        return;
      }
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply as string, ts: Date.now() },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  const send = async () => {
    const text = input.trim();
    if (!text || pending) return;
    const next: CoachMessage[] = [
      ...messages,
      { role: "user", content: text, ts: Date.now() },
    ];
    setMessages(next);
    setInput("");
    await requestReply(next);
  };

  return (
    <section className="rounded-xl border border-[color:var(--color-line)] bg-white/70 overflow-hidden">
      <header className="px-4 py-3 border-b border-[color:var(--color-line)] flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-[color:var(--color-accent)]" />
        <h2 className="text-sm font-medium text-ink">{t.result.coachTitle}</h2>
      </header>

      <div
        ref={scrollRef}
        className="max-h-[420px] overflow-y-auto px-4 py-4 flex flex-col gap-3"
      >
        {messages.length === 0 && !pending && !error && (
          <p className="text-xs text-ink-2">{t.result.coachEmpty}</p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              "text-sm leading-relaxed whitespace-pre-wrap " +
              (m.role === "assistant"
                ? "text-ink"
                : "self-end max-w-[85%] rounded-lg bg-ink text-paper px-3 py-2")
            }
          >
            {m.content}
          </div>
        ))}
        {pending && (
          <div className="text-xs text-ink-2">{t.result.thinking}</div>
        )}
        {error && (
          <div className="text-xs text-[color:var(--color-warn)]">{error}</div>
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
          disabled={pending}
          className="flex-1 rounded-full border border-[color:var(--color-line)] bg-white px-4 py-2 text-sm focus:outline-none focus:border-[color:var(--color-accent)]"
        />
        <button
          type="button"
          onClick={send}
          disabled={pending || !input.trim()}
          className="px-4 py-2 rounded-full bg-ink text-paper text-sm font-medium disabled:opacity-40 hover:bg-[color:var(--color-accent)] transition-colors"
        >
          {t.result.send}
        </button>
      </div>
    </section>
  );
}

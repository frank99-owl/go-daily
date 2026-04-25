"use client";

import { Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { isLikelyEmail, signInWithEmail, signInWithGoogle } from "@/lib/auth";
import { useLocale } from "@/lib/i18n";

const EMAIL_LOGIN_ENABLED = process.env.NEXT_PUBLIC_ENABLE_EMAIL_LOGIN === "true";

type ViewState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; email: string }
  | { kind: "error"; message: string };

export function AuthPromptCard({
  next,
  authError,
  onGuestContinue,
  showEmailLogin = EMAIL_LOGIN_ENABLED,
}: {
  next: string;
  authError?: string | null;
  onGuestContinue?: () => void;
  showEmailLogin?: boolean;
}) {
  const router = useRouter();
  const { t, locale } = useLocale();
  const copy = t.auth.login;
  const [email, setEmail] = useState("");
  const [oauthLoading, setOauthLoading] = useState(false);
  const [view, setView] = useState<ViewState>(
    authError
      ? {
          kind: "error",
          message: t.auth.callback.authError.replace("{{message}}", authError),
        }
      : { kind: "idle" },
  );

  const handleGoogle = async () => {
    setOauthLoading(true);
    const res = await signInWithGoogle(locale, next || "/");
    if ("ok" in res && !res.ok) {
      setOauthLoading(false);
      setView({ kind: "error", message: copy.errorOAuthFailed });
    }
  };

  const handleGuestContinue = () => {
    if (onGuestContinue) {
      onGuestContinue();
      return;
    }
    router.push(next || "/");
  };

  const handleEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isLikelyEmail(email)) {
      setView({ kind: "error", message: copy.errorInvalidEmail });
      return;
    }
    setView({ kind: "sending" });
    const res = await signInWithEmail(email, locale, next || "/");
    if ("ok" in res && res.ok) {
      setView({ kind: "sent", email });
      return;
    }
    setView({
      kind: "error",
      message: res.error === "invalid_email" ? copy.errorInvalidEmail : copy.errorGeneric,
    });
  };

  if (view.kind === "sent") {
    return (
      <div className="flex flex-col gap-6 rounded-2xl border border-white/10 bg-white/[0.02] p-8 backdrop-blur">
        <div className="flex items-center justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[#00f2ff]/40 bg-[#00f2ff]/10 text-[#00f2ff]">
            <Mail className="h-5 w-5" />
          </div>
        </div>
        <div className="flex flex-col gap-2 text-center">
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-white">
            {copy.checkInbox}
          </h1>
          <p className="text-sm text-white/60">
            {copy.checkInboxDetail.replace("{{email}}", view.email)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setView({ kind: "idle" })}
          className="mt-2 text-xs uppercase tracking-[0.3em] text-white/50 transition-colors hover:text-[#00f2ff]"
        >
          {copy.resend}
        </button>
      </div>
    );
  }

  const isSending = view.kind === "sending";

  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-white/10 bg-white/[0.02] p-8 backdrop-blur">
      <div className="flex flex-col gap-2 text-center">
        <span className="text-[11px] uppercase tracking-[0.4em] text-[#00f2ff]/70">
          {copy.eyebrow}
        </span>
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-white">{copy.title}</h1>
        <p className="text-sm text-white/55">{copy.subtitle}</p>
      </div>

      {view.kind === "error" ? (
        <div
          role="alert"
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200"
        >
          {view.message}
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={handleGoogle}
          disabled={oauthLoading || isSending}
          className="group flex items-center justify-center gap-3 rounded-lg border border-white/15 bg-white/95 px-4 py-3 text-sm font-medium text-neutral-900 transition-all hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          <GoogleIcon className="h-4 w-4" />
          {oauthLoading ? copy.sending : copy.google}
        </button>

        <button
          type="button"
          onClick={handleGuestContinue}
          disabled={oauthLoading || isSending}
          className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-white/75 transition-colors hover:border-[#00f2ff]/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {copy.continueAsGuest}
        </button>
      </div>

      {!showEmailLogin ? null : (
        <>
          <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.3em] text-white/30">
            <span className="h-px flex-1 bg-white/10" />
            {copy.dividerOr}
            <span className="h-px flex-1 bg-white/10" />
          </div>

          <form onSubmit={handleEmail} className="flex flex-col gap-3">
            <label className="flex flex-col gap-2">
              <span className="text-[11px] uppercase tracking-[0.3em] text-white/50">
                {copy.emailLabel}
              </span>
              <input
                type="email"
                required
                inputMode="email"
                autoComplete="email"
                placeholder={copy.emailPlaceholder}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={isSending}
                className="rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-white/30 outline-none transition-colors focus:border-[#00f2ff]/60 disabled:opacity-60"
              />
            </label>
            <button
              type="submit"
              disabled={isSending || oauthLoading || email.length === 0}
              className="rounded-lg border border-[#00f2ff]/40 bg-[#00f2ff]/10 px-4 py-3 text-sm font-medium text-[#00f2ff] transition-colors hover:bg-[#00f2ff]/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSending ? copy.sending : copy.magicLink}
            </button>
          </form>
        </>
      )}

      <div className="flex flex-col gap-2 text-center">
        <p className="text-[11px] leading-relaxed text-white/35">{copy.guestHint}</p>
        <p className="text-[11px] leading-relaxed text-white/35">{copy.privacyHint}</p>
      </div>
    </div>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.6 15.9 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.6 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.7l6.2 5.2C41.1 35.3 44 30.1 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}

"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useCurrentUser } from "@/lib/auth/auth";
import { useLocale } from "@/lib/i18n";
import { localePath } from "@/lib/localePath";

import { AuthPromptCard } from "./AuthPromptCard";
import { ModalShell } from "./ModalShell";

const LOGIN_REMINDER_STORAGE_KEY = "go-daily.home-login-reminder.dismissed.v1";
const LOGIN_REMINDER_DELAY_MS = 3000;

function readDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(LOGIN_REMINDER_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function persistDismissed(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOGIN_REMINDER_STORAGE_KEY, "1");
  } catch {
    // Ignore storage failures; this only suppresses repeat prompts.
  }
}

export function HomeLoginReminder() {
  const { t, locale } = useLocale();
  const { user, loading } = useCurrentUser();
  const [open, setOpen] = useState(false);

  const dismiss = useCallback(() => {
    persistDismissed();
    setOpen(false);
  }, []);

  useEffect(() => {
    if (loading || user || readDismissed()) return;
    const timer = window.setTimeout(() => {
      setOpen(true);
    }, LOGIN_REMINDER_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [loading, user]);

  return (
    <ModalShell open={open} onClose={dismiss} ariaLabel={t.auth.login.title} zClassName="z-[80]">
      <button
        type="button"
        onClick={dismiss}
        className="absolute right-4 top-4 z-10 rounded-full border border-white/10 bg-black/40 p-2 text-white/60 transition-colors hover:text-white"
        aria-label={t.auth.login.closePrompt}
      >
        <X className="h-4 w-4" />
      </button>
      <AuthPromptCard next={localePath(locale, "/")} authError={null} onGuestContinue={dismiss} />
    </ModalShell>
  );
}

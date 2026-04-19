"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Locale, LocalizedText } from "@/types";
import zh from "@/content/messages/zh.json";
import en from "@/content/messages/en.json";
import ja from "@/content/messages/ja.json";
import ko from "@/content/messages/ko.json";

type Messages = typeof en;

const DICTS: Record<Locale, Messages> = { zh, en, ja, ko };
const STORAGE_KEY = "go-daily.locale";
const DEFAULT_LOCALE: Locale = "en";

type LocaleContextValue = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: Messages;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  children,
  initialLocale,
}: {
  children: React.ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(
    initialLocale && initialLocale in DICTS ? initialLocale : DEFAULT_LOCALE,
  );

  // Sync with localStorage on mount (in case cookie and localStorage diverge).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (saved && saved in DICTS) {
      setLocaleState(saved);
      document.documentElement.setAttribute("data-locale", saved);
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, l);
      document.cookie = `${STORAGE_KEY}=${l};path=/;max-age=31536000`;
      document.documentElement.setAttribute("data-locale", l);
    }
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, setLocale, t: DICTS[locale] }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used inside <LocaleProvider>");
  return ctx;
}

// Fallback order when a LocalizedText is missing the requested locale.
// English first (lingua franca of Go study on the web) then Chinese (the
// project's primary language), then the two remaining CJK locales.
const FALLBACK_ORDER: Locale[] = ["en", "zh", "ja", "ko"];

/**
 * Safe accessor for a LocalizedText bundle.
 *
 * Returns `text[locale]` if populated; otherwise walks FALLBACK_ORDER so the
 * UI never renders `undefined` or an empty string when *any* locale is filled
 * in. The build-time validator (`scripts/validatePuzzles.ts`) enforces full
 * 4-language coverage for curated puzzles, so fallback only kicks in if:
 *   - A library import (`isCurated: false`) intentionally ships with stub
 *     text in some locale, or
 *   - Someone is iterating on a draft puzzle with the validator temporarily
 *     bypassed.
 *
 * Returns "" only when every locale is empty, which is always a bug.
 */
export function localized(text: LocalizedText, locale: Locale): string {
  const v = text[locale];
  if (v) return v;
  for (const fb of FALLBACK_ORDER) {
    if (fb === locale) continue;
    const alt = text[fb];
    if (alt) return alt;
  }
  return "";
}

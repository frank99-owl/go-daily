"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { DICTS } from "@/lib/metadata";
import type { Locale } from "@/types";

type Messages = (typeof DICTS)["en"];

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

  // Keep the layout-provided locale (URL segment) in sync when the user
  // navigates between /{locale}/... subtrees on the client. The URL is the
  // authoritative source of truth; localStorage/cookie only cache the last
  // negotiated value for the root "/" redirect in middleware.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (initialLocale && initialLocale in DICTS && initialLocale !== locale) {
      setLocaleState(initialLocale);
      if (typeof document !== "undefined") {
        document.documentElement.setAttribute("data-locale", initialLocale);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLocale]);
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

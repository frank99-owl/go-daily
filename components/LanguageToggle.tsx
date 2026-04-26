"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";

import { useLocale } from "@/lib/i18n/i18n";
import { localePath } from "@/lib/i18n/localePath";
import type { Locale } from "@/types";

const LABELS: Record<Locale, string> = {
  zh: "中",
  en: "EN",
  ja: "日",
  ko: "한",
};

const ORDER: Locale[] = ["zh", "en", "ja", "ko"];

export function LanguageToggle() {
  const { locale, setLocale } = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Keyboard: Escape closes the menu.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div ref={ref} className="relative" onKeyDown={handleKeyDown}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-white/40 hover:text-white transition-colors flex items-center"
        aria-label="Language"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 top-8 z-50 rounded-lg border border-white/10 bg-[#0a0a0a]/95 backdrop-blur-xl p-1 shadow-lg min-w-[80px]"
          role="menu"
        >
          {ORDER.map((l) => (
            <button
              key={l}
              type="button"
              role="menuitem"
              aria-current={locale === l ? "true" : undefined}
              onClick={() => {
                setLocale(l);
                setOpen(false);
                // URL segment is the source of truth — also swap the locale
                // prefix so search, OG tags, and hreflang all stay consistent.
                if (pathname) {
                  router.push(localePath(l, pathname));
                }
              }}
              className={
                "block w-full text-left px-3 py-1.5 text-sm rounded-md transition-colors " +
                (locale === l
                  ? "bg-white/20 text-white"
                  : "text-white/60 hover:text-white hover:bg-white/10")
              }
            >
              {LABELS[l]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

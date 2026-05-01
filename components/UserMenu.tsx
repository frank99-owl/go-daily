"use client";

import { LogOut, User as UserIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { LocalizedLink } from "@/components/LocalizedLink";
import { nextForLocale, signOut, useCurrentUser } from "@/lib/auth/auth";
import { useLocale } from "@/lib/i18n/i18n";
import { localePath } from "@/lib/i18n/localePath";

/**
 * Nav slot that renders either a "Sign in" link (anonymous) or an avatar
 * dropdown (authed) with Account / Sign out actions.
 *
 * Kept intentionally standalone so the nav bar stays uncluttered and the
 * hook-based subscription doesn't rerender the rest of the Nav.
 */
export function UserMenu() {
  const { t, locale } = useLocale();
  const isCjk = locale === "zh" || locale === "ja" || locale === "ko";
  const { user, loading } = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  // Close on outside click / Escape so the dropdown feels native.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (!menuRef.current) return;
      const items = Array.from(menuRef.current.querySelectorAll<HTMLElement>('[role="menuitem"]'));
      if (items.length === 0) return;
      const idx = items.indexOf(document.activeElement as HTMLElement);

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          items[(idx + 1) % items.length].focus();
          break;
        case "ArrowUp":
          e.preventDefault();
          items[(idx - 1 + items.length) % items.length].focus();
          break;
        case "Home":
          e.preventDefault();
          items[0].focus();
          break;
        case "End":
          e.preventDefault();
          items[items.length - 1].focus();
          break;
      }
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Close whenever the route changes
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Focus first menu item when the menu opens.
  useEffect(() => {
    if (!open) return;
    const first = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    first?.focus();
  }, [open]);

  if (loading) {
    return <div aria-hidden className="h-9 w-9 rounded-full bg-white/5" />;
  }

  if (!user) {
    const search = searchParams?.toString();
    const next = nextForLocale(locale, (pathname ?? "/") + (search ? `?${search}` : ""));
    const href = `/login?next=${encodeURIComponent(next)}`;
    return (
      <LocalizedLink
        href={href}
        className={`whitespace-nowrap text-xs uppercase ${isCjk ? "tracking-[0.14em]" : "tracking-[0.3em]"} text-white/60 transition-colors hover:text-[var(--color-accent)]`}
      >
        {t.nav.signIn}
      </LocalizedLink>
    );
  }

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
    setOpen(false);
    router.replace(localePath(locale, "/"));
    router.refresh();
  };

  const initial = (user.email ?? "?").trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-sm font-medium text-white transition-colors hover:border-[color:var(--color-accent)]/60 hover:text-[var(--color-accent)]"
      >
        {initial}
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-12 w-56 overflow-hidden rounded-xl border border-white/10 bg-black/80 shadow-xl backdrop-blur-xl z-[100]"
        >
          <div className="border-b border-white/5 px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.3em] text-white/40">
              {t.auth.account.signedInAs}
            </p>
            <p className="mt-0.5 truncate text-sm text-white">{user.email ?? ""}</p>
          </div>
          <LocalizedLink
            href="/account"
            role="menuitem"
            className="flex items-center gap-2 px-4 py-2.5 text-sm text-white/80 transition-colors hover:bg-white/5 hover:text-white"
          >
            <UserIcon className="h-3.5 w-3.5" />
            {t.nav.account}
          </LocalizedLink>
          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            disabled={signingOut}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-white/80 transition-colors hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <LogOut className="h-3.5 w-3.5" />
            {signingOut ? t.auth.account.signingOut : t.nav.signOut}
          </button>
        </div>
      ) : null}
    </div>
  );
}

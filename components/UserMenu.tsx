"use client";

import { LogOut, User as UserIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { LocalizedLink } from "@/components/LocalizedLink";
import { nextForLocale, signOut, useCurrentUser } from "@/lib/auth";
import { useLocale } from "@/lib/i18n";
import { localePath } from "@/lib/localePath";

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
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Close whenever the route changes (Next router pushes a new pathname).
  // The setState-in-effect lint rule fires here, but the intent is genuine:
  // we're reacting to an external value (router path) flipping, not to
  // derived render state.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (loading) {
    return <div aria-hidden className="h-9 w-9 rounded-full bg-white/5" />;
  }

  if (!user) {
    // Carry the user's current page as the post-login redirect target so
    // clicking "Sign in" from /stats drops them back on /stats.
    const search = searchParams?.toString();
    const next = nextForLocale(locale, (pathname ?? "/") + (search ? `?${search}` : ""));
    const href = `/login?next=${encodeURIComponent(next)}`;
    return (
      <LocalizedLink
        href={href}
        className={`whitespace-nowrap text-xs uppercase ${isCjk ? "tracking-[0.14em]" : "tracking-[0.3em]"} text-white/60 transition-colors hover:text-[#00f2ff]`}
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
        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-sm font-medium text-white transition-colors hover:border-[#00f2ff]/60 hover:text-[#00f2ff]"
      >
        {initial}
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-12 w-56 overflow-hidden rounded-xl border border-white/10 bg-black/80 shadow-xl backdrop-blur"
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

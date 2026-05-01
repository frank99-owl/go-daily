"use client";

import { useLocale } from "@/lib/i18n/i18n";

import { LocalizedLink } from "./LocalizedLink";

export function Footer({ isAdmin = false }: { isAdmin?: boolean }) {
  const { t } = useLocale();
  const year = new Date().getFullYear();

  const linkClass = "hover:text-[var(--color-accent)] transition-colors duration-300";

  return (
    <footer className="mt-auto border-t border-white/5 bg-black/20 pb-12 pt-8 backdrop-blur-sm">
      <div className="mx-auto max-w-[1800px] px-4 sm:px-6 lg:px-8 xl:px-12">
        <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
          <div className="flex flex-col items-center gap-2 md:items-start">
            <span className="font-[family-name:var(--font-headline)] text-sm tracking-[0.2em] text-white/80">
              GO-DAILY
            </span>
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/30">
              © {year} {t.nav.footer.rights}
            </p>
          </div>

          <nav className="flex flex-wrap justify-center gap-x-8 gap-y-3 text-[10px] uppercase tracking-[0.2em] text-white/40">
            <LocalizedLink href="/legal/privacy" className={linkClass}>
              {t.nav.footer.privacy}
            </LocalizedLink>
            <LocalizedLink href="/legal/terms" className={linkClass}>
              {t.nav.footer.terms}
            </LocalizedLink>
            <LocalizedLink href="/legal/refund" className={linkClass}>
              {t.nav.footer.refund}
            </LocalizedLink>
            {isAdmin && (
              <LocalizedLink href="/admin" className={linkClass}>
                Admin
              </LocalizedLink>
            )}
          </nav>
        </div>
      </div>
    </footer>
  );
}

"use client";

import { Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";

import { useLocale } from "@/lib/i18n/i18n";
import { localePath } from "@/lib/i18n/localePath";
import { track } from "@/lib/posthog/events";

import { ModalShell } from "./ModalShell";

export type UpsellSource = "coach_daily" | "coach_monthly" | "coach_device" | "coach_anon";

export function UpsellModal({
  open,
  onClose,
  source,
}: {
  open: boolean;
  onClose: () => void;
  source: UpsellSource;
}) {
  const { t, locale } = useLocale();
  const router = useRouter();

  const dismiss = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    if (!open) return;
    track("upsell_open", { source });
  }, [open, source]);

  const goToPricing = () => {
    dismiss();
    router.push(localePath(locale, "/pricing"));
  };

  const features = [
    t.pricing.featureSync,
    t.pricing.featureCoach,
    t.pricing.featureNoAds,
    t.pricing.featurePriority,
    t.pricing.featureOffline,
  ];

  return (
    <ModalShell
      open={open}
      onClose={dismiss}
      ariaLabel={t.pricing.upsellTitle}
      zClassName="z-[90]"
      cardClassName="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#0b0f1a]/95 p-6 shadow-2xl shadow-black/40 outline-none backdrop-blur sm:p-8"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label={t.pricing.later}
        className="absolute right-4 top-4 rounded-full border border-white/10 bg-black/40 p-2 text-white/60 transition-colors hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex flex-col gap-4">
        <header className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-[0.35em] text-[color:var(--color-accent)]/70">
            go-daily Pro
          </span>
          <h2 className="font-[family-name:var(--font-display)] text-2xl text-white sm:text-3xl">
            {t.pricing.upsellTitle}
          </h2>
          <p className="text-sm leading-6 text-white/55">{t.pricing.upsellSubtitle}</p>
        </header>

        <ul className="mt-2 flex flex-col gap-2.5 rounded-xl border border-white/10 bg-white/[0.02] p-4">
          {features.map((feature) => (
            <li key={feature} className="flex items-start gap-2.5 text-sm text-white/75">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-accent)]" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>

        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:gap-3">
          <button
            type="button"
            onClick={goToPricing}
            className="flex-1 rounded-full bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90"
          >
            {t.pricing.seePlans}
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="flex-1 rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm text-white/70 transition-colors hover:bg-white/10"
          >
            {t.pricing.later}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

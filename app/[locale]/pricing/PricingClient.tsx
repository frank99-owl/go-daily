"use client";

import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";

import { LocalizedLink } from "@/components/LocalizedLink";
import type { ViewerPlan } from "@/lib/entitlements";
import { useLocale } from "@/lib/i18n/i18n";
import { localePath } from "@/lib/i18n/localePath";
import { track } from "@/lib/posthog/events";
import type { Locale } from "@/types";

type Interval = "monthly" | "yearly";

type CheckoutState =
  | { kind: "idle" }
  | { kind: "redirecting"; interval: Interval }
  | { kind: "error" };

type PortalState = { kind: "idle" } | { kind: "redirecting" } | { kind: "error" };

export function PricingClient({ viewerPlan, locale }: { viewerPlan: ViewerPlan; locale: Locale }) {
  const { t } = useLocale();
  const copy = t.pricing;

  const [interval, setInterval] = useState<Interval>("monthly");
  const [checkout, setCheckout] = useState<CheckoutState>({ kind: "idle" });
  const [portal, setPortal] = useState<PortalState>({ kind: "idle" });

  useEffect(() => {
    track("paywall_view", { viewerPlan, source: "pricing" });
  }, [viewerPlan]);

  const handleCheckout = async (nextInterval: Interval) => {
    setInterval(nextInterval);
    setCheckout({ kind: "redirecting", interval: nextInterval });
    track("checkout_click", { interval: nextInterval, source: "pricing" });
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ interval: nextInterval }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setCheckout({ kind: "error" });
        return;
      }
      window.location.href = data.url;
    } catch {
      setCheckout({ kind: "error" });
    }
  };

  const handlePortal = async () => {
    setPortal({ kind: "redirecting" });
    track("portal_click", { source: "pricing" });
    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setPortal({ kind: "error" });
        return;
      }
      window.location.href = data.url;
    } catch {
      setPortal({ kind: "error" });
    }
  };

  const redirecting = checkout.kind === "redirecting" || portal.kind === "redirecting";
  const features = [
    copy.featureSync,
    copy.featureCoach,
    copy.featureNoAds,
    copy.featurePriority,
    copy.featureOffline,
  ];

  const price = interval === "monthly" ? copy.monthlyPrice : copy.yearlyPrice;
  const planName = interval === "monthly" ? copy.monthlyName : copy.yearlyName;
  const checkoutCta = interval === "monthly" ? copy.monthlyCta : copy.yearlyCta;

  return (
    <article className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.025] p-6 shadow-2xl shadow-black/30 backdrop-blur sm:p-10">
      <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-[color:var(--color-accent)]/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 left-8 h-48 w-48 rounded-full bg-white/5 blur-3xl" />

      <header className="relative flex flex-col gap-3">
        <span className="text-[11px] uppercase tracking-[0.35em] text-[color:var(--color-accent)]/70">
          go-daily Pro
        </span>
        <h1 className="font-[family-name:var(--font-display)] text-4xl text-white sm:text-5xl">
          {copy.title}
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-white/55 sm:text-base">{copy.subtitle}</p>
      </header>

      <div className="relative mt-8 flex items-center gap-2" role="tablist" aria-label={copy.title}>
        <IntervalButton
          active={interval === "monthly"}
          onClick={() => setInterval("monthly")}
          label={copy.intervalMonthly}
        />
        <IntervalButton
          active={interval === "yearly"}
          onClick={() => setInterval("yearly")}
          label={copy.intervalYearly}
        />
      </div>

      <section className="relative mt-6 rounded-2xl border border-white/10 bg-black/30 p-6 sm:p-8">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="text-xl font-semibold text-white">{planName}</h2>
          <span className="text-2xl text-[var(--color-accent)]">{price}</span>
        </div>
        <p className="mt-1 text-xs text-white/45">{copy.trial}</p>

        <ul className="mt-5 flex flex-col gap-2.5">
          {features.map((feature) => (
            <li key={feature} className="flex items-start gap-2.5 text-sm text-white/75">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-accent)]" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex flex-col gap-3">
          {viewerPlan === "guest" ? (
            <GuestCta copy={copy} locale={locale} />
          ) : viewerPlan === "pro" ? (
            <ProBlock copy={copy} onManage={handlePortal} disabled={redirecting} state={portal} />
          ) : (
            <FreeCta
              copy={copy}
              cta={checkoutCta}
              onStart={() => handleCheckout(interval)}
              disabled={redirecting}
              state={checkout}
            />
          )}
        </div>
      </section>

      {/* Free vs Pro comparison table */}
      <section className="relative mt-8">
        <h3 className="text-sm font-semibold text-white/80 mb-4">{copy.compareTitle}</h3>
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.02]">
                <th className="px-4 py-2.5 text-left font-medium text-white/60">
                  {copy.compareFeature}
                </th>
                <th className="px-4 py-2.5 text-center font-medium text-white/60">
                  {copy.compareFree}
                </th>
                <th className="px-4 py-2.5 text-center font-medium text-[var(--color-accent)]">
                  {copy.comparePro}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-white/5">
                <td className="px-4 py-2.5 text-white/60">{copy.compareCoachDaily}</td>
                <td className="px-4 py-2.5 text-center text-white/50">10</td>
                <td className="px-4 py-2.5 text-center text-white font-medium">50+</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="px-4 py-2.5 text-white/60">{copy.compareCoachMonthly}</td>
                <td className="px-4 py-2.5 text-center text-white/50">30</td>
                <td className="px-4 py-2.5 text-center text-white font-medium">1,000+</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="px-4 py-2.5 text-white/60">{copy.compareDeviceSync}</td>
                <td className="px-4 py-2.5 text-center text-white/50">
                  <X className="inline h-4 w-4 text-white/20" />
                </td>
                <td className="px-4 py-2.5 text-center">
                  <Check className="inline h-4 w-4 text-[var(--color-accent)]" />
                </td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="px-4 py-2.5 text-white/60">{copy.compareDevices}</td>
                <td className="px-4 py-2.5 text-center text-white/50">1</td>
                <td className="px-4 py-2.5 text-center text-white font-medium">
                  <Check className="inline h-4 w-4 text-[var(--color-accent)]" />
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 text-white/60">{copy.compareAds}</td>
                <td className="px-4 py-2.5 text-center">
                  <Check className="inline h-4 w-4 text-white/30" />
                </td>
                <td className="px-4 py-2.5 text-center">
                  <X className="inline h-4 w-4 text-[var(--color-accent)]" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </article>
  );
}

function IntervalButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        "rounded-full border px-4 py-1.5 text-xs transition-colors " +
        (active
          ? "border-[color:var(--color-accent)]/50 bg-[color:var(--color-accent)]/10 text-[var(--color-accent)]"
          : "border-white/10 bg-white/5 text-white/60 hover:border-white/20 hover:text-white")
      }
    >
      {label}
    </button>
  );
}

function GuestCta({
  copy,
  locale,
}: {
  copy: ReturnType<typeof useLocale>["t"]["pricing"];
  locale: Locale;
}) {
  return (
    <>
      <p className="text-sm text-white/60">{copy.signInRequired}</p>
      <LocalizedLink
        href={`/login?next=${encodeURIComponent(localePath(locale, "/pricing"))}`}
        className="self-start rounded-full bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90"
      >
        {copy.signInCta}
      </LocalizedLink>
    </>
  );
}

function FreeCta({
  copy,
  cta,
  onStart,
  disabled,
  state,
}: {
  copy: ReturnType<typeof useLocale>["t"]["pricing"];
  cta: string;
  onStart: () => void;
  disabled: boolean;
  state: CheckoutState;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onStart}
        disabled={disabled}
        className="self-start rounded-full bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state.kind === "redirecting" ? copy.processing : cta}
      </button>
      {state.kind === "error" ? (
        <p role="alert" className="text-sm text-[color:var(--color-warn)]">
          {copy.error}
        </p>
      ) : null}
    </>
  );
}

function ProBlock({
  copy,
  onManage,
  disabled,
  state,
}: {
  copy: ReturnType<typeof useLocale>["t"]["pricing"];
  onManage: () => void;
  disabled: boolean;
  state: PortalState;
}) {
  return (
    <>
      <div className="rounded-xl border border-[color:var(--color-accent)]/20 bg-[color:var(--color-accent)]/5 p-4">
        <p className="text-sm font-semibold text-[var(--color-accent)]">{copy.alreadyPro}</p>
        <p className="mt-1 text-sm text-white/65">{copy.alreadyProBody}</p>
      </div>
      <button
        type="button"
        onClick={onManage}
        disabled={disabled}
        className="self-start rounded-full border border-white/20 bg-white/5 px-5 py-2.5 text-sm text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state.kind === "redirecting" ? copy.processing : copy.managePortal}
      </button>
      {state.kind === "error" ? (
        <p role="alert" className="text-sm text-[color:var(--color-warn)]">
          {copy.error}
        </p>
      ) : null}
    </>
  );
}

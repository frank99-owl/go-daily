"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { deleteAccount, signOut } from "@/lib/auth";
import { useLocale } from "@/lib/i18n";
import { localePath } from "@/lib/localePath";
import { track } from "@/lib/posthog/events";

type DeleteState =
  | { kind: "hidden" }
  | { kind: "confirming"; typed: string }
  | { kind: "deleting" }
  | { kind: "error"; message: string };

type PortalState = { kind: "idle" } | { kind: "redirecting" } | { kind: "error" };

export function AccountClient({
  email,
  provider,
  hasBillingPortal = false,
}: {
  email: string;
  provider: "google" | "email";
  hasBillingPortal?: boolean;
}) {
  const { t, locale } = useLocale();
  const copy = t.auth.account;
  const router = useRouter();

  const [signingOut, setSigningOut] = useState(false);
  const [deleteState, setDeleteState] = useState<DeleteState>({ kind: "hidden" });
  const [portal, setPortal] = useState<PortalState>({ kind: "idle" });

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
    router.replace(localePath(locale, "/"));
    // Force a server-component re-render so the nav picks up the new
    // anonymous state without waiting for a full reload.
    router.refresh();
  };

  const handleDeleteConfirm = async () => {
    setDeleteState({ kind: "deleting" });
    const res = await deleteAccount();
    if (!res.ok) {
      setDeleteState({ kind: "error", message: copy.deleteFailed });
      return;
    }
    router.replace(localePath(locale, "/"));
    router.refresh();
  };

  const handleManageSubscription = async () => {
    setPortal({ kind: "redirecting" });
    track("portal_click", { source: "account" });
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

  const providerLabel = provider === "google" ? copy.providerGoogle : copy.providerEmail;

  const deletingNow = deleteState.kind === "deleting";
  const typed = deleteState.kind === "confirming" ? deleteState.typed : "";
  const canDelete = typed === "DELETE";

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <span className="text-[11px] uppercase tracking-[0.4em] text-[#00f2ff]/70">
          {t.nav.account}
        </span>
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-white">{copy.title}</h1>
      </header>

      <section className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
        <ProfileRow label={copy.signedInAs} value={email || "—"} />
        <ProfileRow label={copy.provider} value={providerLabel} />
        <div className="pt-2">
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {signingOut ? copy.signingOut : copy.signOut}
          </button>
        </div>
      </section>

      {hasBillingPortal ? (
        <section className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm uppercase tracking-[0.3em] text-white/50">
              {copy.billingTitle}
            </h2>
            <p className="text-sm text-white/60">{copy.billingDescription}</p>
          </div>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={handleManageSubscription}
              disabled={portal.kind === "redirecting"}
              className="self-start rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {portal.kind === "redirecting" ? copy.openingPortal : copy.manageSubscription}
            </button>
            {portal.kind === "error" ? (
              <p role="alert" className="text-sm text-[color:var(--color-warn)]">
                {copy.billingPortalError}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-4 rounded-2xl border border-red-500/25 bg-red-500/[0.03] p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm uppercase tracking-[0.3em] text-red-200">{copy.dangerTitle}</h2>
          <p className="text-sm text-white/60">{copy.dangerDescription}</p>
        </div>

        {deleteState.kind === "hidden" || deleteState.kind === "error" ? (
          <div className="flex flex-col gap-3">
            {deleteState.kind === "error" ? (
              <p role="alert" className="text-sm text-red-200">
                {deleteState.message}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => setDeleteState({ kind: "confirming", typed: "" })}
              className="self-start rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm text-red-200 transition-colors hover:bg-red-500/20"
            >
              {copy.deleteAccount}
            </button>
          </div>
        ) : null}

        {deleteState.kind === "confirming" || deletingNow ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium text-white">{copy.deleteConfirmTitle}</p>
            <p className="text-sm text-white/60">{copy.deleteConfirmBody}</p>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-[0.3em] text-white/50">
                {copy.deleteConfirmType}
              </span>
              <input
                type="text"
                value={typed}
                disabled={deletingNow}
                onChange={(e) => setDeleteState({ kind: "confirming", typed: e.target.value })}
                placeholder={copy.deleteConfirmPlaceholder}
                autoComplete="off"
                spellCheck={false}
                className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-red-400/60 disabled:opacity-60"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={!canDelete || deletingNow}
                className="rounded-lg border border-red-500/60 bg-red-500/20 px-4 py-2 text-sm font-medium text-red-100 transition-colors hover:bg-red-500/30 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {deletingNow ? copy.deleteInProgress : copy.deleteConfirmButton}
              </button>
              <button
                type="button"
                onClick={() => setDeleteState({ kind: "hidden" })}
                disabled={deletingNow}
                className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 disabled:opacity-50"
              >
                {copy.deleteCancel}
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-white/5 pb-3 last:border-none last:pb-0">
      <span className="text-[11px] uppercase tracking-[0.3em] text-white/40">{label}</span>
      <span className="text-sm text-white">{value}</span>
    </div>
  );
}

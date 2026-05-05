"use client";

import { Crown, LogOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { LocalizedLink } from "@/components/LocalizedLink";
import { ModalShell } from "@/components/ModalShell";
import { signOut, useCurrentUser } from "@/lib/auth/auth";
import { registerDevice } from "@/lib/auth/deviceRegistry";
import { initGlobalErrorHandlers } from "@/lib/errorReporting";
import { useLocale } from "@/lib/i18n/i18n";
import { localePath } from "@/lib/i18n/localePath";
import { createSyncStorage, flushSyncQueue } from "@/lib/storage/syncStorage";

const SW_CLIENT_ONLINE_MESSAGE = "go-daily.client-online";
const SW_FLUSH_SYNC_QUEUE_MESSAGE = "go-daily.flush-sync-queue";

function getServiceWorkerContainer(): ServiceWorkerContainer | null {
  if (!("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker ?? null;
}

/**
 * Client-side initialization component.
 *
 * - Installs global error handlers + service worker on first mount.
 * - Triggers a one-shot attempt sync when an authed session is observed
 *   (cross-device: pull remote attempts, push any queued local ones).
 *   Re-runs whenever the user id flips (login / account switch).
 */
export function ClientInit() {
  const { t, locale } = useLocale();

  useEffect(() => {
    initGlobalErrorHandlers();

    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.error("[SW] Registration failed:", err);
      });
    }
  }, []);

  const { user, loading } = useCurrentUser();
  const registeredForUserRef = useRef<string | null>(null);
  const syncedForUserRef = useRef<string | null>(null);
  const [deviceBlockedUserId, setDeviceBlockedUserId] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      registeredForUserRef.current = null;
      syncedForUserRef.current = null;
      return;
    }
    if (registeredForUserRef.current === user.id) return;
    registeredForUserRef.current = user.id;

    let cancelled = false;
    const syncForUser = () => {
      if (cancelled || syncedForUserRef.current === user.id) return;
      syncedForUserRef.current = user.id;
      void createSyncStorage(user.id)
        .sync()
        .catch((err) => {
          console.error("[sync] initial sync failed", err);
        });
    };

    void registerDevice()
      .then((result) => {
        if (cancelled) return;
        if (result.access === "block-free-device-limit") {
          setDeviceBlockedUserId(user.id);
          return;
        }
        setDeviceBlockedUserId(null);
        syncForUser();
      })
      .catch((err) => {
        console.error("[device] registration failed", err);
        syncForUser();
      });

    return () => {
      cancelled = true;
    };
  }, [user, loading]);

  useEffect(() => {
    if (loading || !user) return;

    const flushQueue = () => {
      void flushSyncQueue(user.id).catch((err) => {
        console.error("[sync] online flush failed", err);
      });
    };
    const flushOnOnline = () => {
      flushQueue();
      getServiceWorkerContainer()?.controller?.postMessage({ type: SW_CLIENT_ONLINE_MESSAGE });
    };
    const flushOnServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === SW_FLUSH_SYNC_QUEUE_MESSAGE) {
        flushQueue();
      }
    };

    window.addEventListener("online", flushOnOnline);
    getServiceWorkerContainer()?.addEventListener("message", flushOnServiceWorkerMessage);
    return () => {
      window.removeEventListener("online", flushOnOnline);
      getServiceWorkerContainer()?.removeEventListener("message", flushOnServiceWorkerMessage);
    };
  }, [user, loading]);

  const handleSignOutToGuest = async () => {
    await signOut();
    setDeviceBlockedUserId(null);
    window.location.assign(localePath(locale, "/"));
  };

  return (
    <ModalShell
      open={deviceBlockedUserId === user?.id}
      onClose={() => {}}
      ariaLabel={t.auth.session.deviceLimitTitle}
      zClassName="z-[95]"
      cardClassName="relative w-full max-w-md rounded-xl border border-white/10 bg-[#0b0f1a]/95 p-6 shadow-2xl shadow-black/40 outline-none backdrop-blur sm:p-7"
    >
      <div className="flex flex-col gap-5 text-left">
        <header className="flex flex-col gap-2">
          <p className="text-[11px] uppercase tracking-[0.3em] text-[var(--color-accent)]/75">
            go-daily
          </p>
          <h2 className="font-[family-name:var(--font-display)] text-2xl text-white">
            {t.auth.session.deviceLimitTitle}
          </h2>
          <p className="text-sm leading-6 text-white/60">{t.auth.session.deviceLimitBody}</p>
        </header>

        <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
          <LocalizedLink
            href="/pricing"
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90"
          >
            <Crown className="h-4 w-4" />
            {t.auth.session.upgradeCta}
          </LocalizedLink>
          <button
            type="button"
            onClick={() => void handleSignOutToGuest()}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm text-white/75 transition-colors hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            {t.auth.session.signOutGuestCta}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

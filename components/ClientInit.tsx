"use client";

import { useEffect, useRef } from "react";

import { useCurrentUser } from "@/lib/auth/auth";
import { initGlobalErrorHandlers } from "@/lib/errorReporting";
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
  useEffect(() => {
    initGlobalErrorHandlers();

    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.error("[SW] Registration failed:", err);
      });
    }
  }, []);

  const { user, loading } = useCurrentUser();
  const syncedForUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      syncedForUserRef.current = null;
      return;
    }
    if (syncedForUserRef.current === user.id) return;
    syncedForUserRef.current = user.id;
    void createSyncStorage(user.id)
      .sync()
      .catch((err) => {
        console.error("[sync] initial sync failed", err);
      });
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

  return null;
}

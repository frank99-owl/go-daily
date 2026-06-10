"use client";

import { useEffect, useState } from "react";

import { useCurrentUser } from "./auth";

// Module-level cache so navigating between pages does not refetch admin
// status. Keyed by user id to survive account switches in the same tab.
let cachedUserId: string | null = null;
let cachedResult: Promise<boolean> | null = null;

async function fetchIsAdmin(): Promise<boolean> {
  try {
    const res = await fetch("/api/admin/verify");
    if (!res.ok) return false;
    const data = (await res.json()) as { isAdmin?: boolean };
    return data.isAdmin === true;
  } catch {
    return false;
  }
}

/**
 * Client-side admin check backed by `GET /api/admin/verify`.
 *
 * Anonymous visitors never trigger a request, so the check is free for
 * regular traffic. This replaces the old server-side `auth.getUser()` call in
 * the locale layout, which forced every page into dynamic rendering.
 */
export function useIsAdmin(): { isAdmin: boolean; loading: boolean } {
  const { user, loading: userLoading } = useCurrentUser();
  const [status, setStatus] = useState<{ userId: string; isAdmin: boolean } | null>(null);

  useEffect(() => {
    if (!user) {
      cachedUserId = null;
      cachedResult = null;
      return;
    }
    if (cachedUserId !== user.id || !cachedResult) {
      cachedUserId = user.id;
      cachedResult = fetchIsAdmin();
    }
    let active = true;
    const userId = user.id;
    void cachedResult.then((value) => {
      if (active) setStatus({ userId, isAdmin: value });
    });
    return () => {
      active = false;
    };
  }, [user]);

  const isAdmin = !!user && status?.userId === user.id && status.isAdmin;
  const loading = userLoading || (!!user && status?.userId !== user.id);
  return { isAdmin, loading };
}

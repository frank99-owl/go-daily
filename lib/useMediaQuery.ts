"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Subscribes to a CSS media query. Returns `serverDefault` during SSR and
 * the hydration render, then updates to the real match state. Pick the
 * value that keeps the server HTML identical to the majority/legacy
 * rendering so hydration does not visibly change the page.
 */
export function useMediaQuery(query: string, serverDefault = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia?.(query);
      if (!mql) return () => {};
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(
    () => window.matchMedia?.(query).matches ?? serverDefault,
    [query, serverDefault],
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => serverDefault);
}

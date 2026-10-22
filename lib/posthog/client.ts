"use client";

import posthog from "posthog-js";

let initAttempted = false;
let initReady = false;

export function initPostHog() {
  if (initAttempted) return;
  initAttempted = true;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (!key) return;

  try {
    posthog.init(key, {
      api_host: host || "https://us.i.posthog.com",
      person_profiles: "identified_only",
      capture_pageview: false, // we fire manually to include locale
      capture_pageleave: true,
      autocapture: false,
      // Session replay, surveys, web vitals and dead-click capture are switched
      // on in the PostHog project, and each lazy-loads a script from
      // us-assets.i.posthog.com — which the CSP's script-src has never allowed,
      // so none of them has ever run here. Say so explicitly instead of letting
      // every page fire requests the browser blocks. Turning any of them on is
      // a privacy change (replay records sessions), not a CSP fix.
      disable_external_dependency_loading: true,
      persistence: "localStorage+cookie",
    });
    initReady = true;
  } catch (err) {
    console.warn("[PostHog] init failed", err);
  }
}

/** True only after a successful `posthog.init` (safe to call `capture`). */
export function isPostHogReady() {
  return initReady;
}

export { posthog };

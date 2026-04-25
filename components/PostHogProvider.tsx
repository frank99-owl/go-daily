"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

import { initPostHog, isPostHogReady, posthog } from "@/lib/posthog/client";

function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    initPostHog();
  }, []);

  useEffect(() => {
    if (!pathname || !isPostHogReady()) return;
    const url = window.origin + pathname + (searchParams?.toString() ? `?${searchParams}` : "");
    try {
      posthog.capture("$pageview", { $current_url: url });
    } catch (err) {
      console.warn("[PostHog] capture failed", err);
    }
  }, [pathname, searchParams]);

  return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
      {children}
    </>
  );
}

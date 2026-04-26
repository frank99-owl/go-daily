"use client";

import { useEffect, useState } from "react";

import { AuthPromptCard } from "@/components/AuthPromptCard";
import { PIPAConsentCard } from "@/components/modals/PIPAConsentCard";
import type { Locale } from "@/types";

export function LoginClient({ next, authError, locale }: { next: string; authError: string | null; locale: Locale }) {
  const [step, setStep] = useState<"loading" | "pipa" | "auth">("loading");

  useEffect(() => {
    if (locale === "ko") {
      const hasConsented = localStorage.getItem("pipa-consented-2026");
      if (!hasConsented) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setStep("pipa");
        return;
      }
    }
    setStep("auth");
  }, [locale]);

  if (step === "loading") {
    // Prevent UI flicker during hydration
    return <div className="h-[400px] w-full animate-pulse rounded-2xl bg-white/[0.02]" />;
  }

  const handlePIPAConsent = () => {
    localStorage.setItem("pipa-consented-2026", "true");
    setStep("auth");
  };

  if (step === "pipa") {
    return (
      <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <PIPAConsentCard onAccept={handlePIPAConsent} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <AuthPromptCard next={next} authError={authError} />
    </div>
  );
}

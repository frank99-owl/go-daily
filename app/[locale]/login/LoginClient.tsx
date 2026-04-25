"use client";

import { AuthPromptCard } from "@/components/AuthPromptCard";

export function LoginClient({ next, authError }: { next: string; authError: string | null }) {
  return <AuthPromptCard next={next} authError={authError} />;
}

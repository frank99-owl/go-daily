import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AdminProvider } from "@/components/AdminProvider";
import { AuthRedirectBridge } from "@/components/AuthRedirectBridge";
import { ClientInit } from "@/components/ClientInit";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { LocaleProvider } from "@/lib/i18n/i18n";
import { isLocale, SUPPORTED_LOCALES } from "@/lib/i18n/localePath";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import type { Locale } from "@/types";

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase());
  const isAdmin = !!user?.email && adminEmails.includes(user.email.toLowerCase());

  return (
    <LocaleProvider initialLocale={locale}>
      <AdminProvider isAdmin={isAdmin}>
        <Suspense fallback={null}>
          <AuthRedirectBridge />
        </Suspense>
        <ClientInit />
        <div className="flex flex-col min-h-screen">
          <Nav />
          <main className="flex-1 w-full pb-24 sm:pb-32">{children}</main>
          <Footer isAdmin={isAdmin} />
        </div>
      </AdminProvider>
    </LocaleProvider>
  );
}

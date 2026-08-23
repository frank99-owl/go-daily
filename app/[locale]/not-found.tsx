import type { Metadata } from "next";
import { headers } from "next/headers";

import { isLocale } from "@/lib/i18n/localePath";
import { getMessages } from "@/lib/i18n/metadata";
import { DEFAULT_LOCALE } from "@/proxy";

import { NotFoundContent } from "./NotFoundContent";

// The body stays a client component so it can read the locale from context,
// but metadata has to be resolved on the server. A page that calls notFound()
// has its own metadata discarded, so this boundary is the only place a 404
// title can come from — without it the response inherits the site default and
// reads like an ordinary page in the tab and in history.
//
// proxy.ts sets x-locale on every locale-prefixed request, which is the only
// locale signal available here: not-found.tsx receives no route params.
export async function generateMetadata(): Promise<Metadata> {
  const headerLocale = (await headers()).get("x-locale");
  const locale = isLocale(headerLocale) ? headerLocale : DEFAULT_LOCALE;
  const t = getMessages(locale);
  return {
    title: t.metadata.notFound.title,
    description: t.metadata.notFound.description,
  };
}

export default function NotFound() {
  return <NotFoundContent />;
}

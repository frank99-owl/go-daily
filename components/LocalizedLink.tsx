"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

import { useLocale } from "@/lib/i18n";
import { localePath } from "@/lib/localePath";

type LinkProps = ComponentProps<typeof Link>;

/**
 * Drop-in replacement for `next/link` that prefixes string hrefs with the
 * current locale. Pass `absolute` to opt out (external URLs, anchor links).
 *
 * Non-string hrefs (url objects) and fully-qualified URLs are passed through
 * unchanged.
 */
export function LocalizedLink({
  href,
  absolute = false,
  ...rest
}: LinkProps & { absolute?: boolean }) {
  const { locale } = useLocale();

  if (absolute || typeof href !== "string") {
    return <Link href={href} {...rest} />;
  }
  if (/^(https?:)?\/\//.test(href) || href.startsWith("#") || href.startsWith("mailto:")) {
    return <Link href={href} {...rest} />;
  }
  return <Link href={localePath(locale, href)} {...rest} />;
}

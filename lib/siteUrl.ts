const DEFAULT_SITE_URL = "https://go-daily.vercel.app";

function normalizeSiteUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured) {
    return DEFAULT_SITE_URL;
  }

  return normalizeSiteUrl(configured);
}

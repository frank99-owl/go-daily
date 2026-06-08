/**
 * Extract the real client IP from an incoming request, honoring the
 * deployment trust chain.
 *
 * Priority (matches the resolution order in the body below):
 *   1. `X-Forwarded-For` — first hop set by the trusted proxy (Vercel, the
 *      primary host). Only the first entry is trusted; subsequent entries are
 *      user-supplied and must be ignored.
 *   2. `X-Real-IP` — legacy fallback from some proxies.
 *   3. `CF-Connecting-IP` — only meaningful when strictly behind Cloudflare;
 *      trivially spoofed otherwise, so it is the last resort.
 *
 * Falls back to `"unknown"` so downstream rate limiters still key on a
 * stable sentinel rather than short-circuiting.
 */
export function getClientIP(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first && isValidIP(first)) return first;
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp && isValidIP(realIp)) return realIp;

  // cf-connecting-ip can be easily spoofed if not strictly behind Cloudflare.
  // Checked last as a fallback.
  const cf = request.headers.get("cf-connecting-ip");
  if (cf && isValidIP(cf)) return cf;

  return "unknown";
}

/**
 * Resolve the client's ISO 3166-1 alpha-2 country code from edge headers,
 * independent of which CDN/proxy fronts the deployment.
 *
 * Priority:
 *   1. `x-vercel-ip-country` — set by Vercel's edge network (the primary host).
 *   2. `cf-ipcountry` — set by Cloudflare when the orange cloud is on.
 *
 * Returns an uppercase 2-letter code, or `null` when no usable geo header is
 * present. Cloudflare's `XX` (unknown) / `T1` (Tor) sentinels and any
 * malformed value resolve to `null` so callers degrade to a UTC window
 * rather than keying off a bogus country.
 */
export function getClientCountry(request: Request): string | null {
  const candidates = [
    request.headers.get("x-vercel-ip-country"),
    request.headers.get("cf-ipcountry"),
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const code = raw.trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(code) && code !== "XX") return code;
  }
  return null;
}

export function isValidIP(ip: string): boolean {
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4.test(ip)) {
    const parts = ip.split(".").map(Number);
    return parts.every((p) => p >= 0 && p <= 255);
  }
  // IPv6 / anything sane that isn't an injection attempt. Require a colon
  // (IPv6 always contains one) so non-IP garbage like "nope" doesn't become
  // a valid rate-limit key just because it's short and free of bad chars.
  if (!ip.includes(":")) return false;
  return ip.length > 0 && ip.length < 45 && !/[\s<>"']/.test(ip);
}

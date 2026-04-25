/**
 * Extract the real client IP from an incoming request, honoring the
 * deployment trust chain.
 *
 * Priority:
 *   1. `CF-Connecting-IP` — set by Cloudflare when the orange cloud is on.
 *      Without this check every request behind Cloudflare would carry the
 *      Cloudflare edge IP, collapsing rate limiting to global.
 *   2. `X-Forwarded-For` — first hop set by the trusted proxy (Vercel, etc.).
 *      Only the first entry is trusted; subsequent entries are user-supplied.
 *   3. `X-Real-IP` — legacy fallback from some proxies.
 *
 * Falls back to `"unknown"` so downstream rate limiters still key on a
 * stable sentinel rather than short-circuiting.
 */
export function getClientIP(request: Request): string {
  const cf = request.headers.get("cf-connecting-ip");
  if (cf && isValidIP(cf)) return cf;

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first && isValidIP(first)) return first;
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp && isValidIP(realIp)) return realIp;

  return "unknown";
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

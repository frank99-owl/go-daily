/**
 * Cloudflare's published edge ranges (https://www.cloudflare.com/ips/).
 *
 * Production sits behind Cloudflare, and Vercel overwrites `X-Forwarded-For`
 * with the address that connected to it — so behind the proxy that header
 * names a Cloudflare edge, not the visitor. Until 2026-11 every rate limiter
 * keyed on it: visitors sharing an edge shared one bucket, and one client's
 * requests were spread over several. The visitor's address is in
 * `CF-Connecting-IP`, which is only believable when the connection really came
 * from one of these ranges; anyone can reach Vercel directly and send the
 * header themselves.
 *
 * A range missing from this list degrades to the old behavior for requests
 * through that range, so a stale list is safe, just less precise.
 */
const CLOUDFLARE_IPV4_RANGES = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
];

const CLOUDFLARE_IPV6_RANGES = [
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
];

function parseIPv4(ip: string): bigint | null {
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) return null;
  let value = BigInt(0);
  for (const part of ip.split(".")) {
    const octet = Number(part);
    if (octet > 255) return null;
    value = (value << BigInt(8)) | BigInt(octet);
  }
  return value;
}

function parseIPv6(ip: string): bigint | null {
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;

  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  let value = BigInt(0);
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(group)) return null;
    value = (value << BigInt(16)) | BigInt(Number.parseInt(group, 16));
  }
  return value;
}

type Range = { base: bigint; prefix: number };

function parseRanges(cidrs: string[], parse: (ip: string) => bigint | null): Range[] {
  return cidrs.map((cidr) => {
    const [address, prefix] = cidr.split("/");
    const base = parse(address);
    if (base === null) throw new Error(`invalid CIDR ${cidr}`);
    return { base, prefix: Number(prefix) };
  });
}

const CLOUDFLARE_V4 = parseRanges(CLOUDFLARE_IPV4_RANGES, parseIPv4);
const CLOUDFLARE_V6 = parseRanges(CLOUDFLARE_IPV6_RANGES, parseIPv6);

function inRanges(value: bigint, bits: number, ranges: Range[]): boolean {
  return ranges.some(({ base, prefix }) => {
    const shift = BigInt(bits - prefix);
    return value >> shift === base >> shift;
  });
}

/** Whether `ip` is one of Cloudflare's edge addresses. */
export function isCloudflareIP(ip: string): boolean {
  // An IPv4 peer can arrive in IPv4-mapped IPv6 form.
  const v4 = parseIPv4(ip.replace(/^::ffff:(?=\d+\.)/i, ""));
  if (v4 !== null) return inRanges(v4, 32, CLOUDFLARE_V4);
  const v6 = parseIPv6(ip);
  return v6 !== null && inRanges(v6, 128, CLOUDFLARE_V6);
}

/**
 * The address that connected to the host. Vercel sets `X-Forwarded-For` (and
 * `X-Real-IP`, identically) itself and discards whatever the client sent, so
 * this cannot be forged — but it is the proxy's address when there is one.
 */
function connectingIP(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first && isValidIP(first)) return first;
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp && isValidIP(realIp)) return realIp;

  return null;
}

/**
 * Extract the visitor's IP from an incoming request, honoring the deployment
 * trust chain (visitor → Cloudflare → Vercel).
 *
 *   1. The connecting address is a Cloudflare edge → `CF-Connecting-IP`,
 *      which Cloudflare sets and overwrites.
 *   2. Otherwise the connecting address itself (`X-Forwarded-For`, then
 *      `X-Real-IP`): a request that reached Vercel directly, where
 *      `CF-Connecting-IP` would be whatever the client chose to send.
 *   3. Neither header present (not on Vercel) → `CF-Connecting-IP` as a last
 *      resort.
 *
 * Falls back to `"unknown"` so downstream rate limiters still key on a
 * stable sentinel rather than short-circuiting.
 */
export function getClientIP(request: Request): string {
  const peer = connectingIP(request);
  const cf = request.headers.get("cf-connecting-ip")?.trim();
  const visitor = cf && isValidIP(cf) ? cf : null;

  if (peer) return visitor && isCloudflareIP(peer) ? visitor : peer;
  return visitor ?? "unknown";
}

/**
 * Resolve the client's ISO 3166-1 alpha-2 country code from edge headers,
 * independent of which CDN/proxy fronts the deployment.
 *
 * Priority:
 *   - Through Cloudflare: `cf-ipcountry` first. Vercel locates the address
 *     that connected to it, which is then a Cloudflare edge — often in a
 *     different country from the visitor.
 *   - Otherwise: `x-vercel-ip-country`, then `cf-ipcountry`.
 *
 * Returns an uppercase 2-letter code, or `null` when no usable geo header is
 * present. Cloudflare's `XX` (unknown) / `T1` (Tor) sentinels and any
 * malformed value resolve to `null` so callers degrade to a UTC window
 * rather than keying off a bogus country.
 */
export function getClientCountry(request: Request): string | null {
  const vercel = request.headers.get("x-vercel-ip-country");
  const cloudflare = request.headers.get("cf-ipcountry");
  const peer = connectingIP(request);
  const candidates = peer && isCloudflareIP(peer) ? [cloudflare, vercel] : [vercel, cloudflare];
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

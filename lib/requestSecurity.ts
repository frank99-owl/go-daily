/**
 * Browser-facing mutation routes should reject obvious cross-site POSTs.
 *
 * Supabase auth cookies are SameSite-protected, but checking Origin and
 * Fetch Metadata gives sensitive endpoints an explicit CSRF guard too.
 */
export function isSameOriginMutationRequest(request: Request): boolean {
  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (origin) {
    if (origin === requestOrigin) return true;
    // request.url can be reconstructed from the server's bind address
    // (e.g. localhost) instead of the host the browser actually used, such
    // as a LAN IP during device testing. Fall back to the Host header —
    // the same comparison Next.js uses for Server Action CSRF checks.
    const host = request.headers.get("host");
    if (host) {
      try {
        return new URL(origin).host === host;
      } catch {
        return false;
      }
    }
    return false;
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite) {
    return fetchSite === "same-origin" || fetchSite === "same-site" || fetchSite === "none";
  }

  // Non-browser clients and some older browsers omit both headers. Auth is
  // still required, so allow the request rather than breaking legitimate use.
  return true;
}

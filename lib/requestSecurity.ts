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
    return origin === requestOrigin;
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite) {
    return fetchSite === "same-origin" || fetchSite === "same-site" || fetchSite === "none";
  }

  // Non-browser clients and some older browsers omit both headers. Auth is
  // still required, so allow the request rather than breaking legitimate use.
  return true;
}

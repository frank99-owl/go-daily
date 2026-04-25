/**
 * Standard security headers for API responses.
 */

export const API_SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

export const CACHE_HEADERS = {
  noCache: {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  },
  shortCache: {
    "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
  },
  longCache: {
    "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
  },
};

export function createApiResponse(
  body: unknown,
  options: {
    status?: number;
    cache?: "no-cache" | "short" | "long";
  } = {},
): Response {
  const { status = 200, cache = "no-cache" } = options;

  const cacheHeaders =
    CACHE_HEADERS[cache === "short" ? "shortCache" : cache === "long" ? "longCache" : "noCache"];

  return Response.json(body, {
    status,
    headers: {
      ...API_SECURITY_HEADERS,
      ...cacheHeaders,
    },
  });
}

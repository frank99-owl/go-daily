/**
 * Standard security headers for API responses.
 */

import { isSameOriginMutationRequest } from "@/lib/requestSecurity";

/** Default maximum body size for mutation endpoints (2 KB). */
const DEFAULT_MAX_BODY_BYTES = 2 * 1024;

/**
 * Parse and validate a JSON request body for mutation endpoints.
 *
 * Returns the parsed body on success, or a `Response` (4xx) on failure.
 * Callers distinguish the two with `rawBody instanceof Response`.
 *
 * Checks performed (in order):
 *   1. Same-origin mutation guard (CSRF).
 *   2. Content-Type must be `application/json`.
 *   3. Content-Length, if present, must not exceed `maxBodyBytes`.
 *   4. Body must be valid JSON.
 */
export async function parseMutationBody(
  request: Request,
  maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
): Promise<unknown | Response> {
  if (!isSameOriginMutationRequest(request)) {
    return createApiResponse({ error: "forbidden" }, { status: 403 });
  }

  const contentType = request.headers.get("content-type");
  if (!contentType?.includes("application/json")) {
    return createApiResponse({ error: "Content-Type must be application/json." }, { status: 400 });
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const len = Number(contentLength);
    if (!Number.isFinite(len) || len <= 0) {
      return createApiResponse({ error: "Invalid Content-Length." }, { status: 400 });
    }
    if (len > maxBodyBytes) {
      return createApiResponse({ error: "Request body too large." }, { status: 413 });
    }
  }

  try {
    return await request.json();
  } catch {
    return createApiResponse({ error: "Invalid JSON." }, { status: 400 });
  }
}

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

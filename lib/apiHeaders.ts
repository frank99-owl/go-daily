/**
 * Standard security headers for API responses.
 */

import { isSameOriginMutationRequest } from "@/lib/requestSecurity";

/** Default maximum body size for mutation endpoints (2 KB). */
const DEFAULT_MAX_BODY_BYTES = 2 * 1024;

function bodyTooLargeResponse(error = "Request body too large."): Response {
  return createApiResponse({ error }, { status: 413 });
}

/**
 * Read a request body with a hard byte ceiling. This protects endpoints even
 * when clients omit Content-Length or use chunked transfer encoding.
 */
export async function readRequestBodyBytes(
  request: Request,
  maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
  tooLargeError = "Request body too large.",
): Promise<Uint8Array | Response> {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const len = Number(contentLength);
    if (!Number.isFinite(len) || len <= 0) {
      return createApiResponse({ error: "Invalid Content-Length." }, { status: 400 });
    }
    if (len > maxBodyBytes) {
      return bodyTooLargeResponse(tooLargeError);
    }
  }

  if (!request.body) {
    return new Uint8Array();
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    total += value.byteLength;
    if (total > maxBodyBytes) {
      await reader.cancel().catch(() => {});
      return bodyTooLargeResponse(tooLargeError);
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/**
 * Parse and validate a JSON request body for mutation endpoints.
 *
 * Returns the parsed body on success, or a `Response` (4xx) on failure.
 * Callers distinguish the two with `rawBody instanceof Response`.
 *
 * Checks performed (in order):
 *   1. Same-origin mutation guard (CSRF).
 *   2. Content-Type must be `application/json`.
 *   3. Body must not exceed `maxBodyBytes`, with or without Content-Length.
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

  try {
    const body = await readRequestBodyBytes(request, maxBodyBytes);
    if (body instanceof Response) return body;
    return JSON.parse(new TextDecoder().decode(body));
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

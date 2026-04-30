import * as Sentry from "@sentry/nextjs";

import { createApiResponse } from "@/lib/apiHeaders";
import { getClientIP } from "@/lib/clientIp";
import { createRateLimiter } from "@/lib/rateLimit";
import { isSameOriginMutationRequest } from "@/lib/requestSecurity";
import { redactString, stripUrlQueryAndHash } from "@/lib/sentryScrubber";
import { ClientErrorReportSchema } from "@/types/schemas";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 4 * 1024;
const rateLimiter = createRateLimiter();

const BROAD_TOKEN_RE = /\b[A-Za-z0-9_-]{20,}\b/g;

type ClientErrorReport = ReturnType<typeof ClientErrorReportSchema.parse>;

function sanitizeMessage(msg: string): string {
  return redactString(msg).replace(BROAD_TOKEN_RE, "[redacted-token]");
}

function sanitizeUrl(url: string): string {
  try {
    new URL(url);
  } catch {
    return "[invalid-url]";
  }
  return stripUrlQueryAndHash(url);
}

function sanitizeStack(stack: string | undefined): string | undefined {
  if (!stack) return undefined;
  const firstLines = stack.split("\n").slice(0, 3).join("\n");
  return firstLines.length > 500 ? firstLines.slice(0, 500) : firstLines;
}

function captureClientErrorReport(report: ClientErrorReport): void {
  Sentry.withScope((scope) => {
    scope.setTag("source", "client-error-report");
    scope.setTag("client_locale", report.locale ?? "unknown");
    if (report.puzzleId) {
      scope.setTag("puzzle_id", report.puzzleId);
    }
    scope.setContext("client_error", {
      url: sanitizeUrl(report.url),
      timestamp: report.timestamp,
      locale: report.locale,
      puzzleId: report.puzzleId,
    });

    const error = new Error(sanitizeMessage(report.message));
    const sanitizedStack = sanitizeStack(report.stack);
    if (sanitizedStack) {
      error.stack = sanitizedStack;
    }
    Sentry.captureException(error);
  });
}

export async function POST(request: Request) {
  if (!isSameOriginMutationRequest(request)) {
    return createApiResponse({ error: "forbidden" }, { status: 403 });
  }

  const contentType = request.headers.get("content-type");
  if (!contentType?.includes("application/json")) {
    return createApiResponse({ error: "Content-Type must be application/json." }, { status: 400 });
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const length = Number(contentLength);
    if (!Number.isFinite(length) || length <= 0) {
      return createApiResponse({ error: "Invalid Content-Length." }, { status: 400 });
    }
    if (length > MAX_BODY_BYTES) {
      return createApiResponse({ error: "Request body too large." }, { status: 413 });
    }
  }

  const ip = getClientIP(request);
  try {
    if (await rateLimiter.isLimited(`client-error:${ip}`)) {
      return createApiResponse({ error: "Too many reports, slow down." }, { status: 429 });
    }
  } catch (error) {
    console.warn("[client-error] rate limiter failed open", error);
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return createApiResponse({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = ClientErrorReportSchema.safeParse(rawBody);
  if (!parsed.success) {
    return createApiResponse(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload." },
      { status: 400 },
    );
  }

  const report = parsed.data;

  console.error("[client-error]", {
    message: sanitizeMessage(report.message),
    url: sanitizeUrl(report.url),
    timestamp: report.timestamp,
    locale: report.locale,
    puzzleId: report.puzzleId,
  });
  captureClientErrorReport(report);

  return createApiResponse({ ok: true });
}

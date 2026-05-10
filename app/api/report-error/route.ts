import * as Sentry from "@sentry/nextjs";

import { createApiResponse, parseMutationBody } from "@/lib/apiHeaders";
import { getClientIP } from "@/lib/clientIp";
import { createRateLimiter, isRateLimiterConfigurationError } from "@/lib/rateLimit";
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
  const rawBody = await parseMutationBody(request, MAX_BODY_BYTES);
  if (rawBody instanceof Response) return rawBody;

  const ip = getClientIP(request);
  try {
    if (await rateLimiter.isLimited(`client-error:${ip}`)) {
      return createApiResponse({ error: "Too many reports, slow down." }, { status: 429 });
    }
  } catch (error) {
    if (isRateLimiterConfigurationError(error)) {
      console.error("[client-error] rate limiter unavailable", { ip, error });
      return createApiResponse({ error: "rate_limiter_unavailable" }, { status: 503 });
    }
    console.warn("[client-error] rate limiter failed open", error);
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

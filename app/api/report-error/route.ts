import { createApiResponse, parseMutationBody } from "@/lib/apiHeaders";
import { getClientIP } from "@/lib/clientIp";
import { checkRateLimit, createRateLimiter } from "@/lib/rateLimit";
import { redactString, stripUrlQueryAndHash } from "@/lib/redact";
import { ClientErrorReportSchema } from "@/types/schemas";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 4 * 1024;
const rateLimiter = createRateLimiter();

const BROAD_TOKEN_RE = /\b[A-Za-z0-9_-]{20,}\b/g;

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

export async function POST(request: Request) {
  const rawBody = await parseMutationBody(request, MAX_BODY_BYTES);
  if (rawBody instanceof Response) return rawBody;

  const ip = getClientIP(request);
  const limitRes = await checkRateLimit(rateLimiter, `client-error:${ip}`, "[client-error]");
  if (limitRes) return limitRes;

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

  return createApiResponse({ ok: true });
}

/**
 * Redaction for text that leaves the browser or lands in server logs: emails,
 * token-like strings, and query strings / fragments on URLs.
 *
 * Used by `/api/report-error` before a client error report is logged. (Until
 * 2026-10 it also scrubbed Sentry events; Sentry has since been removed.)
 */
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const TOKEN_RE = /\b(?:reveal|token|unsubscribe)[_-]?[A-Za-z0-9_-]{8,}\b/gi;
const ABSOLUTE_URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/gi;
const RELATIVE_URL_RE = /(^|[\s([{"'=])\/(?!\/)[^\s<>"'`)]*/g;
const TRAILING_URL_PUNCT = ".,;!?)]";
const CLOSING_BRACKET_PAIRS: Record<string, string> = { ")": "(", "]": "[" };

export function redactString(value: string): string {
  return redactSensitiveText(redactUrlsInString(value));
}

export function stripUrlQueryAndHash(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.origin + parsed.pathname;
  } catch {
    if (url.startsWith("/") && !url.startsWith("//")) {
      try {
        const parsed = new URL(url, "https://telemetry.local");
        return parsed.pathname;
      } catch {
        return url;
      }
    }
    return url;
  }
}

function redactSensitiveText(value: string): string {
  return value.replace(EMAIL_RE, "[redacted-email]").replace(TOKEN_RE, "[redacted-token]");
}

function countChar(value: string, char: string): number {
  return value.split(char).length - 1;
}

/**
 * Split punctuation that belongs to the surrounding text off the end of a URL
 * matched in free text, so `(see https://x/a?b=1).` keeps its `).`.
 *
 * A closing bracket counts as text only when the URL has no matching opener: a
 * query like `token=[Filtered]` ends in `]`, and treating that as text left it
 * stuck to the path (`…/path]`) once the query was stripped.
 */
function splitTrailingPunctuation(rawUrl: string): [url: string, trailing: string] {
  let end = rawUrl.length;
  while (end > 0 && TRAILING_URL_PUNCT.includes(rawUrl[end - 1])) {
    const char = rawUrl[end - 1];
    const opener = CLOSING_BRACKET_PAIRS[char];
    if (opener) {
      const body = rawUrl.slice(0, end);
      if (countChar(body, opener) >= countChar(body, char)) break;
    }
    end -= 1;
  }
  return [rawUrl.slice(0, end), rawUrl.slice(end)];
}

function stripMatchedUrl(rawUrl: string): string {
  const [url, trailing] = splitTrailingPunctuation(rawUrl);
  return stripUrlQueryAndHash(url) + trailing;
}

function redactUrlsInString(value: string): string {
  return value
    .replace(ABSOLUTE_URL_RE, (url) => stripMatchedUrl(url))
    .replace(RELATIVE_URL_RE, (match, prefix: string) => {
      const url = match.slice(prefix.length);
      if (!url.includes("?") && !url.includes("#")) return match;
      return prefix + stripMatchedUrl(url);
    });
}

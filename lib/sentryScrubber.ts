const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const TOKEN_RE = /\b(?:reveal|token|unsubscribe)[_-]?[A-Za-z0-9_-]{8,}\b/gi;

export function redactString(value: string): string {
  return value.replace(EMAIL_RE, "[redacted-email]").replace(TOKEN_RE, "[redacted-token]");
}

export function stripUrlQueryAndHash(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.origin + parsed.pathname;
  } catch {
    return url;
  }
}

// Internal aliases for backward compatibility within this module
const scrubString = redactString;
const scrubUrl = stripUrlQueryAndHash;

function scrubValue(value: unknown): unknown {
  if (typeof value === "string") {
    const scrubbed = scrubString(value);
    if (scrubbed.startsWith("http://") || scrubbed.startsWith("https://")) {
      return scrubUrl(scrubbed);
    }
    return scrubbed;
  }
  if (Array.isArray(value)) return value.map(scrubValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrubValue(v)]));
  }
  return value;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function scrubSentryEvent(event: any): any {
  if (event.message) {
    event.message = scrubString(event.message);
  }

  if (event.exception?.values) {
    for (const ex of event.exception.values) {
      if (ex.value) ex.value = scrubString(ex.value);
      if (ex.stacktrace?.frames) {
        for (const frame of ex.stacktrace.frames) {
          if (frame.vars) frame.vars = scrubValue(frame.vars) as Record<string, unknown>;
        }
      }
    }
  }

  if (event.request?.url) {
    event.request.url = scrubUrl(event.request.url);
  }

  if (event.breadcrumbs) {
    for (const bc of event.breadcrumbs) {
      if (typeof bc.message === "string") bc.message = scrubString(bc.message);
      if (bc.data) bc.data = scrubValue(bc.data) as Record<string, unknown>;
    }
  }

  if (event.contexts) {
    for (const key of Object.keys(event.contexts)) {
      if (event.contexts[key]) {
        event.contexts[key] = scrubValue(event.contexts[key]) as Record<string, unknown>;
      }
    }
  }

  if (event.user) {
    event.user = scrubValue(event.user) as Record<string, unknown>;
  }

  if (event.extra) {
    event.extra = scrubValue(event.extra) as Record<string, unknown>;
  }

  if (event.tags) {
    event.tags = scrubValue(event.tags) as Record<string, unknown>;
  }

  return event;
}

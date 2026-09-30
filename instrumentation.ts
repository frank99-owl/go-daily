import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Next.js calls this for errors thrown in route handlers, server components,
// server actions and middleware. Without it, an uncaught server error is logged
// by the function runtime and never reaches Sentry. Handled 5xx responses are
// reported separately, in `createApiResponse` (lib/apiHeaders.ts).
export const onRequestError = Sentry.captureRequestError;

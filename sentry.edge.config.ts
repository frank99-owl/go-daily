import * as Sentry from "@sentry/nextjs";

import { SHARED_SENTRY_OPTIONS } from "./lib/sentryScrubber";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    ...SHARED_SENTRY_OPTIONS,
  });
}

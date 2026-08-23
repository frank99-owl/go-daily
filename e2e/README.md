# End-to-end tests

Playwright specs that drive a real browser against a production build
(`next build` + `next start`), covering what unit tests cannot: the locale
redirect in `proxy.ts`, board interaction on a canvas, response status codes,
and the security headers from `next.config.ts`.

```bash
npm run build          # the specs run against a production build
npm run test:e2e       # headless
npm run test:e2e:ui    # Playwright's watch UI
```

The runner starts `next start` on port 3100 itself. Point the suite at an
already-running instance (a preview deployment, say) with `E2E_BASE_URL`.

## Why these specs need no credentials

`refreshSupabaseSession` short-circuits to anonymous when the Supabase
environment variables are absent, so the app boots and serves every public
page without them. Everything here is therefore the signed-out visitor's
path, and `npm run build`'s placeholder `DEEPSEEK_API_KEY` is never called.

## What is deliberately not covered here

The monetization chain — sign-up, device registration, coach quota, Stripe
checkout, the webhook, and the entitlement it unlocks — needs live test-mode
credentials, and is covered today only by unit tests against mocked clients
(`tests/api/stripeWebhook.test.ts`, `tests/api/coach.test.ts`,
`tests/api/authDevice.test.ts`).

Wiring it up needs, in the CI environment:

- a Supabase test project (`NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) that can be
  reset between runs,
- Stripe test-mode keys and price ids, plus `stripe listen` (or a forwarded
  webhook secret) so `checkout.session.completed` actually arrives,
- `PUZZLE_REVEAL_SECRET` and `DEEPSEEK_API_KEY`, or a stub upstream for the
  coach so runs cost nothing.

Until those exist, prefer adding to the mocked API suites rather than writing
specs here that would be skipped in CI and rot.

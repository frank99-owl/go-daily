# go-daily production preflight

> Run this before turning on real subscriptions or opening the site to paid users.
> The preflight script prints key names and statuses only; it does not print secret values.

## 1. Local Preflight

Use the script after `.env.local` has been filled or after pulling Vercel env locally:

```bash
vercel env pull .env.local
npm run preflight:prod
```

Modes:

```bash
# Live launch: requires sk_live_ Stripe key.
npm run preflight:prod

# Sandbox validation: requires sk_test_ Stripe key.
npm run preflight:prod -- --stripe-mode=test

# Static/env-only check, no Supabase or Stripe network calls.
npm run preflight:prod -- --skip-remote --stripe-mode=any
```

The script checks:

- Required launch env vars: DeepSeek, Supabase, PostHog, Sentry, Stripe, Resend, `CRON_SECRET`.
- Public-secret leaks: server keys accidentally placed in `NEXT_PUBLIC_*`.
- Format sanity: URL shape, Stripe key prefixes, Price ID prefixes, Resend key prefix, cron secret length.
- Supabase remote schema: expected tables and Phase 2 columns.
- Stripe remote prices: monthly/yearly prices are active, recurring, and have the expected billing interval.

Expected result before production smoke:

```text
Summary: ... pass, ... warn, 0 fail
Result: READY FOR DASHBOARD / PRODUCTION SMOKE CHECKS
```

Warnings are allowed only when they are intentional defaults, for example `COACH_MODEL` using `deepseek-chat`.

## 2. Dashboard Checklist

### Vercel

Set these in Project Settings -> Environment Variables for Production, Preview, and Development unless you intentionally split environments:

- `DEEPSEEK_API_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_POSTHOG_KEY`
- `NEXT_PUBLIC_POSTHOG_HOST`
- `NEXT_PUBLIC_SENTRY_DSN`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRO_MONTHLY_PRICE_ID`
- `STRIPE_PRO_YEARLY_PRICE_ID`
- `STRIPE_TRIAL_DAYS`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `EMAIL_REPLY_TO` if used
- `CRON_SECRET`
- `EMAIL_CRON_BATCH_SIZE` if overriding default
- `NEXT_PUBLIC_ENABLE_EMAIL_LOGIN=false` until Supabase Auth SMTP is verified

### Supabase

Run migrations in order:

```text
supabase/migrations/0001_init.sql
supabase/migrations/0002_stripe_event_processing.sql
supabase/migrations/0003_subscription_anchor_fields.sql
supabase/migrations/0004_email_delivery_fields.sql
```

Then run:

```bash
npm run preflight:prod -- --stripe-mode=test
```

The Supabase section should pass for:

- `profiles`
- `attempts`
- `coach_usage`
- `subscriptions`
- `srs_cards`
- `stripe_events`
- `user_devices`

Keep `NEXT_PUBLIC_ENABLE_EMAIL_LOGIN=false` until Resend DNS and Supabase Auth SMTP both deliver a real magic link.

### Stripe

Dashboard requirements:

- Products/prices:
  - Pro monthly recurring price -> `STRIPE_PRO_MONTHLY_PRICE_ID`
  - Pro yearly recurring price -> `STRIPE_PRO_YEARLY_PRICE_ID`
  - Trial copy matches `STRIPE_TRIAL_DAYS`
- Checkout:
  - Customer email collection is allowed
  - Customer Portal is enabled
- Webhook endpoint:
  - URL: `https://<production-domain>/api/stripe/webhook`
  - Events:
    - `checkout.session.completed`
    - `customer.subscription.created`
    - `customer.subscription.updated`
    - `customer.subscription.deleted`
    - `invoice.paid`
    - `invoice.payment_failed`
- Tax / legal:
  - Stripe Tax configured if required
  - Privacy / Terms / Refund URLs point at production pages
  - Bank and tax details complete before Live mode

### Resend

- Sending domain DNS is verified.
- `EMAIL_FROM` uses the verified domain.
- `RESEND_API_KEY` is in Vercel.
- Supabase Auth SMTP is configured separately before enabling email magic-link UI.

## 3. Sandbox Checkout Validation

Use Sandbox/Test mode first.

Terminal A:

```bash
npm run dev
```

Terminal B:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Copy the `whsec_...` value into `.env.local` as `STRIPE_WEBHOOK_SECRET`, then restart `npm run dev`.

Run:

```bash
npm run preflight:prod -- --stripe-mode=test
```

Browser flow:

1. Sign in with a test account.
2. Open `http://localhost:3000/zh/pricing`.
3. Click monthly checkout.
4. Pay with Stripe test card `4242 4242 4242 4242`, any future expiry, any CVC.
5. Return to `/zh/account`.

Supabase SQL checks:

```sql
select
  user_id,
  plan,
  status,
  stripe_customer_id,
  stripe_subscription_id,
  trial_end,
  first_paid_at,
  coach_anchor_day,
  updated_at
from public.subscriptions
order by updated_at desc
limit 5;
```

```sql
select id, event_type, processed_at, last_error, received_at
from public.stripe_events
order by received_at desc
limit 10;
```

Expected:

- A subscription row exists for the test user.
- Status is `trialing` or `active`.
- `stripe_customer_id` and `stripe_subscription_id` are set.
- Matching Stripe events have `processed_at` set and `last_error` null.

For `invoice.paid` first-paid anchor validation, either:

- set `STRIPE_TRIAL_DAYS=0` in local sandbox and run a fresh checkout, or
- use a Stripe Test Clock to advance through the trial.

Expected after paid invoice:

- `subscriptions.first_paid_at` is set.
- `subscriptions.coach_anchor_day` is 1-31.
- PostHog receives `subscription_activated`; after trial conversion, `trial_converted`.

Generic `stripe trigger ...` commands are useful for signature/handler smoke only. They do not replace the real Checkout path because the app relies on Checkout metadata and real subscription/customer IDs.

## 4. Production Smoke

Run this after deployment and before announcing paid access.

### Public Pages

- `https://<domain>/zh`
- `https://<domain>/en`
- `https://<domain>/ja`
- `https://<domain>/ko`
- `https://<domain>/zh/pricing`
- `https://<domain>/zh/review`
- `https://<domain>/zh/stats`
- `https://<domain>/opengraph-image`
- `https://<domain>/twitter-image`
- `https://<domain>/sitemap.xml`
- `https://<domain>/robots.txt`

### Payment

1. Sign in with a production test account.
2. Open `/zh/pricing`.
3. Confirm PostHog shows `paywall_view`.
4. Click Checkout and confirm PostHog shows `checkout_click`.
5. Complete payment in the intended Stripe mode.
6. Confirm `/zh/account` shows subscription management.
7. Click manage subscription and confirm Stripe Portal opens.
8. Confirm PostHog shows `portal_click`.

### Coach / Upsell

Free account:

- Hit the daily Coach limit and confirm `daily_limit_reached`.
- Hit the monthly Coach limit in seeded data or staging and confirm `monthly_limit_reached`.
- Sign in from a second device and confirm `device_limit`.
- Confirm Coach UI links to `/pricing`.
- Confirm PostHog shows `coach_limit_hit`.

Pro account:

- Confirm higher Coach quota applies.
- Confirm `/review` uses SRS due queue.

### Email

Welcome email:

- Sign in with a fresh test account.
- Confirm the welcome email arrives.
- Confirm `profiles.welcome_email_sent_at` is set.

Daily email cron:

```bash
curl -i \
  -H "Authorization: Bearer <CRON_SECRET>" \
  "https://<domain>/api/cron/daily-email?locale=en"
```

Expected JSON includes:

```json
{
  "ok": true,
  "sent": 1
}
```

`sent` can be `0` if no eligible profiles remain for the day. In that case, check `attempted`, `skipped`, and `failed`.

Payment failed email:

- Use Stripe test mode or a test clock to force `invoice.payment_failed`.
- Confirm the subscription becomes `past_due`.
- Confirm a payment update email arrives.

### Sync

1. Sign in on desktop.
2. Solve one puzzle incorrectly and one correctly.
3. Sign in with the same account on phone.
4. Confirm `/review`, `/stats`, and result history reflect the same attempts.
5. Go offline on one device, solve once, return online, and confirm sync after refresh.

### Observability

- Sentry: trigger or observe one test error and confirm it appears.
- PostHog: confirm `paywall_view`, `checkout_click`, `portal_click`, `coach_limit_hit`.
- Vercel Logs: no repeated 4xx/5xx on Stripe, Supabase, Resend, or Coach routes.

### SEO

- Run Lighthouse on each locale home page.
- Submit `https://<domain>/sitemap.xml` in Google Search Console.
- Confirm `robots.txt` points to the sitemap.

## 5. Go / No-Go

Go only when:

- `npm run preflight:prod` has 0 failures in the target mode.
- `npm run format:check && npm run lint && npm run test && npm run build` passes.
- Stripe Checkout -> Webhook -> Pro UI has been tested.
- PostHog first funnel event is visible.
- Resend sends at least one real email.
- Supabase sync works across two real devices.
- Sentry receives a test error.

No-go if:

- Any Stripe webhook event lands with `last_error`.
- Pro UI depends on manual DB edits.
- Email magic-link UI is enabled before SMTP delivery is proven.
- Production uses `sk_test_` while intended to collect real payments.

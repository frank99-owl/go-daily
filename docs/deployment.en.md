# go-daily Production Deployment Guide

> Chinese version: [deployment.md](./deployment.md)

---

## Table of Contents

1. [Scope](#1-scope)
2. [Pre-Deployment Checklist](#2-pre-deployment-checklist)
3. [Environment Variables](#3-environment-variables)
4. [Vercel Deployment Steps](#4-vercel-deployment-steps)
5. [Supabase Setup](#5-supabase-setup)
6. [Persistent Rate Limiting (Optional)](#6-persistent-rate-limiting-optional)
7. [Post-Deployment Verification](#7-post-deployment-verification)
8. [Troubleshooting](#8-troubleshooting)
9. [Rollback Plan](#9-rollback-plan)

---

## 1. Scope

This guide is for operators deploying go-daily to Vercel production. Following this document should result in a "low-traffic publicly available" site.

**Current code baseline production readiness** (as of 2026-04-24):

| Capability                              | Status   | Notes                                                            |
| --------------------------------------- | -------- | ---------------------------------------------------------------- |
| Core features (puzzles, library, stats) | ✅ Ready | Works without extra config                                       |
| AI coach                                | ✅ Ready | Requires `DEEPSEEK_API_KEY`                                      |
| Rate limiting                           | ✅ Ready | `MemoryRateLimiter` by default; persistent with Upstash          |
| Auth + cross-device sync                | ✅ Ready | Requires Supabase env vars                                       |
| Analytics                               | ✅ Wired | PostHog + Vercel Analytics + Speed Insights                      |
| Error monitoring                        | ✅ Wired | Sentry                                                           |
| Stripe subscription backend             | ✅ Wired | Checkout / Portal / Webhook and /pricing UI are fully integrated |

---

## 2. Pre-Deployment Checklist

### 2.1 Prerequisites

| Item             | Requirement                                           |
| ---------------- | ----------------------------------------------------- |
| Code repository  | Pushed to GitHub                                      |
| Vercel account   | Already registered                                    |
| DeepSeek API Key | Valid key available                                   |
| Supabase project | Created (Auth + Database)                             |
| Domain           | DNS configured to point to Vercel (e.g. go-daily.app) |

### 2.2 Local Pre-Flight (run before deploying)

```bash
npm run format:check        # Prettier format check passes
npm run lint                # ESLint clean
npm run test                # All tests pass (236/46)
npm run validate:puzzles    # Puzzle data validates
npm run build               # Production build succeeds
```

> Fix any failures locally before deploying.

---

## 3. Environment Variables

**Configure these in Vercel Project Settings → Environment Variables, enabling all three environments (Production / Preview / Development).**

### Core Variables

| Variable Name          | Required | Default                | Description                                                |
| ---------------------- | -------- | ---------------------- | ---------------------------------------------------------- |
| `DEEPSEEK_API_KEY`     | ✅       | —                      | DeepSeek API key; AI coach depends on this                 |
| `NEXT_PUBLIC_SITE_URL` | —        | `https://go-daily.app` | Production domain; used for canonical URL, robots, sitemap |

### Supabase Variables

| Variable Name                   | Required | Default | Description                                               |
| ------------------------------- | -------- | ------- | --------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | ✅       | —       | Supabase project URL                                      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅       | —       | Supabase publishable key (RLS-protected, safe in browser) |
| `SUPABASE_SERVICE_ROLE_KEY`     | ✅       | —       | Supabase secret key (server-only, bypasses RLS)           |

> Without Supabase vars, the app runs in anonymous-only mode (localStorage storage, no cross-device sync).

### AI Coach Variables

| Variable Name | Required | Default         | Description                       |
| ------------- | -------- | --------------- | --------------------------------- |
| `COACH_MODEL` | —        | `deepseek-chat` | Model identifier for the AI coach |

### Analytics & Monitoring Variables

| Variable Name              | Required | Default                    | Description                          |
| -------------------------- | -------- | -------------------------- | ------------------------------------ |
| `NEXT_PUBLIC_POSTHOG_KEY`  | —        | —                          | PostHog project API key (write-only) |
| `NEXT_PUBLIC_POSTHOG_HOST` | —        | `https://us.i.posthog.com` | PostHog ingest host                  |
| `NEXT_PUBLIC_SENTRY_DSN`   | —        | —                          | Sentry DSN (write-only)              |

### Rate Limiting Variables

| Variable Name              | Required | Default | Description                                              |
| -------------------------- | -------- | ------- | -------------------------------------------------------- |
| `RATE_LIMIT_WINDOW_MS`     | —        | `60000` | Rate-limit window in milliseconds                        |
| `RATE_LIMIT_MAX`           | —        | `10`    | Max requests per window per IP                           |
| `UPSTASH_REDIS_REST_URL`   | —        | —       | Upstash Redis REST URL; enables persistent rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | —        | —       | Upstash Redis REST Token                                 |

> When both `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set, rate limiting automatically switches to `UpstashRateLimiter` for cross-instance persistence. Otherwise, `MemoryRateLimiter` (in-process, single-instance) is used.

### Stripe Variables (Phase 2, Optional)

| Variable Name                 | Required | Default | Description                   |
| ----------------------------- | -------- | ------- | ----------------------------- |
| `STRIPE_SECRET_KEY`           | —        | —       | Stripe server-side secret key |
| `STRIPE_WEBHOOK_SECRET`       | —        | —       | Stripe webhook signing secret |
| `STRIPE_PRO_MONTHLY_PRICE_ID` | —        | —       | Pro monthly Price ID          |
| `STRIPE_PRO_YEARLY_PRICE_ID`  | —        | —       | Pro yearly Price ID           |
| `STRIPE_TRIAL_DAYS`           | —        | `7`     | Trial length in days          |

> Stripe vars are only required when Phase 2 subscriptions are enabled. Without them, the app runs in anonymous/login mode without paid features.

> **Webhook event subscriptions**: the Stripe Dashboard webhook endpoint must subscribe to `checkout.session.completed`, `customer.subscription.created/updated/deleted`, **`invoice.paid`** (writes `subscriptions.first_paid_at` + `coach_anchor_day`), and **`invoice.payment_failed`** (rolls back to `past_due` + sends a card-update email). Missing one of these breaks subscription state or Pro monthly-quota anchoring.

### Resend / Email Variables (Phase 2, Optional)

| Variable Name           | Required | Default                         | Description                                                         |
| ----------------------- | -------- | ------------------------------- | ------------------------------------------------------------------- |
| `RESEND_API_KEY`        | —        | —                               | Resend server-only API key                                          |
| `EMAIL_FROM`            | —        | `go-daily <hello@go-daily.app>` | Sender for welcome, daily puzzle, and payment-failed email          |
| `EMAIL_REPLY_TO`        | —        | —                               | Optional reply-to address                                           |
| `CRON_SECRET`           | —        | —                               | Bearer token for `/api/cron/daily-email`; recommended in production |
| `EMAIL_CRON_BATCH_SIZE` | —        | `50`                            | Max profiles handled per cron invocation                            |

> App-side Resend email is wired. Keep `NEXT_PUBLIC_ENABLE_EMAIL_LOGIN=true` off until Resend domain DNS, Supabase Auth SMTP, and real magic-link delivery have been verified.

### Auth UI Switches

| Variable Name                    | Required | Default | Description                                                                                                  |
| -------------------------------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_ENABLE_EMAIL_LOGIN` | —        | `false` | Email magic-link UI toggle. Backend is wired; flip to `true` only after Resend SMTP is live and deliverable. |

---

## 4. Vercel Deployment Steps

### Step 1: Import Project

1. Log in to Vercel Dashboard
2. Click "Add New Project"
3. Select the go-daily GitHub repository
4. Framework Preset: **Next.js**

### Step 2: Configure Environment Variables

On the "Configure Project" page:

1. Add `DEEPSEEK_API_KEY` with your DeepSeek API key
2. Add `NEXT_PUBLIC_SITE_URL` with your production domain (e.g. `https://go-daily.app`)
3. Add Supabase vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`)
4. Optional: add `COACH_MODEL` (default `deepseek-chat`)
5. Optional: add PostHog and Sentry vars (`NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_SENTRY_DSN`)
6. Optional: add `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX`
7. Optional: add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (for persistent rate limiting)
8. Phase 2 optional: add Stripe vars (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_*_PRICE_ID`, `STRIPE_TRIAL_DAYS`); the Stripe Dashboard webhook endpoint must include `invoice.paid` and `invoice.payment_failed`
9. Phase 2 optional: add Resend / cron vars (`RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `CRON_SECRET`, `EMAIL_CRON_BATCH_SIZE`) and verify the sending-domain DNS in Resend Dashboard
10. Optional: set `NEXT_PUBLIC_ENABLE_EMAIL_LOGIN=true` (only after Resend/Supabase SMTP is live and email magic links actually deliver)
11. Ensure all three environments (Production / Preview / Development) are checked

### Step 3: Deploy

Click "Deploy". Vercel will automatically run `npm run build` (which includes the `prebuild` hook running `validate:puzzles`).

On success, you get a Production URL (e.g. `https://go-daily.app`).

### Step 4: Configure Custom Domain

Production domain: **go-daily.app**

1. Vercel Dashboard → Project → Settings → Domains
2. Add `go-daily.app`
3. In Cloudflare DNS, configure:
   - Type: CNAME
   - Name: `@`
   - Target: `cname.vercel-dns.com`
4. Wait for SSL certificate auto-provisioning (usually 1-2 minutes)

---

## 5. Supabase Setup

### 5.1 Create Project

1. Sign up / log in at [Supabase](https://supabase.com/)
2. Create a new project
3. Note the Project URL and API Keys (Settings → API)

### 5.2 Run Database Migrations

In Supabase Dashboard → SQL Editor, execute `supabase/migrations/*.sql` in filename order:

```bash
# Or use Supabase CLI
supabase db push
```

This migration creates the following tables:

- `profiles` — user profiles (locale, timezone, kyu_rank, etc.)
- `attempts` — attempt records (append-only, with RLS)
- `coach_usage` — daily coach usage counter
- `subscriptions` — Stripe subscription status (webhook-written)
- `srs_cards` — SRS review scheduling (Phase 2)
- `stripe_events` — Webhook idempotency ledger
- `user_devices` — device registration (free-tier single-device limit)

And enables RLS policies + `handle_new_user` trigger.

### 5.3 Configure OAuth Providers

Supabase Dashboard → Authentication → Providers:

- Enable Google OAuth
- Configure Client ID and Client Secret
- Ensure redirect URL includes `https://go-daily.app/auth/callback`

---

## 6. Persistent Rate Limiting (Optional)

**Default behavior**: without Upstash config, the app uses `MemoryRateLimiter`, storing rate-limit state in process memory. This is sufficient for single-instance or low-traffic scenarios.

**When to use Upstash**: in a Vercel Serverless multi-instance deployment, each instance has its own counter. If you need strict cross-instance rate limiting, configure Upstash Redis.

### 6.1 Provision a Redis Instance

1. Sign up at [Upstash](https://upstash.com/)
2. Create a Redis database
3. Note `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`

### 6.2 Configure Environment Variables

Add to Vercel:

```
UPSTASH_REDIS_REST_URL=https://...upstash.io
UPSTASH_REDIS_REST_TOKEN=...
```

No code changes needed — the `createRateLimiter()` factory in `lib/rateLimit.ts` automatically detects these env vars and switches implementations.

> **Graceful degradation**: if the Redis connection fails (network timeout, instance unavailable), `app/api/coach/route.ts` catches the rate-limit error, logs `[RateLimitError]`, and continues processing the request (fail-open). This means the AI coach remains available during a Redis outage, but rate limiting is temporarily bypassed.

### 6.3 Verify

Send 11 rapid `/api/coach` requests and confirm the 11th returns 429 (regardless of which instance handles it).

---

## 7. Post-Deployment Verification

### 7.1 Basic Functionality Checklist

| Check           | Action                                 | Expected Result                                         |
| --------------- | -------------------------------------- | ------------------------------------------------------- |
| Root redirect   | Open `/`                               | 308 redirect to `/{locale}/`                            |
| Home page       | Open `/en/`                            | Page renders, no 500/404                                |
| Daily puzzle    | Open `/en/today`                       | Board renders, clickable                                |
| Judgment        | Play correct/wrong move on `/en/today` | Redirects to `/en/result` with correct/incorrect banner |
| Library         | Open `/en/puzzles`                     | Library list loads, filter/search works                 |
| Stats           | Open `/en/stats`                       | Streak / accuracy / heatmap display                     |
| AI coach        | Click coach button on `/en/result`     | Chat works, replies are puzzle-relevant                 |
| Language switch | Switch language                        | URL changes to corresponding locale, content refreshes  |
| OAuth login     | Click login button                     | Redirects to Google OAuth, callback succeeds            |

### 7.2 Phase 2 Stripe Verification (Sandbox / before launch)

The code includes full-stack Stripe subscriptions (API routes, the webhook backend, and the `/pricing` subscription entry point). The `/account` page still does not expose a Portal entry in this pass. Run these checks in Stripe Sandbox before launch:

| Check           | Action                                                                  | Expected Result                                                                      |
| --------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Stripe Checkout | Click the Pro subscribe CTA from `/pricing` while logged in             | Redirects to Stripe Checkout, then returns to the in-app success page                |
| Stripe Webhook  | Complete payment with a Stripe test card                                | `subscriptions` has an `active` row and `stripe_events` is processed                 |
| Payment Failed  | Trigger `invoice.payment_failed` with a failing test card or Stripe CLI | `subscriptions.status` becomes `past_due`, and the user receives a card-update email |
| Stripe Portal   | Open `/pricing` as a Pro user and click manage subscription             | Redirects to Stripe Customer Portal                                                  |

### 7.3 API Verification

```bash
# Health check (home page)
curl -s -o /dev/null -w "%{http_code}" https://go-daily.app/
# Expected: 308 → 200

# Coach API (valid request)
curl -X POST https://go-daily.app/api/coach \
  -H "Content-Type: application/json" \
  -d '{
    "puzzleId": "cld-001",
    "locale": "zh",
    "userMove": {"x": 18, "y": 0},
    "isCorrect": true,
    "history": [{"role": "user", "content": "Why is this correct?", "ts": 0}]
  }'
# Expected: 200 with {"reply": "..."}

# Rate limit test (send 11 rapid requests)
for i in {1..11}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST https://go-daily.app/api/coach \
    -H "Content-Type: application/json" \
    -d '{"puzzleId":"test","locale":"zh","userMove":{"x":0,"y":0},"isCorrect":true,"history":[{"role":"user","content":"test","ts":0}]}'
done
# Expected: first 10 return 200 or 404, 11th returns 429
```

### 7.4 Environment Variable Verification

```bash
# Check NEXT_PUBLIC_SITE_URL is effective
curl -s https://go-daily.app/ | grep -i "og:url\|canonical"
# Should show your production domain, not the default

# Check CSP headers
curl -sI https://go-daily.app/ | grep -i "content-security-policy"
# Should show full CSP directives
```

---

## 8. Troubleshooting

### Q1: Build fails

**Symptom**: Vercel build log shows `validate:puzzles` errors.

**Reproduce locally**:

```bash
npm run validate:puzzles
```

Common causes:

- Corrupted `content/data/classicalPuzzles.json`
- Format error after manual `curatedPuzzles.ts` edit
- Missing locale fields

### Q2: AI coach returns 500

**Symptom**: Coach panel on `/result` shows "service unavailable".

**Check**:

1. Vercel Dashboard → Project → Settings → Environment Variables
2. Confirm `DEEPSEEK_API_KEY` is set and all three environments are checked
3. Check Vercel Runtime Logs (Functions tab) for error details

### Q3: Supabase login fails

**Symptom**: OAuth login errors or infinite redirects.

**Check**:

1. Confirm Supabase environment variables are correctly configured
2. In Supabase Dashboard → Authentication → URL Configuration, check Site URL and Redirect URLs
3. Confirm OAuth provider (Google) Client ID/Secret are correct
4. Check `/auth/callback` route logs

### Q4: Rate limiting inconsistent

**Symptom**: Rapid requests sometimes 429, sometimes pass.

**Cause**: without Upstash, `MemoryRateLimiter` is not shared across instances. Vercel Serverless load balancing distributes requests across instances, each with independent counters.

**Fix**: For strict rate limiting, follow Section 6 to configure Upstash Redis.

### Q5: Pages return 404

**Symptom**: All pages except home return 404.

**Cause**: Vercel Framework Preset may be wrong, or `next.config.ts` misconfigured.

**Fix**:

1. Confirm Framework Preset is Next.js
2. Check Build Command is `npm run build`
3. Output Directory should be `.next`

### Q6: Custom domain HTTPS not working

**Symptom**: Domain bound but browser shows insecure.

**Fix**:

1. Confirm DNS points to Vercel (CNAME or A record)
2. Check Vercel Dashboard → Domains for status
3. SSL certificates auto-provision, usually within 1-2 minutes

---

## 9. Rollback Plan

### 9.1 Code Rollback (bad deployment)

**Option 1: Vercel Dashboard**

1. Vercel Dashboard → Project → Deployments
2. Find the last good deployment
3. Click "..." → "Promote to Production"

**Option 2: Git rollback + redeploy**

```bash
git revert HEAD  # or git reset --hard <last-good-commit>
git push origin main
# Vercel auto-redeploys
```

### 9.2 Environment Variable Rollback

If the issue is caused by an env var change:

1. Vercel Dashboard → Settings → Environment Variables
2. Revert the problematic change
3. Trigger redeploy (push an empty commit)

```bash
git commit --allow-empty -m "trigger: redeploy"
git push origin main
```

### 9.3 Emergency Takedown

To immediately stop serving traffic:

1. Vercel Dashboard → Project → Settings → General
2. Click "Pause" to pause the project
3. Or remove custom domain DNS records

---

_Related docs: [README.md](../README.md) · [architecture.en.md](./architecture.en.md) · [ai-coach.en.md](./ai-coach.en.md)_

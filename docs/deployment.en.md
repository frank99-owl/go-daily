# go-daily Production Deployment Guide

> Chinese version: [deployment.md](./deployment.md)

---

## Table of Contents

1. [Scope](#1-scope)
2. [Pre-Deployment Checklist](#2-pre-deployment-checklist)
3. [Environment Variables](#3-environment-variables)
4. [Vercel Deployment Steps](#4-vercel-deployment-steps)
5. [Persistent Rate Limiting (Optional)](#5-persistent-rate-limiting-optional)
6. [Post-Deployment Verification](#6-post-deployment-verification)
7. [Troubleshooting](#7-troubleshooting)
8. [Rollback Plan](#8-rollback-plan)

---

## 1. Scope

This guide is for operators deploying go-daily to Vercel production. Following this document should result in a "low-traffic publicly available" site.

**Current code baseline production readiness** (as of 2026-04-21):

| Capability                              | Status       | Notes                                                   |
| --------------------------------------- | ------------ | ------------------------------------------------------- |
| Core features (puzzles, library, stats) | ✅ Ready     | Works without extra config                              |
| AI coach                                | ✅ Ready     | Requires `DEEPSEEK_API_KEY`                             |
| Rate limiting                           | ✅ Ready     | `MemoryRateLimiter` by default; persistent with Upstash |
| Observability                           | ✅ Wired     | `Vercel Analytics` + `Speed Insights`                   |
| Sentry                                  | ❌ Not wired | Explicitly out of scope for this sprint                 |

---

## 2. Pre-Deployment Checklist

### 2.1 Prerequisites

| Item             | Requirement         |
| ---------------- | ------------------- |
| Code repository  | Pushed to GitHub    |
| Vercel account   | Already registered  |
| DeepSeek API Key | Valid key available |

### 2.2 Local Pre-Flight (run before deploying)

```bash
npm run format:check   # Prettier format check passes
npm run lint           # ESLint clean
npm run test           # All tests pass (49/49)
npm run validate:puzzles  # Puzzle data validates
npm run build          # Production build succeeds
```

> Fix any failures locally before deploying.

---

## 3. Environment Variables

**Configure these in Vercel Project Settings → Environment Variables, enabling all three environments (Production / Preview / Development).**

### Core Variables

| Variable Name          | Required | Default                       | Description                                                |
| ---------------------- | -------- | ----------------------------- | ---------------------------------------------------------- |
| `DEEPSEEK_API_KEY`     | ✅       | —                             | DeepSeek API key; AI coach depends on this                 |
| `NEXT_PUBLIC_SITE_URL` | —        | `https://go-daily.vercel.app` | Production domain; used for canonical URL, robots, sitemap |

### AI Coach Variables

| Variable Name | Required | Default         | Description                       |
| ------------- | -------- | --------------- | --------------------------------- |
| `COACH_MODEL` | —        | `deepseek-chat` | Model identifier for the AI coach |

### Rate Limiting Variables

| Variable Name              | Required | Default | Description                                              |
| -------------------------- | -------- | ------- | -------------------------------------------------------- |
| `RATE_LIMIT_WINDOW_MS`     | —        | `60000` | Rate-limit window in milliseconds                        |
| `RATE_LIMIT_MAX`           | —        | `10`    | Max requests per window per IP                           |
| `UPSTASH_REDIS_REST_URL`   | —        | —       | Upstash Redis REST URL; enables persistent rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | —        | —       | Upstash Redis REST Token                                 |

> When both `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set, rate limiting automatically switches to `UpstashRateLimiter` for cross-instance persistence. Otherwise, `MemoryRateLimiter` (in-process, single-instance) is used.

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
2. Add `NEXT_PUBLIC_SITE_URL` with your production domain (e.g. `https://go-daily.vercel.app`)
3. Optional: add `COACH_MODEL` (default `deepseek-chat`)
4. Optional: add `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX`
5. Optional: add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (for persistent rate limiting)
6. Ensure all three environments (Production / Preview / Development) are checked

### Step 3: Deploy

Click "Deploy". Vercel will automatically run `npm run build` (which includes the `prebuild` hook running `validate:puzzles`).

On success, you get a Production URL (e.g. `https://go-daily.vercel.app`).

### Step 4: Custom Domain (if applicable)

To bind a custom domain:

1. Vercel Dashboard → Project → Settings → Domains
2. Add domain and follow DNS instructions
3. Wait for SSL certificate auto-provisioning (usually 1-2 minutes)

---

## 5. Persistent Rate Limiting (Optional)

**Default behavior**: without Upstash config, the app uses `MemoryRateLimiter`, storing rate-limit state in process memory. This is sufficient for single-instance or low-traffic scenarios.

**When to use Upstash**: in a Vercel Serverless multi-instance deployment, each instance has its own counter. If you need strict cross-instance rate limiting, configure Upstash Redis.

### 5.1 Provision a Redis Instance

1. Sign up at [Upstash](https://upstash.com/)
2. Create a Redis database
3. Note `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`

### 5.2 Configure Environment Variables

Add to Vercel:

```
UPSTASH_REDIS_REST_URL=https://...upstash.io
UPSTASH_REDIS_REST_TOKEN=...
```

No code changes needed — the `createRateLimiter()` factory in `lib/rateLimit.ts` automatically detects these env vars and switches implementations.

> **Graceful degradation**: if the Redis connection fails (network timeout, instance unavailable), `app/api/coach/route.ts` catches the rate-limit error, logs `[RateLimitError]`, and continues processing the request (fail-open). This means the AI coach remains available during a Redis outage, but rate limiting is temporarily bypassed.

### 5.3 Verify

Send 11 rapid `/api/coach` requests and confirm the 11th returns 429 (regardless of which instance handles it).

---

## 6. Post-Deployment Verification

### 6.1 Basic Functionality Checklist

| Check        | Action                              | Expected Result                                      |
| ------------ | ----------------------------------- | ---------------------------------------------------- |
| Home page    | Open `/`                            | Page renders, no 500/404                             |
| Daily puzzle | Open `/today`                       | Board renders, clickable                             |
| Judgment     | Play correct/wrong move on `/today` | Redirects to `/result` with correct/incorrect banner |
| Library      | Open `/puzzles`                     | Library list loads, filter/search works              |
| Stats        | Open `/stats`                       | Streak / accuracy / heatmap display                  |
| AI coach     | Click coach button on `/result`     | Chat works, replies are puzzle-relevant              |

### 6.2 API Verification

```bash
# Health check (home page)
curl -s -o /dev/null -w "%{http_code}" https://your-domain.com/
# Expected: 200

# Coach API (valid request)
curl -X POST https://your-domain.com/api/coach \
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
    -X POST https://your-domain.com/api/coach \
    -H "Content-Type: application/json" \
    -d '{"puzzleId":"test","locale":"zh","userMove":{"x":0,"y":0},"isCorrect":true,"history":[{"role":"user","content":"test","ts":0}]}'
done
# Expected: first 10 return 200 or 404, 11th returns 429
```

### 6.3 Environment Variable Verification

```bash
# Check NEXT_PUBLIC_SITE_URL is effective
curl -s https://your-domain.com/ | grep -i "og:url\|canonical"
# Should show your production domain, not the default
```

---

## 7. Troubleshooting

### Q1: Build fails

**Symptom**: Vercel build log shows `validate:puzzles` errors.

**Reproduce locally**:

```bash
npm run validate:puzzles
```

Common causes:

- Corrupted `content/data/importedPuzzles.json`
- Format error after manual `curatedPuzzles.ts` edit
- Missing locale fields

### Q2: AI coach returns 500

**Symptom**: Coach panel on `/result` shows "service unavailable".

**Check**:

1. Vercel Dashboard → Project → Settings → Environment Variables
2. Confirm `DEEPSEEK_API_KEY` is set and all three environments are checked
3. Check Vercel Runtime Logs (Functions tab) for error details

### Q3: Rate limiting inconsistent

**Symptom**: Rapid requests sometimes 429, sometimes pass.

**Cause**: without Upstash, `MemoryRateLimiter` is not shared across instances. Vercel Serverless load balancing distributes requests across instances, each with independent counters.

**Fix**: For strict rate limiting, follow Section 5 to configure Upstash Redis.

### Q4: Pages return 404

**Symptom**: All pages except home return 404.

**Cause**: Vercel Framework Preset may be wrong, or `next.config.js` misconfigured.

**Fix**:

1. Confirm Framework Preset is Next.js
2. Check Build Command is `npm run build`
3. Output Directory should be `.next`

### Q5: Custom domain HTTPS not working

**Symptom**: Domain bound but browser shows insecure.

**Fix**:

1. Confirm DNS points to Vercel (CNAME or A record)
2. Check Vercel Dashboard → Domains for status
3. SSL certificates auto-provision, usually within 1-2 minutes

---

## 8. Rollback Plan

### 8.1 Code Rollback (bad deployment)

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

### 8.2 Environment Variable Rollback

If the issue is caused by an env var change:

1. Vercel Dashboard → Settings → Environment Variables
2. Revert the problematic change
3. Trigger redeploy (push an empty commit)

```bash
git commit --allow-empty -m "trigger: redeploy"
git push origin main
```

### 8.3 Emergency Takedown

To immediately stop serving traffic:

1. Vercel Dashboard → Project → Settings → General
2. Click "Pause" to pause the project
3. Or remove custom domain DNS records

---

_Related docs: [README.md](../README.md) · [architecture.en.md](./architecture.en.md) · [ai-coach.en.md](./ai-coach.en.md)_

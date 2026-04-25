# go-daily v1.1 Closure Summary

This document reflects the **actual shipped scope** of the v1.1 closure work on top of the content-engine branch. It intentionally avoids future-tense or inflated claims.

## What is now actually live

### 1. Coach API hardening

- `app/api/coach/route.ts`
- Requires `application/json`
- Rejects oversized requests early
- Applies prompt-injection screening to user messages
- Sanitizes message content before sending it upstream
- Fails open if the local rate limiter itself breaks
- Maps upstream timeout / rate-limit / auth / generic failures to stable user-facing responses
- Uses standardized API response headers through `lib/apiHeaders.ts`

### 2. Client error reporting with a real server-side endpoint

- `lib/errorReporting.ts`
- `app/api/report-error/route.ts`
- Browser errors and unhandled promise rejections are buffered locally and retried
- Error boundaries (`app/error.tsx`, `app/global-error.tsx`) also report through the same path
- Reports are sent to the internal `/api/report-error` endpoint
- The server validates payload shape, rate-limits noisy clients, and writes the report to server logs
- This is **log-based observability**, not Sentry or a hosted dashboard

### 3. Attempt storage integrity and recovery

- `lib/storageIntegrity.ts`
- `lib/storage.ts`
- Attempt history is stored in an integrity-wrapped payload
- Legacy plain-array data is migrated automatically
- Corrupt or mismatched payloads are quarantined into a recovery key and removed from the main read path
- This is **corruption detection and recovery**, not cryptographic anti-tampering

### 4. Backup and restore from the Stats page

- `app/stats/StatsClient.tsx`
- `lib/exportData.ts`
- Users can export attempt history as JSON
- Users can import a JSON backup from the Stats page
- Imports validate shape, merge with existing records, and deduplicate by `puzzleId + solvedAtMs`
- Imported data is written through the same integrity-wrapped storage path as normal gameplay

### 5. Real keyboard support on puzzle surfaces

- `components/GoBoard.tsx`
- `app/TodayClient.tsx`
- `app/result/ResultClient.tsx`
- The board is now focusable for keyboard play on `/today`
- Arrow keys move a visible keyboard cursor on the board
- `Enter` / `Space` places the current move
- `/today`: `R` resets the current move, `Esc` clears the current move
- `/result`: `R` retries, left/right arrows step the solution, `Esc` closes the current solution view
- Shortcut hints are shown in the UI instead of remaining hidden behavior

### 6. Conservative offline shell

- `public/sw.js`
- `public/offline.html`
- `public/manifest.json`
- Service worker support remains enabled through `ClientInit`
- Dynamic HTML pages such as `/today` are **not precached**
- Document requests use network-first and fall back to a dedicated offline page
- Static assets use cache-first
- The goal is a safe offline shell, not full offline browsing of dynamic puzzle pages

## Scope that was removed instead of pretending it exists

The following helper modules were **not** kept because they were not meaningfully wired into the runtime or UI:

- `lib/compression.ts`
- `lib/env.ts`
- `lib/logger.ts`
- `lib/safeFetch.ts`
- `lib/throttle.ts`
- `lib/useKeyboardShortcuts.ts`

Their related standalone tests were removed as well. v1.1 now prefers fewer connected features over a larger pile of unused helpers.

## Validation status

Latest verification on this branch:

- `npm run lint` ✅
- `npm run test` ✅
- `145` tests across `33` test files
- `npm run build` ✅

## Public wording guardrails

Use these phrases when describing v1.1:

- Say **“integrity check / corruption recovery”**, not “anti-tamper” or “forgery-proof”
- Say **“errors are uploaded to the internal report endpoint and visible in server logs”**, not “the admin is automatically notified”
- Say **“basic offline shell”**, not “the whole site works offline”
- Say **“keyboard controls on today/result pages”**, not “site-wide hotkeys”

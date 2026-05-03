# Database Schema Reference

This document describes the Supabase (Postgres) schema for go-daily, derived from the migration files in `supabase/migrations/`.

---

## Tables

### 1. `profiles`

User profile, auto-created on signup via `handle_new_user()` trigger.

| Column                     | Type          | Constraints                                                                                                        | Description                         |
| -------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| `user_id`                  | `uuid`        | PK, FK → `auth.users(id)` ON DELETE CASCADE                                                                        | Supabase Auth user ID               |
| `locale`                   | `text`        | NOT NULL, DEFAULT `'en'`, CHECK IN (`zh`,`en`,`ja`,`ko`)                                                           | Preferred language                  |
| `timezone`                 | `text`        | NOT NULL, DEFAULT `'UTC'`                                                                                          | IANA timezone for date calculations |
| `kyu_rank`                 | `integer`     | nullable                                                                                                           | Self-reported Go rank               |
| `display_name`             | `text`        | nullable                                                                                                           | Public display name                 |
| `email_opt_out`            | `boolean`     | NOT NULL, DEFAULT `false`                                                                                          | Opt out of all emails               |
| `deleted_at`               | `timestamptz` | nullable                                                                                                           | Soft-delete timestamp               |
| `welcome_email_sent_at`    | `timestamptz` | nullable                                                                                                           | When welcome email was sent         |
| `daily_email_last_sent_on` | `date`        | nullable                                                                                                           | Last daily puzzle email date        |
| `email_unsubscribe_token`  | `text`        | NOT NULL, DEFAULT `replace(gen_random_uuid()::text, '-', '')`, UNIQUE INDEX `profiles_email_unsubscribe_token_idx` | One-click unsubscribe token         |
| `created_at`               | `timestamptz` | NOT NULL, DEFAULT `now()`                                                                                          | —                                   |
| `updated_at`               | `timestamptz` | NOT NULL, DEFAULT `now()`                                                                                          | —                                   |

**RLS**: Users can read/write only their own row (`auth.uid() = user_id`).

**Trigger**: `handle_new_user()` fires after INSERT on `auth.users`, creating a profile with locale/timezone from `raw_user_meta_data`.

---

### 2. `attempts`

Append-only puzzle attempt log. Mirrors `AttemptRecord` from `types/index.ts`.

| Column                | Type          | Constraints                     | Description                        |
| --------------------- | ------------- | ------------------------------- | ---------------------------------- |
| `id`                  | `bigserial`   | PK                              | Auto-increment ID                  |
| `user_id`             | `uuid`        | NOT NULL, FK → `auth.users(id)` | Owner                              |
| `puzzle_id`           | `text`        | NOT NULL                        | Puzzle identifier                  |
| `date`                | `text`        | NOT NULL                        | Local YYYY-MM-DD as seen by client |
| `user_move_x`         | `integer`     | nullable                        | X coordinate of user's move        |
| `user_move_y`         | `integer`     | nullable                        | Y coordinate of user's move        |
| `correct`             | `boolean`     | NOT NULL                        | Whether the move was correct       |
| `duration_ms`         | `integer`     | nullable                        | Time spent (optional)              |
| `client_solved_at_ms` | `bigint`      | NOT NULL                        | Epoch ms when solved (client-side) |
| `created_at`          | `timestamptz` | NOT NULL, DEFAULT `now()`       | —                                  |

**Constraints**: `UNIQUE (user_id, puzzle_id, client_solved_at_ms)` — the global dedup key.

**Indexes**:

- `attempts_user_time_idx` on `(user_id, client_solved_at_ms DESC)`
- `attempts_user_puzzle_idx` on `(user_id, puzzle_id)`
- `attempts_user_date_idx` on `(user_id, date)`

**RLS**: Users can SELECT and INSERT their own rows. No UPDATE/DELETE (append-only).

---

### 3. `coach_usage`

Per-user daily AI coach usage counter.

| Column    | Type      | Constraints                     | Description                       |
| --------- | --------- | ------------------------------- | --------------------------------- |
| `user_id` | `uuid`    | NOT NULL, FK → `auth.users(id)` | Owner                             |
| `day`     | `date`    | NOT NULL                        | Calendar day in user's timezone   |
| `count`   | `integer` | NOT NULL, DEFAULT `0`           | Number of coach messages that day |

**PK**: `(user_id, day)`

**RLS**: Users can SELECT their own rows.

**Writes**: Inserts / updates happen only through `service_role`, using the Postgres RPC `increment_coach_usage(p_user_id uuid, p_day text)` (migration `0007_atomic_coach_usage_increment.sql`) so daily counts are incremented atomically (`lib/coach/coachState.ts` → `incrementCoachUsage`).

---

### 4. `subscriptions`

Stripe subscription state. Written exclusively by webhook handler.

| Column                   | Type          | Constraints               | Description                                            |
| ------------------------ | ------------- | ------------------------- | ------------------------------------------------------ |
| `user_id`                | `uuid`        | PK, FK → `auth.users(id)` | Owner                                                  |
| `stripe_customer_id`     | `text`        | NOT NULL                  | Stripe customer ID                                     |
| `stripe_subscription_id` | `text`        | NOT NULL                  | Stripe subscription ID                                 |
| `plan`                   | `text`        | NOT NULL                  | Plan identifier (e.g. `pro_monthly`)                   |
| `status`                 | `text`        | NOT NULL                  | Stripe status (`active`, `trialing`, `canceled`, etc.) |
| `current_period_end`     | `timestamptz` | nullable                  | When current billing period ends                       |
| `cancel_at_period_end`   | `boolean`     | NOT NULL, DEFAULT `false` | Scheduled cancellation                                 |
| `trial_end`              | `timestamptz` | nullable                  | When trial period ends                                 |
| `first_paid_at`          | `timestamptz` | nullable                  | Timestamp of first successful payment                  |
| `coach_anchor_day`       | `integer`     | CHECK (1–31)              | Billing cycle anchor day for coach quota window        |
| `updated_at`             | `timestamptz` | NOT NULL, DEFAULT `now()` | —                                                      |

**Index**: `subscriptions_customer_idx` on `(stripe_customer_id)`

**RLS**: Users can SELECT their own row. Writes happen via `service_role` only.

---

### 5. `srs_cards`

Spaced repetition schedule per user per puzzle.

| Column             | Type          | Constraints                      | Description                |
| ------------------ | ------------- | -------------------------------- | -------------------------- |
| `user_id`          | `uuid`        | NOT NULL, FK → `auth.users(id)`  | Owner                      |
| `puzzle_id`        | `text`        | NOT NULL                         | Puzzle identifier          |
| `ease_factor`      | `numeric`     | NOT NULL, DEFAULT `2.5`          | SM-2 ease factor (min 1.3) |
| `interval_days`    | `integer`     | NOT NULL, DEFAULT `0`            | Days until next review     |
| `due_date`         | `date`        | NOT NULL, DEFAULT `current_date` | Next review date           |
| `last_reviewed_at` | `timestamptz` | nullable                         | Last review timestamp      |

**PK**: `(user_id, puzzle_id)`

**Index**: `srs_due_idx` on `(user_id, due_date)`

**RLS**: Full CRUD for owner (`auth.uid() = user_id`).

---

### 6. `stripe_events`

Webhook idempotency ledger. Prevents duplicate event processing.

| Column                  | Type          | Constraints               | Description                                      |
| ----------------------- | ------------- | ------------------------- | ------------------------------------------------ |
| `id`                    | `text`        | PK                        | Stripe event ID (`evt_...`)                      |
| `event_type`            | `text`        | NOT NULL                  | Stripe event type string                         |
| `received_at`           | `timestamptz` | NOT NULL, DEFAULT `now()` | When event was first received                    |
| `processed_at`          | `timestamptz` | nullable                  | When processing completed                        |
| `processing_started_at` | `timestamptz` | nullable                  | When processing began (for stale lock detection) |
| `last_error`            | `text`        | nullable                  | Error message if processing failed               |

**Index**: `stripe_events_processing_idx` on `(processed_at, processing_started_at)`

**RLS**: No public access (`FOR SELECT USING (false)`). All operations via `service_role`.

---

### 7. `user_devices`

Device registry for Free-plan single-device enforcement.

| Column       | Type          | Constraints                     | Description                         |
| ------------ | ------------- | ------------------------------- | ----------------------------------- |
| `user_id`    | `uuid`        | NOT NULL, FK → `auth.users(id)` | Owner                               |
| `device_id`  | `text`        | NOT NULL                        | Client-generated device fingerprint |
| `first_seen` | `timestamptz` | NOT NULL, DEFAULT `now()`       | First login from this device        |
| `last_seen`  | `timestamptz` | NOT NULL, DEFAULT `now()`       | Most recent activity                |
| `user_agent` | `text`        | nullable                        | Browser user agent string           |

**PK**: `(user_id, device_id)`

**Index**: `user_devices_last_seen_idx` on `(user_id, last_seen DESC)`

**RLS**: Full CRUD for owner.

---

### 8. `guest_coach_usage`

Per-device guest AI coach usage counter by calendar day (persists across deploys).

| Column       | Type          | Constraints               | Description                                 |
| ------------ | ------------- | ------------------------- | ------------------------------------------- |
| `device_id`  | `text`        | NOT NULL, PK part         | Guest device fingerprint from client header |
| `day`        | `text`        | NOT NULL, PK part         | ISO `YYYY-MM-DD` (UTC)                      |
| `count`      | `integer`     | NOT NULL, DEFAULT `0`     | Coach messages for that device/day          |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT `now()` | —                                           |

**PK**: `(device_id, day)`

**RLS**: Enabled with **no** policies — all access via `service_role` (`lib/coach/guestCoachUsage.ts`).

**Writes**: Atomically incremented via `increment_guest_coach_usage(p_device_id text, p_day text)` in the same migration; called from `incrementGuestUsage` in `guestCoachUsage.ts`.

---

### 9. `manual_grants`

Admin-assigned Pro access by email without Stripe checkout.

| Column       | Type          | Constraints                 | Description                        |
| ------------ | ------------- | --------------------------- | ---------------------------------- |
| `email`      | `text`        | PK                          | Lowercase grantee email            |
| `expires_at` | `timestamptz` | NOT NULL                    | When the grant lapses              |
| `granted_by` | `text`        | NOT NULL, DEFAULT `'admin'` | Audit label (who issued the grant) |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT `now()`   | —                                  |

**RLS**: Enabled with **no** policies — reads and writes occur only through `service_role` on trusted server routes (`app/api/admin/grants`, entitlement resolution).

---

## RLS Summary

| Table               | Policy                       | Access                                  |
| ------------------- | ---------------------------- | --------------------------------------- |
| `profiles`          | `own profile`                | Full CRUD (own row only)                |
| `attempts`          | `own attempts select/insert` | SELECT + INSERT (own rows, append-only) |
| `coach_usage`       | `own usage select`           | SELECT only (writes via service_role)   |
| `subscriptions`     | `own subs select`            | SELECT only (writes via service_role)   |
| `srs_cards`         | `own srs`                    | Full CRUD (own row only)                |
| `stripe_events`     | `no public stripe events`    | No public access (service_role only)    |
| `user_devices`      | `own devices`                | Full CRUD (own row only)                |
| `guest_coach_usage` | _(none)_                     | No client access (service_role only)    |
| `manual_grants`     | _(none)_                     | No client access (service_role only)    |

---

## Postgres functions (RPC)

| Function                                                    | Purpose                                                                                      |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `increment_coach_usage(p_user_id uuid, p_day text)`         | `INSERT … ON CONFLICT DO UPDATE` on `(user_id, day)` for `coach_usage`; returns new `count`. |
| `increment_guest_coach_usage(p_device_id text, p_day text)` | Same pattern on `guest_coach_usage`; returns new `count`.                                    |

Both eliminate read–modify–write races from concurrent coach requests.

---

## Extensions

- `pgcrypto` — used for `gen_random_uuid()` in `email_unsubscribe_token` default.

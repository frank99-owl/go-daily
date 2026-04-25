-- go-daily initial schema
-- Covers Phase 1 (accounts + cross-device sync) and Phase 2 (subscriptions
-- + SRS + paywall triggers) tables up front, so we do not have to run
-- another migration when Phase 2 lands.
--
-- Apply via Supabase Dashboard → SQL Editor (paste + Run) or via the
-- Supabase CLI: `supabase db push`.

-- ---------------------------------------------------------------------------
-- 1. profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  locale text not null default 'en' check (locale in ('zh', 'en', 'ja', 'ko')),
  timezone text not null default 'UTC',
  kyu_rank integer,
  display_name text,
  email_opt_out boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. attempts (append-only; mirrors localStorage AttemptRecord)
-- ---------------------------------------------------------------------------
create table if not exists public.attempts (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  puzzle_id text not null,
  date text not null,                        -- local YYYY-MM-DD as seen by the client
  user_move_x integer,
  user_move_y integer,
  correct boolean not null,
  duration_ms integer,
  client_solved_at_ms bigint not null,       -- mirrors AttemptRecord.solvedAtMs
  created_at timestamptz not null default now(),
  unique (user_id, puzzle_id, client_solved_at_ms)
);
create index if not exists attempts_user_time_idx
  on public.attempts (user_id, client_solved_at_ms desc);
create index if not exists attempts_user_puzzle_idx
  on public.attempts (user_id, puzzle_id);
create index if not exists attempts_user_date_idx
  on public.attempts (user_id, date);

-- ---------------------------------------------------------------------------
-- 3. coach_usage (per-user daily counter used by the Coach quota in Phase 2)
-- ---------------------------------------------------------------------------
create table if not exists public.coach_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  count integer not null default 0,
  primary key (user_id, day)
);

-- ---------------------------------------------------------------------------
-- 4. subscriptions (Stripe — written by webhook only)
-- ---------------------------------------------------------------------------
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text not null,
  plan text not null,
  status text not null,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  trial_end timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists subscriptions_customer_idx
  on public.subscriptions (stripe_customer_id);

-- ---------------------------------------------------------------------------
-- 5. srs_cards (Phase 2 SRS review schedule)
-- ---------------------------------------------------------------------------
create table if not exists public.srs_cards (
  user_id uuid not null references auth.users(id) on delete cascade,
  puzzle_id text not null,
  ease_factor numeric not null default 2.5,
  interval_days integer not null default 0,
  due_date date not null default current_date,
  last_reviewed_at timestamptz,
  primary key (user_id, puzzle_id)
);
create index if not exists srs_due_idx
  on public.srs_cards (user_id, due_date);

-- ---------------------------------------------------------------------------
-- 6. stripe_events (webhook idempotency ledger)
-- ---------------------------------------------------------------------------
create table if not exists public.stripe_events (
  id text primary key,                       -- stripe event id (evt_...)
  event_type text not null,
  received_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 7. user_devices (Free-plan cross-device paywall + fraud signals)
-- ---------------------------------------------------------------------------
create table if not exists public.user_devices (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  user_agent text,
  primary key (user_id, device_id)
);
create index if not exists user_devices_last_seen_idx
  on public.user_devices (user_id, last_seen desc);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.attempts       enable row level security;
alter table public.coach_usage    enable row level security;
alter table public.subscriptions  enable row level security;
alter table public.srs_cards      enable row level security;
alter table public.stripe_events  enable row level security;
alter table public.user_devices   enable row level security;

-- profiles: users read/write only their own row.
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- attempts: users read/insert only their own rows. No update/delete (append-only).
drop policy if exists "own attempts select" on public.attempts;
create policy "own attempts select" on public.attempts
  for select using (auth.uid() = user_id);
drop policy if exists "own attempts insert" on public.attempts;
create policy "own attempts insert" on public.attempts
  for insert with check (auth.uid() = user_id);

-- coach_usage / subscriptions: read-only for owners; writes happen via service_role.
drop policy if exists "own usage select" on public.coach_usage;
create policy "own usage select" on public.coach_usage
  for select using (auth.uid() = user_id);
drop policy if exists "own subs select" on public.subscriptions;
create policy "own subs select" on public.subscriptions
  for select using (auth.uid() = user_id);

-- srs_cards: full CRUD for owner.
drop policy if exists "own srs" on public.srs_cards;
create policy "own srs" on public.srs_cards
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- stripe_events: no-op policy so nobody can read the ledger from the browser.
-- Writes happen via service_role only.
drop policy if exists "no public stripe events" on public.stripe_events;
create policy "no public stripe events" on public.stripe_events
  for select using (false);

-- user_devices: users see their own devices.
drop policy if exists "own devices" on public.user_devices;
create policy "own devices" on public.user_devices
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- handle_new_user — auto-create a profile row on signup
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, locale, timezone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'locale', 'en'),
    coalesce(new.raw_user_meta_data->>'timezone', 'UTC')
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

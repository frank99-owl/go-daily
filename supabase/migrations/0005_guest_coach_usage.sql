-- Guest coach usage tracking by device ID.
-- Persists across Vercel redeployments (unlike in-memory IP counters).

create table public.guest_coach_usage (
  device_id  text        not null,
  day        text        not null,
  count      int         not null default 0,
  created_at timestamptz not null default now(),
  primary key (device_id, day)
);

alter table public.guest_coach_usage enable row level security;

-- No RLS policies needed: all reads/writes happen via service_role on the server.

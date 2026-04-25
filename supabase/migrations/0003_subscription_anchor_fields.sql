alter table public.subscriptions
  add column if not exists first_paid_at timestamptz,
  add column if not exists coach_anchor_day integer check (coach_anchor_day between 1 and 31);

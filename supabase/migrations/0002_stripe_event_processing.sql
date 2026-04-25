-- Track whether a claimed Stripe webhook event has actually completed.
-- This closes the race where duplicate deliveries can both pass a SELECT
-- check before either writes the idempotency ledger row.

alter table public.stripe_events
  add column if not exists processed_at timestamptz,
  add column if not exists processing_started_at timestamptz,
  add column if not exists last_error text;

create index if not exists stripe_events_processing_idx
  on public.stripe_events (processed_at, processing_started_at);

-- Manual Pro grants: admin can grant Pro access to specific emails
-- without going through Stripe.

create table public.manual_grants (
  email      text        not null,
  expires_at timestamptz not null,
  granted_by text        not null default 'admin',
  created_at timestamptz not null default now(),
  primary key (email)
);

alter table public.manual_grants enable row level security;

-- No RLS policies needed: all reads/writes happen via service_role on the server.

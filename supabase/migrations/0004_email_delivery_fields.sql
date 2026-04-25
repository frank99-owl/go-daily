create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists welcome_email_sent_at timestamptz,
  add column if not exists daily_email_last_sent_on date,
  add column if not exists email_unsubscribe_token text;

update public.profiles
set email_unsubscribe_token = replace(gen_random_uuid()::text, '-', '')
where email_unsubscribe_token is null;

alter table public.profiles
  alter column email_unsubscribe_token set default replace(gen_random_uuid()::text, '-', ''),
  alter column email_unsubscribe_token set not null;

create unique index if not exists profiles_email_unsubscribe_token_idx
  on public.profiles (email_unsubscribe_token);

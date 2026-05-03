-- Atomic coach usage increment functions.
-- Eliminates the read-then-write race condition in the JS layer.

create or replace function public.increment_coach_usage(p_user_id uuid, p_day text)
returns integer
language sql
as $$
  insert into public.coach_usage (user_id, day, count)
  values (p_user_id, p_day, 1)
  on conflict (user_id, day)
  do update set count = public.coach_usage.count + 1
  returning count;
$$;

create or replace function public.increment_guest_coach_usage(p_device_id text, p_day text)
returns integer
language sql
as $$
  insert into public.guest_coach_usage (device_id, day, count)
  values (p_device_id, p_day, 1)
  on conflict (device_id, day)
  do update set count = public.guest_coach_usage.count + 1
  returning count;
$$;

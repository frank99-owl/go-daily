-- Atomic quota-aware coach usage helpers.
-- The route still reads usage for display, but the actual "may I spend one
-- coach request?" decision must be made inside the database to avoid
-- concurrent overrun / refund races.

create or replace function public.try_increment_coach_usage(
  p_user_id uuid,
  p_day text,
  p_month_start text,
  p_month_end text,
  p_daily_limit integer,
  p_monthly_limit integer
)
returns jsonb
language plpgsql
as $$
declare
  current_daily integer;
  current_monthly integer;
  next_daily integer;
  next_monthly integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text)::bigint);

  select coalesce(max(count), 0)
    into current_daily
    from public.coach_usage
   where user_id = p_user_id
     and day = p_day::date;

  select coalesce(sum(count), 0)::integer
    into current_monthly
    from public.coach_usage
   where user_id = p_user_id
     and day >= p_month_start::date
     and day <= p_month_end::date;

  if current_daily >= p_daily_limit then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'daily_limit_reached',
      'dailyUsed', current_daily,
      'monthlyUsed', current_monthly
    );
  end if;

  if current_monthly >= p_monthly_limit then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'monthly_limit_reached',
      'dailyUsed', current_daily,
      'monthlyUsed', current_monthly
    );
  end if;

  insert into public.coach_usage (user_id, day, count)
  values (p_user_id, p_day::date, 1)
  on conflict (user_id, day)
  do update set count = public.coach_usage.count + 1
  returning count into next_daily;

  next_monthly := current_monthly + 1;

  return jsonb_build_object(
    'allowed', true,
    'reason', null,
    'dailyUsed', next_daily,
    'monthlyUsed', next_monthly
  );
end;
$$;

create or replace function public.try_increment_guest_coach_usage(
  p_device_id text,
  p_day text,
  p_month_start text,
  p_daily_limit integer,
  p_monthly_limit integer
)
returns jsonb
language plpgsql
as $$
declare
  current_daily integer;
  current_monthly integer;
  next_daily integer;
  next_monthly integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_device_id)::bigint);

  select coalesce(max(count), 0)
    into current_daily
    from public.guest_coach_usage
   where device_id = p_device_id
     and day = p_day;

  select coalesce(sum(count), 0)::integer
    into current_monthly
    from public.guest_coach_usage
   where device_id = p_device_id
     and day >= p_month_start
     and day <= p_day;

  if current_daily >= p_daily_limit then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'daily_limit_reached',
      'dailyUsed', current_daily,
      'monthlyUsed', current_monthly
    );
  end if;

  if current_monthly >= p_monthly_limit then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'monthly_limit_reached',
      'dailyUsed', current_daily,
      'monthlyUsed', current_monthly
    );
  end if;

  insert into public.guest_coach_usage (device_id, day, count)
  values (p_device_id, p_day, 1)
  on conflict (device_id, day)
  do update set count = public.guest_coach_usage.count + 1
  returning count into next_daily;

  next_monthly := current_monthly + 1;

  return jsonb_build_object(
    'allowed', true,
    'reason', null,
    'dailyUsed', next_daily,
    'monthlyUsed', next_monthly
  );
end;
$$;

create or replace function public.decrement_coach_usage(p_user_id uuid, p_day text)
returns integer
language sql
as $$
  update public.coach_usage
     set count = greatest(count - 1, 0)
   where user_id = p_user_id
     and day = p_day::date
     and count > 0
  returning count;
$$;

create or replace function public.decrement_guest_coach_usage(p_device_id text, p_day text)
returns integer
language sql
as $$
  update public.guest_coach_usage
     set count = greatest(count - 1, 0)
   where device_id = p_device_id
     and day = p_day
     and count > 0
  returning count;
$$;

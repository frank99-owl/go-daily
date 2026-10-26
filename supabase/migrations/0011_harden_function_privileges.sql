-- Only the server calls these functions, through the service_role client
-- (lib/coach/coachState.ts, lib/coach/guestCoachUsage.ts). Postgres grants
-- EXECUTE to PUBLIC by default and Supabase adds anon and authenticated, so a
-- browser holding the anon key could call them over /rest/v1/rpc. The quota
-- functions are SECURITY INVOKER, which let RLS refuse the writes, but there is
-- no reason for the path to exist at all.
--
-- The quota functions also had a mutable search_path (Supabase advisor
-- function_search_path_mutable). Every body schema-qualifies its tables and
-- uses only pg_catalog built-ins, so an empty search_path changes nothing they
-- resolve.

revoke execute on function public.increment_coach_usage(uuid, text) from public, anon, authenticated;
revoke execute on function public.try_increment_coach_usage(uuid, text, text, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.decrement_coach_usage(uuid, text) from public, anon, authenticated;
revoke execute on function public.increment_guest_coach_usage(text, text) from public, anon, authenticated;
revoke execute on function public.try_increment_guest_coach_usage(text, text, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.decrement_guest_coach_usage(text, text) from public, anon, authenticated;

alter function public.increment_coach_usage(uuid, text) set search_path = '';
alter function public.try_increment_coach_usage(uuid, text, text, text, integer, integer) set search_path = '';
alter function public.decrement_coach_usage(uuid, text) set search_path = '';
alter function public.increment_guest_coach_usage(text, text) set search_path = '';
alter function public.try_increment_guest_coach_usage(text, text, text, integer, integer) set search_path = '';
alter function public.decrement_guest_coach_usage(text, text) set search_path = '';

-- handle_new_user runs only as the on_auth_user_created trigger and already
-- pins its search_path. Postgres checks EXECUTE when a trigger is created, not
-- when it fires, but Auth's role keeps an explicit grant so sign-up never
-- depends on that detail.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to supabase_auth_admin;

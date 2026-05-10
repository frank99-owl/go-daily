-- user_devices rows are written only through trusted server routes with the
-- service_role client. Browser clients may read their own device registry for
-- transparency, but must not be able to delete or rewrite rows to bypass the
-- entitlement-aware device limit.

drop policy if exists "own devices" on public.user_devices;
drop policy if exists "own devices select" on public.user_devices;

create policy "own devices select" on public.user_devices
  for select using (auth.uid() = user_id);

-- Run this in the existing device validation Supabase project:
-- https://pqqyaytegdemfobrutmt.supabase.co
--
-- This creates no tables. It only allows the mobile anon key to read the
-- existing public.managed_devices and public.employees tables.
-- Employee roles are read from public.employees.rol.

grant usage on schema public to anon, authenticated;
grant select on public.managed_devices to anon, authenticated;
grant select on public.employees to anon, authenticated;

alter table public.managed_devices enable row level security;
alter table public.employees enable row level security;

drop policy if exists "anon can read managed devices for mobile validation" on public.managed_devices;
create policy "anon can read managed devices for mobile validation"
on public.managed_devices
for select
to anon, authenticated
using (true);

drop policy if exists "anon can read active employees for mobile validation" on public.employees;
create policy "anon can read active employees for mobile validation"
on public.employees
for select
to anon, authenticated
using (coalesce(active, false) = true);

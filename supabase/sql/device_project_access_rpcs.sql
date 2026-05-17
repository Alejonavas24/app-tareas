-- Run this in the device validation Supabase project:
-- https://pqqyaytegdemfobrutmt.supabase.co

create or replace function public.validate_managed_device(p_device_id text)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_device public.managed_devices%rowtype;
  v_employee public.employees%rowtype;
begin
  if nullif(trim(coalesce(p_device_id, '')), '') is null then
    raise exception 'device_id es obligatorio';
  end if;

  select *
  into v_device
  from public.managed_devices
  where device_id = trim(p_device_id)
  limit 1;

  if not found then
    return jsonb_build_object(
      'valid', false,
      'reason', 'device_not_registered',
      'deviceId', trim(p_device_id)
    );
  end if;

  if coalesce(v_device.active, false) = false then
    return jsonb_build_object(
      'valid', false,
      'reason', 'device_inactive',
      'deviceId', v_device.device_id
    );
  end if;

  select *
  into v_employee
  from public.employees
  where id = v_device.employee_id
  limit 1;

  if not found then
    return jsonb_build_object(
      'valid', false,
      'reason', 'employee_not_found',
      'deviceId', v_device.device_id
    );
  end if;

  if coalesce(v_employee.active, false) = false then
    return jsonb_build_object(
      'valid', false,
      'reason', 'employee_inactive',
      'deviceId', v_device.device_id
    );
  end if;

  return jsonb_build_object(
    'valid', true,
    'deviceId', v_device.device_id,
    'employeeId', v_employee.id::text,
    'fullName', coalesce(v_employee.full_name, 'Empleado'),
    'rol', coalesce(v_employee.rol, '')
  );
end;
$function$;

create or replace function public.list_assignable_waiters()
returns jsonb
language sql
security definer
set search_path = 'public'
as $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'employeeId', e.id::text,
        'fullName', coalesce(e.full_name, 'Empleado'),
        'rol', coalesce(e.rol, ''),
        'skillLevel', 0
      )
      order by e.full_name
    ),
    '[]'::jsonb
  )
  from public.employees e
  where coalesce(e.active, false) = true
    and exists (
      select 1
      from regexp_split_to_table(coalesce(e.rol, ''), ',') as role_name
      where lower(trim(role_name)) = 'camarero'
    );
$function$;

revoke all on function public.validate_managed_device(text) from public;
revoke all on function public.list_assignable_waiters() from public;

grant execute on function public.validate_managed_device(text) to anon, authenticated;
grant execute on function public.list_assignable_waiters() to anon, authenticated;

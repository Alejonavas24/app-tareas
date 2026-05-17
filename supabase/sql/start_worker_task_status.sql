alter table tareas.event_task_instances
  add column if not exists started_at timestamptz;

do $$
declare
  v_constraint text;
begin
  for v_constraint in
    select conname
    from pg_constraint
    where conrelid = 'tareas.event_task_instances'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%status%'
  loop
    execute format('alter table tareas.event_task_instances drop constraint %I', v_constraint);
  end loop;
end $$;

alter table tareas.event_task_instances
  add constraint event_task_instances_status_check
  check (status in ('pending', 'in_progress', 'completed', 'cancelled'));

create or replace function public.list_event_tasks(p_event_id uuid)
returns jsonb
language sql
security definer
set search_path = 'tareas', 'public'
as $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', ti.id,
        'eventId', ti.event_id,
        'blockKey', ti.block_key,
        'blockId', ti.block_id,
        'blockLabel', b.label,
        'taskCode', ti.catalog_task_code,
        'taskName', ti.task_name,
        'details', ti.details,
        'startTime', ti.start_time,
        'endTime', ti.end_time,
        'status', ti.status,
        'requiredLevel', ti.required_level,
        'startedAt', ti.started_at,
        'completedAt', ti.completed_at,
        'completedByEmployeeId', ti.completed_by_employee_id
      )
      order by ti.sort_order, ti.task_name
    ),
    '[]'::jsonb
  )
  from tareas.event_task_instances ti
  join tareas.timeline_blocks b on b.event_id = ti.event_id and b.block_key = ti.block_key
  where ti.event_id = p_event_id;
$function$;

create or replace function public.list_worker_tasks(
  p_employee_id text,
  p_date_from date default null,
  p_date_to date default null,
  p_include_completed boolean default false
)
returns jsonb
language sql
security definer
set search_path = 'tareas', 'public'
as $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', ti.id,
        'eventId', ti.event_id,
        'eventName', e.name,
        'eventDate', e.event_date,
        'blockKey', ti.block_key,
        'blockId', ti.block_id,
        'blockLabel', b.label,
        'taskCode', ti.catalog_task_code,
        'taskName', ti.task_name,
        'details', ti.details,
        'startTime', ti.start_time,
        'endTime', ti.end_time,
        'status', ti.status,
        'requiredLevel', ti.required_level,
        'shiftName', s.shift_name,
        'assignedByBlock', exists (
          select 1
          from tareas.event_block_assignments ba
          where ba.event_id = ti.event_id
            and ba.block_key = ti.block_key
            and ba.staff_assignment_id = s.id
        ),
        'assignedDirectly', exists (
          select 1
          from tareas.event_task_assignments ta
          where ta.event_task_instance_id = ti.id
            and ta.staff_assignment_id = s.id
        ),
        'startedAt', ti.started_at,
        'completedAt', ti.completed_at,
        'completedByEmployeeId', ti.completed_by_employee_id
      )
      order by e.event_date, tareas.event_minute(ti.start_time, e.open_doors_time), ti.sort_order
    ),
    '[]'::jsonb
  )
  from tareas.event_task_instances ti
  join tareas.timeline_events e on e.id = ti.event_id
  join tareas.timeline_blocks b on b.event_id = ti.event_id and b.block_key = ti.block_key
  join tareas.event_staff_assignments s on s.event_id = ti.event_id and s.employee_id = p_employee_id
  where (p_include_completed or ti.status in ('pending', 'in_progress'))
    and (p_date_from is null or e.event_date >= p_date_from)
    and (p_date_to is null or e.event_date <= p_date_to)
    and s.skill_level >= ti.required_level
    and (
      exists (
        select 1 from tareas.event_block_assignments ba
        where ba.event_id = ti.event_id
          and ba.block_key = ti.block_key
          and ba.staff_assignment_id = s.id
      )
      or exists (
        select 1 from tareas.event_task_assignments ta
        where ta.event_task_instance_id = ti.id
          and ta.staff_assignment_id = s.id
      )
    )
    and tareas.event_minute(ti.start_time, e.open_doors_time) < tareas.event_minute(s.shift_end, e.open_doors_time)
    and tareas.event_minute(s.shift_start, e.open_doors_time) < tareas.event_minute(ti.end_time, e.open_doors_time);
$function$;

create or replace function public.start_worker_task(
  p_task_instance_id uuid,
  p_employee_id text
)
returns jsonb
language plpgsql
security definer
set search_path = 'tareas', 'public'
as $function$
declare
  v_task tareas.event_task_instances%rowtype;
  v_staff tareas.event_staff_assignments%rowtype;
  v_allowed boolean;
begin
  select *
  into v_task
  from tareas.event_task_instances
  where id = p_task_instance_id
  for update;

  if not found then
    raise exception 'No existe la tarea %', p_task_instance_id;
  end if;

  select *
  into v_staff
  from tareas.event_staff_assignments
  where event_id = v_task.event_id
    and employee_id = p_employee_id
  limit 1;

  if not found then
    raise exception 'El empleado no esta asignado al evento';
  end if;

  select (
    v_staff.skill_level >= v_task.required_level
    and (
      exists (
        select 1 from tareas.event_block_assignments ba
        where ba.event_id = v_task.event_id
          and ba.block_key = v_task.block_key
          and ba.staff_assignment_id = v_staff.id
      )
      or exists (
        select 1 from tareas.event_task_assignments ta
        where ta.event_task_instance_id = v_task.id
          and ta.staff_assignment_id = v_staff.id
      )
    )
  ) into v_allowed;

  if not coalesce(v_allowed, false) then
    raise exception 'El empleado no puede iniciar esta tarea';
  end if;

  if v_task.status = 'cancelled' then
    raise exception 'La tarea esta cancelada';
  end if;

  if v_task.status = 'completed' then
    raise exception 'La tarea ya esta completada';
  end if;

  update tareas.event_task_instances
  set
    status = 'in_progress',
    started_at = coalesce(started_at, timezone('utc', now())),
    updated_at = timezone('utc', now())
  where id = p_task_instance_id
  returning * into v_task;

  return jsonb_build_object(
    'id', v_task.id,
    'status', v_task.status,
    'startedAt', v_task.started_at
  );
end;
$function$;

create or replace function public.complete_worker_task(
  p_task_instance_id uuid,
  p_employee_id text
)
returns jsonb
language plpgsql
security definer
set search_path = 'tareas', 'public'
as $function$
declare
  v_task tareas.event_task_instances%rowtype;
  v_staff tareas.event_staff_assignments%rowtype;
  v_allowed boolean;
begin
  select *
  into v_task
  from tareas.event_task_instances
  where id = p_task_instance_id
  for update;

  if not found then
    raise exception 'No existe la tarea %', p_task_instance_id;
  end if;

  select *
  into v_staff
  from tareas.event_staff_assignments
  where event_id = v_task.event_id
    and employee_id = p_employee_id
  limit 1;

  if not found then
    raise exception 'El empleado no esta asignado al evento';
  end if;

  select (
    v_staff.skill_level >= v_task.required_level
    and (
      exists (
        select 1 from tareas.event_block_assignments ba
        where ba.event_id = v_task.event_id
          and ba.block_key = v_task.block_key
          and ba.staff_assignment_id = v_staff.id
      )
      or exists (
        select 1 from tareas.event_task_assignments ta
        where ta.event_task_instance_id = v_task.id
          and ta.staff_assignment_id = v_staff.id
      )
    )
  ) into v_allowed;

  if not coalesce(v_allowed, false) then
    raise exception 'El empleado no puede completar esta tarea';
  end if;

  if v_task.status = 'cancelled' then
    raise exception 'La tarea esta cancelada';
  end if;

  update tareas.event_task_instances
  set
    status = 'completed',
    started_at = coalesce(started_at, timezone('utc', now())),
    completed_at = timezone('utc', now()),
    completed_by_employee_id = p_employee_id,
    updated_at = timezone('utc', now())
  where id = p_task_instance_id
  returning * into v_task;

  return jsonb_build_object(
    'id', v_task.id,
    'status', v_task.status,
    'startedAt', v_task.started_at,
    'completedAt', v_task.completed_at,
    'completedByEmployeeId', v_task.completed_by_employee_id
  );
end;
$function$;

grant execute on function public.list_event_tasks(uuid) to anon, authenticated;
grant execute on function public.list_worker_tasks(text, date, date, boolean) to anon, authenticated;
grant execute on function public.start_worker_task(uuid, text) to anon, authenticated;
grant execute on function public.complete_worker_task(uuid, text) to anon, authenticated;

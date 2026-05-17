create extension if not exists pgcrypto with schema extensions;

alter table tareas.timeline_blocks
  add column if not exists required_staff_min integer,
  add column if not exists staffing_rule text;

alter table tareas.event_task_instances
  add column if not exists started_at timestamptz,
  add column if not exists required_staff_min integer,
  add column if not exists staffing_rule text,
  add column if not exists num_personas text;

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

create table if not exists tareas.task_execution_logs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references tareas.timeline_events (id) on delete cascade,
  task_instance_id uuid references tareas.event_task_instances (id) on delete set null,
  block_key text,
  employee_id text,
  action text not null check (action in ('start', 'complete', 'complete_block', 'timeline_shift')),
  source text not null default 'system',
  previous_status text,
  new_status text,
  started_at timestamptz,
  completed_at timestamptz,
  duration_seconds integer,
  bulk_operation_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists task_execution_logs_event_created_idx
  on tareas.task_execution_logs (event_id, created_at desc);
create index if not exists task_execution_logs_task_idx
  on tareas.task_execution_logs (task_instance_id, created_at desc);
create index if not exists task_execution_logs_bulk_idx
  on tareas.task_execution_logs (bulk_operation_id);

create or replace function public.save_timeline_snapshot(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = 'tareas', 'public'
as $function$
declare
  v_event_id uuid;
  v_event_config jsonb := coalesce(p_payload->'eventConfig', '{}'::jsonb);
  v_summary jsonb := coalesce(p_payload->'summary', '{}'::jsonb);
  v_warnings jsonb := coalesce(p_payload->'warnings', '[]'::jsonb);
  v_external_id text := nullif(coalesce(v_event_config->>'id', p_payload->>'externalId'), '');
  v_block jsonb;
  v_assumption jsonb;
  v_ordinal integer;
begin
  if v_external_id is null then
    v_external_id := gen_random_uuid()::text;
    v_event_config := v_event_config || jsonb_build_object('id', v_external_id);
  end if;

  if nullif(p_payload->>'dbId', '') is not null then
    v_event_id := (p_payload->>'dbId')::uuid;
  else
    select id into v_event_id
    from tareas.timeline_events
    where external_id = v_external_id
    limit 1;
  end if;

  if v_event_id is null then
    insert into tareas.timeline_events (
      external_id, name, event_date, pax, open_doors_time, end_time, event_config, summary, warnings
    )
    values (
      v_external_id,
      coalesce(nullif(v_event_config->>'name', ''), 'Evento sin nombre'),
      coalesce(nullif(v_event_config->>'date', ''), current_date::text)::date,
      greatest(coalesce(nullif(v_event_config->>'pax', '')::integer, 1), 1),
      coalesce(nullif(v_event_config->>'openDoorsTime', ''), '00:00'),
      nullif(v_event_config->>'endTime', ''),
      v_event_config,
      v_summary,
      v_warnings
    )
    returning id into v_event_id;
  else
    update tareas.timeline_events
    set
      external_id = v_external_id,
      name = coalesce(nullif(v_event_config->>'name', ''), 'Evento sin nombre'),
      event_date = coalesce(nullif(v_event_config->>'date', ''), current_date::text)::date,
      pax = greatest(coalesce(nullif(v_event_config->>'pax', '')::integer, 1), 1),
      open_doors_time = coalesce(nullif(v_event_config->>'openDoorsTime', ''), '00:00'),
      end_time = nullif(v_event_config->>'endTime', ''),
      event_config = v_event_config,
      summary = v_summary,
      warnings = v_warnings
    where id = v_event_id;
  end if;

  delete from tareas.timeline_blocks where event_id = v_event_id;
  delete from tareas.timeline_assumptions where event_id = v_event_id;

  for v_block, v_ordinal in
    select value, ordinality::integer
    from jsonb_array_elements(coalesce(p_payload->'blocks', '[]'::jsonb)) with ordinality
  loop
    insert into tareas.timeline_blocks (
      event_id, block_key, block_id, parent_block_id, reference, label, module, phase, team,
      starts_at, ends_at, duration_minutes, notes, assumptions, overlaps_with, color_key,
      required_staff_min, staffing_rule, sort_order, raw
    )
    values (
      v_event_id,
      coalesce(nullif(v_block->>'id', ''), 'block-' || v_ordinal),
      nullif(v_block->>'blockId', ''),
      nullif(v_block->>'parentBlockId', ''),
      nullif(v_block->>'reference', ''),
      coalesce(nullif(v_block->>'label', ''), 'Bloque'),
      coalesce(nullif(v_block->>'module', ''), 'general'),
      coalesce(nullif(v_block->>'phase', ''), 'servicio'),
      nullif(v_block->>'team', ''),
      coalesce(nullif(v_block->>'start', ''), '00:00'),
      coalesce(nullif(v_block->>'end', ''), '00:00'),
      greatest(coalesce(nullif(v_block->>'durationMinutes', '')::integer, 0), 0),
      nullif(v_block->>'notes', ''),
      coalesce(v_block->'assumptions', '[]'::jsonb),
      coalesce(v_block->'overlapsWith', '[]'::jsonb),
      nullif(v_block->>'colorKey', ''),
      nullif(v_block->>'requiredStaffMin', '')::integer,
      coalesce(nullif(v_block->>'requiredStaffRule', ''), nullif(v_block->>'staffingRule', '')),
      v_ordinal,
      v_block
    );
  end loop;

  for v_assumption, v_ordinal in
    select value, ordinality::integer
    from jsonb_array_elements(coalesce(p_payload->'assumptions', '[]'::jsonb)) with ordinality
  loop
    insert into tareas.timeline_assumptions (
      event_id, assumption_key, label, detail, reviewed, source, sort_order, raw
    )
    values (
      v_event_id,
      coalesce(nullif(v_assumption->>'id', ''), 'assumption-' || v_ordinal),
      coalesce(nullif(v_assumption->>'label', ''), 'Supuesto'),
      coalesce(nullif(v_assumption->>'detail', ''), v_assumption->>'label', 'Sin detalle'),
      coalesce((v_assumption->>'reviewed')::boolean, false),
      nullif(v_assumption->>'source', ''),
      v_ordinal,
      v_assumption
    );
  end loop;

  return public.get_timeline_event(v_event_id);
end;
$function$;

create or replace function public.materialize_event_tasks_from_payload(
  p_event_id uuid,
  p_tasks jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = 'tareas', 'public'
as $function$
declare
  v_count integer := 0;
  v_cancelled integer := 0;
begin
  if p_event_id is null then
    raise exception 'event_id es obligatorio';
  end if;

  with incoming as (
    select
      p_event_id as event_id,
      coalesce(nullif(task_row.block_key, ''), 'block-' || task_row.ordinality::text) as block_key,
      nullif(task_row.block_id, '') as block_id,
      coalesce(nullif(task_row.task_code, ''), 'task-' || task_row.ordinality::text) as catalog_task_code,
      task_row.task_sort,
      coalesce(nullif(task_row.task_name, ''), 'Tarea') as task_name,
      nullif(task_row.details, '') as details,
      coalesce(nullif(task_row.start_time, ''), '00:00') as start_time,
      coalesce(nullif(task_row.end_time, ''), coalesce(nullif(task_row.start_time, ''), '00:00')) as end_time,
      nullif(task_row.responsable, '') as responsable,
      nullif(task_row.dependency_code, '') as dependency_code,
      greatest(coalesce(task_row.required_level, 0), 0) as required_level,
      task_row.required_staff_min,
      nullif(task_row.staffing_rule, '') as staffing_rule,
      nullif(task_row.num_personas, '') as num_personas,
      task_row.ordinality::integer as sort_order,
      to_jsonb(task_row) - 'ordinality' as raw
    from jsonb_to_recordset(coalesce(p_tasks, '[]'::jsonb)) with ordinality as task_row(
      block_key text,
      block_id text,
      task_code text,
      task_sort integer,
      task_name text,
      details text,
      start_time text,
      end_time text,
      responsable text,
      dependency_code text,
      required_level integer,
      required_staff_min integer,
      staffing_rule text,
      num_personas text,
      ordinality bigint
    )
  ), upserted as (
    insert into tareas.event_task_instances (
      event_id, block_key, block_id, catalog_task_code, task_sort, task_name, details,
      start_time, end_time, responsable, dependency_code, required_level, required_staff_min,
      staffing_rule, num_personas, sort_order, raw
    )
    select
      event_id, block_key, block_id, catalog_task_code, task_sort, task_name, details,
      start_time, end_time, responsable, dependency_code, required_level, required_staff_min,
      staffing_rule, num_personas, sort_order, raw
    from incoming
    on conflict (event_id, block_key, catalog_task_code)
    do update set
      block_id = excluded.block_id,
      task_sort = excluded.task_sort,
      task_name = excluded.task_name,
      details = excluded.details,
      start_time = excluded.start_time,
      end_time = excluded.end_time,
      responsable = excluded.responsable,
      dependency_code = excluded.dependency_code,
      required_level = excluded.required_level,
      required_staff_min = excluded.required_staff_min,
      staffing_rule = excluded.staffing_rule,
      num_personas = excluded.num_personas,
      sort_order = excluded.sort_order,
      raw = excluded.raw,
      status = case when tareas.event_task_instances.status = 'cancelled' then 'pending' else tareas.event_task_instances.status end,
      updated_at = timezone('utc', now())
    returning 1
  )
  select count(*) into v_count from upserted;

  with incoming_keys as (
    select
      coalesce(nullif(task_row.block_key, ''), 'block-' || task_row.ordinality::text) as block_key,
      coalesce(nullif(task_row.task_code, ''), 'task-' || task_row.ordinality::text) as catalog_task_code
    from jsonb_to_recordset(coalesce(p_tasks, '[]'::jsonb)) with ordinality as task_row(
      block_key text,
      task_code text,
      ordinality bigint
    )
  ), cancelled as (
    update tareas.event_task_instances ti
    set
      status = 'cancelled',
      updated_at = timezone('utc', now())
    where ti.event_id = p_event_id
      and ti.status <> 'completed'
      and not exists (
        select 1
        from incoming_keys ik
        where ik.block_key = ti.block_key
          and ik.catalog_task_code = ti.catalog_task_code
      )
    returning 1
  )
  select count(*) into v_cancelled from cancelled;

  return jsonb_build_object(
    'eventId', p_event_id,
    'taskCount', v_count,
    'cancelledTaskCount', v_cancelled,
    'taskSource', 'mobile_payload'
  );
end;
$function$;

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
        'requiredStaffMin', ti.required_staff_min,
        'staffingRule', ti.staffing_rule,
        'numPersonas', ti.num_personas,
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
        'requiredStaffMin', ti.required_staff_min,
        'staffingRule', ti.staffing_rule,
        'numPersonas', ti.num_personas,
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
    and ti.status <> 'cancelled'
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
  v_previous_status text;
begin
  select * into v_task
  from tareas.event_task_instances
  where id = p_task_instance_id
  for update;

  if not found then
    raise exception 'No existe la tarea %', p_task_instance_id;
  end if;

  select * into v_staff
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

  v_previous_status := v_task.status;

  update tareas.event_task_instances
  set
    status = 'in_progress',
    started_at = coalesce(started_at, timezone('utc', now())),
    updated_at = timezone('utc', now())
  where id = p_task_instance_id
  returning * into v_task;

  insert into tareas.task_execution_logs (
    event_id, task_instance_id, block_key, employee_id, action, source,
    previous_status, new_status, started_at, metadata
  )
  values (
    v_task.event_id, v_task.id, v_task.block_key, p_employee_id, 'start', 'worker',
    v_previous_status, v_task.status, v_task.started_at, jsonb_build_object('taskName', v_task.task_name)
  );

  return jsonb_build_object('id', v_task.id, 'status', v_task.status, 'startedAt', v_task.started_at);
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
  v_previous_status text;
begin
  select * into v_task
  from tareas.event_task_instances
  where id = p_task_instance_id
  for update;

  if not found then
    raise exception 'No existe la tarea %', p_task_instance_id;
  end if;

  select * into v_staff
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

  v_previous_status := v_task.status;

  update tareas.event_task_instances
  set
    status = 'completed',
    started_at = coalesce(started_at, timezone('utc', now())),
    completed_at = timezone('utc', now()),
    completed_by_employee_id = p_employee_id,
    updated_at = timezone('utc', now())
  where id = p_task_instance_id
  returning * into v_task;

  insert into tareas.task_execution_logs (
    event_id, task_instance_id, block_key, employee_id, action, source,
    previous_status, new_status, started_at, completed_at, duration_seconds, metadata
  )
  values (
    v_task.event_id, v_task.id, v_task.block_key, p_employee_id, 'complete', 'worker',
    v_previous_status, v_task.status, v_task.started_at, v_task.completed_at,
    greatest(0, extract(epoch from (v_task.completed_at - v_task.started_at))::integer),
    jsonb_build_object('taskName', v_task.task_name)
  );

  return jsonb_build_object(
    'id', v_task.id,
    'status', v_task.status,
    'startedAt', v_task.started_at,
    'completedAt', v_task.completed_at,
    'completedByEmployeeId', v_task.completed_by_employee_id
  );
end;
$function$;

create or replace function public.complete_worker_block(
  p_event_id uuid,
  p_block_key text,
  p_employee_id text
)
returns jsonb
language plpgsql
security definer
set search_path = 'tareas', 'public'
as $function$
declare
  v_staff tareas.event_staff_assignments%rowtype;
  v_bulk_operation_id uuid := gen_random_uuid();
  v_completed integer := 0;
begin
  select * into v_staff
  from tareas.event_staff_assignments
  where event_id = p_event_id
    and employee_id = p_employee_id
  limit 1;

  if not found then
    raise exception 'El empleado no esta asignado al evento';
  end if;

  insert into tareas.task_execution_logs (
    event_id, block_key, employee_id, action, source, bulk_operation_id, metadata
  )
  values (
    p_event_id, p_block_key, p_employee_id, 'complete_block', 'worker', v_bulk_operation_id,
    jsonb_build_object('mode', 'worker_assigned_block')
  );

  with target_tasks as (
    select ti.*, ti.status as previous_status
    from tareas.event_task_instances ti
    where ti.event_id = p_event_id
      and ti.block_key = p_block_key
      and ti.status in ('pending', 'in_progress')
      and v_staff.skill_level >= ti.required_level
      and (
        exists (
          select 1 from tareas.event_block_assignments ba
          where ba.event_id = ti.event_id
            and ba.block_key = ti.block_key
            and ba.staff_assignment_id = v_staff.id
        )
        or exists (
          select 1 from tareas.event_task_assignments ta
          where ta.event_task_instance_id = ti.id
            and ta.staff_assignment_id = v_staff.id
        )
      )
    for update
  ), updated as (
    update tareas.event_task_instances ti
    set
      status = 'completed',
      started_at = coalesce(ti.started_at, timezone('utc', now())),
      completed_at = timezone('utc', now()),
      completed_by_employee_id = p_employee_id,
      updated_at = timezone('utc', now())
    from target_tasks tt
    where ti.id = tt.id
    returning ti.*, tt.previous_status
  ), logged as (
    insert into tareas.task_execution_logs (
      event_id, task_instance_id, block_key, employee_id, action, source,
      previous_status, new_status, started_at, completed_at, duration_seconds,
      bulk_operation_id, metadata
    )
    select
      event_id, id, block_key, p_employee_id, 'complete', 'worker',
      previous_status, status, started_at, completed_at,
      greatest(0, extract(epoch from (completed_at - started_at))::integer),
      v_bulk_operation_id,
      jsonb_build_object('taskName', task_name, 'bulk', true)
    from updated
    returning 1
  )
  select count(*) into v_completed from logged;

  return jsonb_build_object(
    'eventId', p_event_id,
    'blockKey', p_block_key,
    'completedTaskCount', v_completed,
    'bulkOperationId', v_bulk_operation_id
  );
end;
$function$;

create or replace function public.complete_event_block(
  p_event_id uuid,
  p_block_key text,
  p_employee_id text default null,
  p_source text default 'metre'
)
returns jsonb
language plpgsql
security definer
set search_path = 'tareas', 'public'
as $function$
declare
  v_bulk_operation_id uuid := gen_random_uuid();
  v_completed integer := 0;
begin
  insert into tareas.task_execution_logs (
    event_id, block_key, employee_id, action, source, bulk_operation_id, metadata
  )
  values (
    p_event_id, p_block_key, p_employee_id, 'complete_block', coalesce(nullif(p_source, ''), 'metre'),
    v_bulk_operation_id, jsonb_build_object('mode', 'event_block')
  );

  with target_tasks as (
    select ti.*, ti.status as previous_status
    from tareas.event_task_instances ti
    where ti.event_id = p_event_id
      and ti.block_key = p_block_key
      and ti.status in ('pending', 'in_progress')
    for update
  ), updated as (
    update tareas.event_task_instances ti
    set
      status = 'completed',
      started_at = coalesce(ti.started_at, timezone('utc', now())),
      completed_at = timezone('utc', now()),
      completed_by_employee_id = p_employee_id,
      updated_at = timezone('utc', now())
    from target_tasks tt
    where ti.id = tt.id
    returning ti.*, tt.previous_status
  ), logged as (
    insert into tareas.task_execution_logs (
      event_id, task_instance_id, block_key, employee_id, action, source,
      previous_status, new_status, started_at, completed_at, duration_seconds,
      bulk_operation_id, metadata
    )
    select
      event_id, id, block_key, p_employee_id, 'complete', coalesce(nullif(p_source, ''), 'metre'),
      previous_status, status, started_at, completed_at,
      greatest(0, extract(epoch from (completed_at - started_at))::integer),
      v_bulk_operation_id,
      jsonb_build_object('taskName', task_name, 'bulk', true)
    from updated
    returning 1
  )
  select count(*) into v_completed from logged;

  return jsonb_build_object(
    'eventId', p_event_id,
    'blockKey', p_block_key,
    'completedTaskCount', v_completed,
    'bulkOperationId', v_bulk_operation_id
  );
end;
$function$;

create or replace function public.shift_event_timeline_from_payload(
  p_event_id uuid,
  p_payload jsonb,
  p_tasks jsonb,
  p_minutes integer,
  p_employee_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'tareas', 'public'
as $function$
declare
  v_saved jsonb;
  v_materialized jsonb;
  v_bulk_operation_id uuid := gen_random_uuid();
begin
  if p_event_id is null then
    raise exception 'event_id es obligatorio';
  end if;

  v_saved := public.save_timeline_snapshot(p_payload || jsonb_build_object('dbId', p_event_id));
  v_materialized := public.materialize_event_tasks_from_payload(p_event_id, p_tasks);

  insert into tareas.task_execution_logs (
    event_id, employee_id, action, source, bulk_operation_id, metadata
  )
  values (
    p_event_id, p_employee_id, 'timeline_shift', 'metre', v_bulk_operation_id,
    jsonb_build_object('minutes', p_minutes, 'materialized', v_materialized)
  );

  return public.get_timeline_event(p_event_id);
end;
$function$;

create or replace function public.list_task_execution_logs(p_event_id uuid)
returns jsonb
language sql
security definer
set search_path = 'tareas', 'public'
as $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', l.id,
        'eventId', l.event_id,
        'taskInstanceId', l.task_instance_id,
        'blockKey', l.block_key,
        'employeeId', l.employee_id,
        'action', l.action,
        'source', l.source,
        'previousStatus', l.previous_status,
        'newStatus', l.new_status,
        'startedAt', l.started_at,
        'completedAt', l.completed_at,
        'durationSeconds', l.duration_seconds,
        'bulkOperationId', l.bulk_operation_id,
        'metadata', l.metadata,
        'createdAt', l.created_at
      )
      order by l.created_at desc
    ),
    '[]'::jsonb
  )
  from tareas.task_execution_logs l
  where l.event_id = p_event_id;
$function$;

grant execute on function public.save_timeline_snapshot(jsonb) to anon, authenticated;
grant execute on function public.materialize_event_tasks_from_payload(uuid, jsonb) to anon, authenticated;
grant execute on function public.list_event_tasks(uuid) to anon, authenticated;
grant execute on function public.list_worker_tasks(text, date, date, boolean) to anon, authenticated;
grant execute on function public.start_worker_task(uuid, text) to anon, authenticated;
grant execute on function public.complete_worker_task(uuid, text) to anon, authenticated;
grant execute on function public.complete_worker_block(uuid, text, text) to anon, authenticated;
grant execute on function public.complete_event_block(uuid, text, text, text) to anon, authenticated;
grant execute on function public.shift_event_timeline_from_payload(uuid, jsonb, jsonb, integer, text) to anon, authenticated;
grant execute on function public.list_task_execution_logs(uuid) to anon, authenticated;

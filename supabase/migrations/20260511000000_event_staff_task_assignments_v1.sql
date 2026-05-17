create schema if not exists tareas;
create extension if not exists pgcrypto with schema extensions;

create table if not exists tareas.timeline_events (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  name text not null,
  event_date date not null,
  pax integer not null check (pax > 0),
  open_doors_time text not null,
  end_time text,
  event_config jsonb not null,
  summary jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists tareas.timeline_blocks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references tareas.timeline_events (id) on delete cascade,
  block_key text not null,
  block_id text,
  parent_block_id text,
  reference text,
  label text not null,
  module text not null,
  phase text not null,
  team text,
  starts_at text not null,
  ends_at text not null,
  duration_minutes integer not null check (duration_minutes >= 0),
  notes text,
  assumptions jsonb not null default '[]'::jsonb,
  overlaps_with jsonb not null default '[]'::jsonb,
  color_key text,
  sort_order integer not null default 0,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint timeline_blocks_event_key_unique unique (event_id, block_key)
);

alter table tareas.timeline_blocks add column if not exists block_id text;

create table if not exists tareas.timeline_assumptions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references tareas.timeline_events (id) on delete cascade,
  assumption_key text not null,
  label text not null,
  detail text not null,
  reviewed boolean not null default false,
  source text,
  sort_order integer not null default 0,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint timeline_assumptions_event_key_unique unique (event_id, assumption_key)
);

create table if not exists tareas.event_staff_assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references tareas.timeline_events (id) on delete cascade,
  employee_id text not null,
  full_name text not null,
  roles text[] not null default '{}',
  shift_name text not null default 'T1',
  shift_start text not null,
  shift_end text not null,
  skill_level integer not null default 0,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint event_staff_assignments_event_employee_unique unique (event_id, employee_id)
);

create table if not exists tareas.event_task_instances (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references tareas.timeline_events (id) on delete cascade,
  block_key text not null,
  block_id text,
  catalog_task_code text not null,
  task_sort integer,
  task_name text not null,
  details text,
  start_time text not null,
  end_time text not null,
  responsable text,
  dependency_code text,
  required_level integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'completed', 'cancelled')),
  completed_at timestamptz,
  completed_by_employee_id text,
  sort_order integer not null default 0,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint event_task_instances_unique unique (event_id, block_key, catalog_task_code)
);

create table if not exists tareas.event_block_assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references tareas.timeline_events (id) on delete cascade,
  block_key text not null,
  staff_assignment_id uuid not null references tareas.event_staff_assignments (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  constraint event_block_assignments_unique unique (event_id, block_key, staff_assignment_id)
);

create table if not exists tareas.event_task_assignments (
  id uuid primary key default gen_random_uuid(),
  event_task_instance_id uuid not null references tareas.event_task_instances (id) on delete cascade,
  staff_assignment_id uuid not null references tareas.event_staff_assignments (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  constraint event_task_assignments_unique unique (event_task_instance_id, staff_assignment_id)
);

create index if not exists timeline_blocks_event_sort_idx on tareas.timeline_blocks (event_id, sort_order);
create index if not exists timeline_assumptions_event_sort_idx on tareas.timeline_assumptions (event_id, sort_order);
create index if not exists event_staff_assignments_event_idx on tareas.event_staff_assignments (event_id, full_name);
create index if not exists event_task_instances_worker_idx on tareas.event_task_instances (event_id, status, start_time);
create index if not exists event_block_assignments_block_idx on tareas.event_block_assignments (event_id, block_key);
create index if not exists event_task_assignments_task_idx on tareas.event_task_assignments (event_task_instance_id);

create or replace function tareas.touch_updated_at()
returns trigger
language plpgsql
as $function$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$function$;

drop trigger if exists timeline_events_touch_updated_at on tareas.timeline_events;
create trigger timeline_events_touch_updated_at
before update on tareas.timeline_events
for each row execute function tareas.touch_updated_at();

drop trigger if exists timeline_assumptions_touch_updated_at on tareas.timeline_assumptions;
create trigger timeline_assumptions_touch_updated_at
before update on tareas.timeline_assumptions
for each row execute function tareas.touch_updated_at();

drop trigger if exists event_staff_assignments_touch_updated_at on tareas.event_staff_assignments;
create trigger event_staff_assignments_touch_updated_at
before update on tareas.event_staff_assignments
for each row execute function tareas.touch_updated_at();

drop trigger if exists event_task_instances_touch_updated_at on tareas.event_task_instances;
create trigger event_task_instances_touch_updated_at
before update on tareas.event_task_instances
for each row execute function tareas.touch_updated_at();

create or replace function tareas.hhmm_to_minutes(p_time text)
returns integer
language sql
immutable
as $function$
  select case
    when p_time ~ '^[0-2][0-9]:[0-5][0-9]$'
    then split_part(p_time, ':', 1)::integer * 60 + split_part(p_time, ':', 2)::integer
    else null
  end;
$function$;

create or replace function tareas.event_minute(p_time text, p_anchor text)
returns integer
language sql
immutable
as $function$
  select case
    when tareas.hhmm_to_minutes(p_time) is null or tareas.hhmm_to_minutes(p_anchor) is null then null
    when tareas.hhmm_to_minutes(p_time) < tareas.hhmm_to_minutes(p_anchor) - 180
    then tareas.hhmm_to_minutes(p_time) + 1440
    else tareas.hhmm_to_minutes(p_time)
  end;
$function$;

create or replace function public.list_timeline_events()
returns jsonb
language sql
security definer
set search_path = 'tareas', 'public'
as $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'dbId', e.id,
        'externalId', e.external_id,
        'name', e.name,
        'date', e.event_date,
        'pax', e.pax,
        'openDoorsTime', e.open_doors_time,
        'endTime', e.end_time,
        'summary', e.summary,
        'warnings', e.warnings,
        'updatedAt', e.updated_at,
        'createdAt', e.created_at
      )
      order by e.event_date desc, e.updated_at desc
    ),
    '[]'::jsonb
  )
  from tareas.timeline_events e;
$function$;

create or replace function public.get_timeline_event(p_event_id uuid)
returns jsonb
language sql
security definer
set search_path = 'tareas', 'public'
as $function$
  select jsonb_build_object(
    'dbId', e.id,
    'externalId', e.external_id,
    'eventConfig', e.event_config,
    'summary', e.summary,
    'warnings', e.warnings,
    'blocks', coalesce((
      select jsonb_agg(b.raw order by b.sort_order, b.starts_at, b.label)
      from tareas.timeline_blocks b
      where b.event_id = e.id
    ), '[]'::jsonb),
    'assumptions', coalesce((
      select jsonb_agg(
        a.raw
        || jsonb_build_object(
          'dbId', a.id,
          'id', a.assumption_key,
          'reviewed', a.reviewed
        )
        order by a.sort_order, a.label
      )
      from tareas.timeline_assumptions a
      where a.event_id = e.id
    ), '[]'::jsonb),
    'updatedAt', e.updated_at,
    'createdAt', e.created_at
  )
  from tareas.timeline_events e
  where e.id = p_event_id;
$function$;

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

  delete from tareas.event_task_instances where event_id = v_event_id;
  delete from tareas.timeline_blocks where event_id = v_event_id;
  delete from tareas.timeline_assumptions where event_id = v_event_id;

  for v_block, v_ordinal in
    select value, ordinality::integer
    from jsonb_array_elements(coalesce(p_payload->'blocks', '[]'::jsonb)) with ordinality
  loop
    insert into tareas.timeline_blocks (
      event_id, block_key, block_id, parent_block_id, reference, label, module, phase, team,
      starts_at, ends_at, duration_minutes, notes, assumptions, overlaps_with, color_key, sort_order, raw
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

create or replace function public.delete_timeline_event(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = 'tareas', 'public'
as $function$
begin
  delete from tareas.timeline_events where id = p_event_id;
  return jsonb_build_object('deleted', true, 'dbId', p_event_id);
end;
$function$;

create or replace function public.mark_timeline_assumption_reviewed(
  p_event_id uuid,
  p_assumption_key text,
  p_reviewed boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = 'tareas', 'public'
as $function$
begin
  update tareas.timeline_assumptions
  set
    reviewed = coalesce(p_reviewed, true),
    raw = raw || jsonb_build_object('reviewed', coalesce(p_reviewed, true))
  where event_id = p_event_id
    and assumption_key = p_assumption_key;

  return public.get_timeline_event(p_event_id);
end;
$function$;

create or replace function public.materialize_event_tasks(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = 'tareas', 'public'
as $function$
declare
  v_count integer;
  v_task_source text;
begin
  if to_regclass('tareas.event_tasks') is not null then
    v_task_source := 'tareas.event_tasks';
  elsif to_regclass('public.event_catalog_tasks') is not null then
    v_task_source := 'public.event_catalog_tasks';
  else
    raise exception 'No existe catalogo de tareas en tareas.event_tasks ni public.event_catalog_tasks';
  end if;

  delete from tareas.event_task_instances where event_id = p_event_id;

  execute format($sql$
    insert into tareas.event_task_instances (
      event_id, block_key, block_id, catalog_task_code, task_sort, task_name, details,
      start_time, end_time, responsable, dependency_code, required_level, sort_order, raw
    )
    select
      b.event_id,
      b.block_key,
      t.block_id,
      t.task_code,
      t.task_sort,
      t.task_name,
      t.details,
      b.starts_at,
      b.ends_at,
      t.responsable,
      t.dependency_code,
      0,
      b.sort_order * 10000 + coalesce(t.task_sort, 0),
      jsonb_build_object(
        'taskCode', t.task_code,
        'blockKey', b.block_key,
        'blockId', t.block_id,
        'blockLabel', b.label,
        'taskName', t.task_name,
        'details', t.details,
        'startTime', b.starts_at,
        'endTime', b.ends_at,
        'requiredLevel', 0,
        'responsable', t.responsable,
        'dependencyCode', t.dependency_code
      )
    from tareas.timeline_blocks b
    join %s t on t.block_id = b.block_id
    where b.event_id = $1
      and upper(coalesce(t.responsable, '')) in ('CAMAREROS', 'TODOS')
    on conflict (event_id, block_key, catalog_task_code)
    do update set
      task_sort = excluded.task_sort,
      task_name = excluded.task_name,
      details = excluded.details,
      start_time = excluded.start_time,
      end_time = excluded.end_time,
      responsable = excluded.responsable,
      dependency_code = excluded.dependency_code,
      sort_order = excluded.sort_order,
      raw = excluded.raw,
      updated_at = timezone('utc', now())
  $sql$, v_task_source)
  using p_event_id;

  get diagnostics v_count = row_count;

  return jsonb_build_object('eventId', p_event_id, 'taskCount', v_count);
end;
$function$;

create or replace function public.list_event_staff(p_event_id uuid)
returns jsonb
language sql
security definer
set search_path = 'tareas', 'public'
as $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'eventId', s.event_id,
        'employeeId', s.employee_id,
        'fullName', s.full_name,
        'roles', s.roles,
        'shiftName', s.shift_name,
        'shiftStart', s.shift_start,
        'shiftEnd', s.shift_end,
        'skillLevel', s.skill_level,
        'createdAt', s.created_at,
        'updatedAt', s.updated_at
      )
      order by s.shift_name, s.full_name
    ),
    '[]'::jsonb
  )
  from tareas.event_staff_assignments s
  where s.event_id = p_event_id;
$function$;

create or replace function public.upsert_event_staff(
  p_event_id uuid,
  p_employee jsonb,
  p_shift jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = 'tareas', 'public'
as $function$
declare
  v_staff tareas.event_staff_assignments%rowtype;
  v_roles text[] := coalesce(
    array(select jsonb_array_elements_text(coalesce(p_employee->'roles', '[]'::jsonb))),
    '{}'
  );
begin
  insert into tareas.event_staff_assignments (
    event_id, employee_id, full_name, roles, shift_name, shift_start, shift_end, skill_level, raw
  )
  values (
    p_event_id,
    coalesce(nullif(p_employee->>'employeeId', ''), nullif(p_employee->>'id', '')),
    coalesce(nullif(p_employee->>'fullName', ''), 'Empleado'),
    v_roles,
    coalesce(nullif(p_shift->>'shiftName', ''), 'T1'),
    coalesce(nullif(p_shift->>'shiftStart', ''), '00:00'),
    coalesce(nullif(p_shift->>'shiftEnd', ''), '08:00'),
    greatest(coalesce(nullif(p_employee->>'skillLevel', '')::integer, 0), 0),
    jsonb_build_object('employee', p_employee, 'shift', p_shift)
  )
  on conflict (event_id, employee_id)
  do update set
    full_name = excluded.full_name,
    roles = excluded.roles,
    shift_name = excluded.shift_name,
    shift_start = excluded.shift_start,
    shift_end = excluded.shift_end,
    skill_level = excluded.skill_level,
    raw = excluded.raw,
    updated_at = timezone('utc', now())
  returning * into v_staff;

  return jsonb_build_object(
    'id', v_staff.id,
    'eventId', v_staff.event_id,
    'employeeId', v_staff.employee_id,
    'fullName', v_staff.full_name,
    'roles', v_staff.roles,
    'shiftName', v_staff.shift_name,
    'shiftStart', v_staff.shift_start,
    'shiftEnd', v_staff.shift_end,
    'skillLevel', v_staff.skill_level
  );
end;
$function$;

create or replace function public.assign_event_block(
  p_event_id uuid,
  p_block_key text,
  p_staff_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = 'tareas', 'public'
as $function$
declare
  v_id uuid;
begin
  insert into tareas.event_block_assignments (event_id, block_key, staff_assignment_id)
  values (p_event_id, p_block_key, p_staff_id)
  on conflict (event_id, block_key, staff_assignment_id) do nothing
  returning id into v_id;

  return jsonb_build_object('assigned', true, 'id', v_id, 'eventId', p_event_id, 'blockKey', p_block_key);
end;
$function$;

create or replace function public.assign_event_task(
  p_task_instance_id uuid,
  p_staff_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = 'tareas', 'public'
as $function$
declare
  v_id uuid;
begin
  insert into tareas.event_task_assignments (event_task_instance_id, staff_assignment_id)
  values (p_task_instance_id, p_staff_id)
  on conflict (event_task_instance_id, staff_assignment_id) do nothing
  returning id into v_id;

  return jsonb_build_object('assigned', true, 'id', v_id, 'taskInstanceId', p_task_instance_id);
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
  where (p_include_completed or ti.status = 'pending')
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

  update tareas.event_task_instances
  set
    status = 'completed',
    completed_at = timezone('utc', now()),
    completed_by_employee_id = p_employee_id,
    updated_at = timezone('utc', now())
  where id = p_task_instance_id
  returning * into v_task;

  return jsonb_build_object(
    'id', v_task.id,
    'status', v_task.status,
    'completedAt', v_task.completed_at,
    'completedByEmployeeId', v_task.completed_by_employee_id
  );
end;
$function$;

revoke all on all tables in schema tareas from anon, authenticated;
grant usage on schema tareas to anon, authenticated;

do $$
begin
  if to_regclass('tareas.event_blocks') is not null then
    execute $view$
      create or replace view public.event_catalog_blocks as
      select
        block_id,
        block_sort,
        sort_order,
        macrofase,
        block_name,
        "references",
        moments,
        block_type,
        turno_sugerido,
        rol_principal,
        min_personas_bloque,
        staff_min,
        staff_max,
        regla_dotacion,
        continuidad_dependencia,
        hito_relevo,
        num_tareas_camareros,
        rango_codigos_camareros,
        codigos_camareros_lista,
        task_codes,
        codigos_relacionados_otros_roles,
        notas_operativas,
        duracion_referencia_min,
        observacion_acta,
        over_200_adjustment,
        over_200_waiter_codes,
        over_200_other_role_codes,
        over_200_notes,
        over_200_duration_reference_min,
        over_200_observacion_acta,
        over_200_non_task_adjustments
      from tareas.event_blocks
    $view$;
  end if;

  if to_regclass('tareas.event_tasks') is not null then
    execute $view$
      create or replace view public.event_catalog_tasks as
      select
        task_code,
        block_id,
        task_sort,
        referencia,
        momento,
        responsable,
        task_name,
        num_personas,
        staff_min,
        staff_max,
        dependency_code,
        details,
        time_min_min,
        time_max_min,
        observaciones,
        macrofase,
        tipo_bloque,
        turno,
        over_200_affected,
        over_200_scope,
        over_200_adjustment,
        over_200_notes
      from tareas.event_tasks
    $view$;
  end if;
end $$;

do $$
begin
  if to_regclass('public.event_catalog_blocks') is not null then
    grant select on public.event_catalog_blocks to anon, authenticated;
  end if;

  if to_regclass('public.event_catalog_tasks') is not null then
    grant select on public.event_catalog_tasks to anon, authenticated;
  end if;

  if to_regclass('tareas.event_blocks') is not null then
    grant select on tareas.event_blocks to anon, authenticated;
  end if;

  if to_regclass('tareas.event_tasks') is not null then
    grant select on tareas.event_tasks to anon, authenticated;
  end if;
end $$;

grant execute on function public.list_timeline_events() to anon, authenticated;
grant execute on function public.get_timeline_event(uuid) to anon, authenticated;
grant execute on function public.save_timeline_snapshot(jsonb) to anon, authenticated;
grant execute on function public.delete_timeline_event(uuid) to anon, authenticated;
grant execute on function public.mark_timeline_assumption_reviewed(uuid, text, boolean) to anon, authenticated;
grant execute on function public.materialize_event_tasks(uuid) to anon, authenticated;
grant execute on function public.list_event_staff(uuid) to anon, authenticated;
grant execute on function public.upsert_event_staff(uuid, jsonb, jsonb) to anon, authenticated;
grant execute on function public.assign_event_block(uuid, text, uuid) to anon, authenticated;
grant execute on function public.assign_event_task(uuid, uuid) to anon, authenticated;
grant execute on function public.list_event_tasks(uuid) to anon, authenticated;
grant execute on function public.list_worker_tasks(text, date, date, boolean) to anon, authenticated;
grant execute on function public.complete_worker_task(uuid, text) to anon, authenticated;

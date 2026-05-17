-- Run this in the main app Supabase project.
-- It creates no tables. It materializes event tasks from the mobile app payload,
-- so task creation does not depend on the server-side catalog join.

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
begin
  if p_event_id is null then
    raise exception 'event_id es obligatorio';
  end if;

  delete from tareas.event_task_instances where event_id = p_event_id;

  insert into tareas.event_task_instances (
    event_id,
    block_key,
    block_id,
    catalog_task_code,
    task_sort,
    task_name,
    details,
    start_time,
    end_time,
    responsable,
    dependency_code,
    required_level,
    sort_order,
    raw
  )
  select
    p_event_id,
    coalesce(nullif(task_row.block_key, ''), 'block-' || task_row.ordinality::text),
    nullif(task_row.block_id, ''),
    coalesce(nullif(task_row.task_code, ''), 'task-' || task_row.ordinality::text),
    task_row.task_sort,
    coalesce(nullif(task_row.task_name, ''), 'Tarea'),
    nullif(task_row.details, ''),
    coalesce(nullif(task_row.start_time, ''), '00:00'),
    coalesce(nullif(task_row.end_time, ''), coalesce(nullif(task_row.start_time, ''), '00:00')),
    nullif(task_row.responsable, ''),
    nullif(task_row.dependency_code, ''),
    greatest(coalesce(task_row.required_level, 0), 0),
    task_row.ordinality::integer,
    to_jsonb(task_row) - 'ordinality'
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
    ordinality bigint
  )
  on conflict (event_id, block_key, catalog_task_code)
  do update set
    task_sort = excluded.task_sort,
    task_name = excluded.task_name,
    details = excluded.details,
    start_time = excluded.start_time,
    end_time = excluded.end_time,
    responsable = excluded.responsable,
    dependency_code = excluded.dependency_code,
    required_level = excluded.required_level,
    sort_order = excluded.sort_order,
    raw = excluded.raw,
    updated_at = timezone('utc', now());

  get diagnostics v_count = row_count;

  return jsonb_build_object(
    'eventId', p_event_id,
    'taskCount', v_count,
    'taskSource', 'mobile_payload'
  );
end;
$function$;

grant execute on function public.materialize_event_tasks_from_payload(uuid, jsonb) to anon, authenticated;

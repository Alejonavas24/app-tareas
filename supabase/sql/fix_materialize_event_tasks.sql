-- Run this in the main app Supabase project.
-- It replaces only the task materialization RPC and does not create tables.

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

  return jsonb_build_object('eventId', p_event_id, 'taskCount', v_count, 'taskSource', v_task_source);
end;
$function$;

grant execute on function public.materialize_event_tasks(uuid) to anon, authenticated;

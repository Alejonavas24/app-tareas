create or replace function public.assign_event_blocks_for_staff(
  p_event_id uuid,
  p_staff_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = 'tareas', 'public'
as $function$
declare
  v_inserted integer := 0;
  v_touched integer := 0;
begin
  with matching_blocks as (
    select distinct b.event_id, b.block_key
    from tareas.timeline_blocks b
    join tareas.timeline_events e on e.id = b.event_id
    join tareas.event_staff_assignments s on s.event_id = b.event_id
    where b.event_id = p_event_id
      and s.id = p_staff_id
      and coalesce(b.required_staff_min, 1) > 0
      and exists (
        select 1
        from tareas.event_task_instances ti
        where ti.event_id = b.event_id
          and ti.block_key = b.block_key
          and ti.status <> 'cancelled'
      )
      and tareas.event_minute(b.starts_at, e.open_doors_time) < tareas.event_minute(s.shift_end, e.open_doors_time)
      and tareas.event_minute(s.shift_start, e.open_doors_time) < tareas.event_minute(b.ends_at, e.open_doors_time)
  ), inserted as (
    insert into tareas.event_block_assignments (event_id, block_key, staff_assignment_id)
    select event_id, block_key, p_staff_id
    from matching_blocks
    on conflict (event_id, block_key, staff_assignment_id) do nothing
    returning event_id, block_key
  ), touched as (
    update tareas.event_task_instances ti
    set updated_at = timezone('utc', now())
    where exists (
      select 1
      from matching_blocks mb
      where mb.event_id = ti.event_id
        and mb.block_key = ti.block_key
    )
    returning 1
  )
  select
    (select count(*) from inserted),
    (select count(*) from touched)
  into v_inserted, v_touched;

  return jsonb_build_object(
    'eventId', p_event_id,
    'staffId', p_staff_id,
    'assignedBlockCount', v_inserted,
    'touchedTaskCount', v_touched
  );
end;
$function$;

create or replace function public.assign_event_blocks_for_event(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = 'tareas', 'public'
as $function$
declare
  v_inserted integer := 0;
  v_touched integer := 0;
begin
  with matching_blocks as (
    select distinct b.event_id, b.block_key, s.id as staff_assignment_id
    from tareas.timeline_blocks b
    join tareas.timeline_events e on e.id = b.event_id
    join tareas.event_staff_assignments s on s.event_id = b.event_id
    where b.event_id = p_event_id
      and coalesce(b.required_staff_min, 1) > 0
      and exists (
        select 1
        from tareas.event_task_instances ti
        where ti.event_id = b.event_id
          and ti.block_key = b.block_key
          and ti.status <> 'cancelled'
      )
      and tareas.event_minute(b.starts_at, e.open_doors_time) < tareas.event_minute(s.shift_end, e.open_doors_time)
      and tareas.event_minute(s.shift_start, e.open_doors_time) < tareas.event_minute(b.ends_at, e.open_doors_time)
  ), inserted as (
    insert into tareas.event_block_assignments (event_id, block_key, staff_assignment_id)
    select event_id, block_key, staff_assignment_id
    from matching_blocks
    on conflict (event_id, block_key, staff_assignment_id) do nothing
    returning event_id, block_key
  ), touched as (
    update tareas.event_task_instances ti
    set updated_at = timezone('utc', now())
    where exists (
      select 1
      from matching_blocks mb
      where mb.event_id = ti.event_id
        and mb.block_key = ti.block_key
    )
    returning 1
  )
  select
    (select count(*) from inserted),
    (select count(*) from touched)
  into v_inserted, v_touched;

  return jsonb_build_object(
    'eventId', p_event_id,
    'assignedBlockCount', v_inserted,
    'touchedTaskCount', v_touched
  );
end;
$function$;

grant execute on function public.assign_event_blocks_for_staff(uuid, uuid) to anon, authenticated;
grant execute on function public.assign_event_blocks_for_event(uuid) to anon, authenticated;

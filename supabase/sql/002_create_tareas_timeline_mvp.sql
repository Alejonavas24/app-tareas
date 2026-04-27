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

create table if not exists tareas.timeline_catalog_blocks (
  id uuid primary key default gen_random_uuid(),
  catalog_version text not null check (catalog_version in ('base', '200pax')),
  source_order text not null,
  macrofase text,
  bloque text not null,
  referencias text,
  momentos text,
  tipo_bloque text,
  turno_sugerido text,
  rol_principal text,
  min_personas_bloque text,
  regla_dotacion text,
  continuidad_dependencia text,
  hito_relevo text,
  tareas_camareros integer,
  codigos_camareros text,
  codigos_otros_roles text,
  notas_operativas text,
  ajuste_200pax text,
  codigos_camareros_200 text,
  codigos_otros_roles_200 text,
  notas_200pax text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists timeline_blocks_event_sort_idx
  on tareas.timeline_blocks (event_id, sort_order);

create index if not exists timeline_assumptions_event_sort_idx
  on tareas.timeline_assumptions (event_id, sort_order);

create index if not exists timeline_catalog_blocks_ref_idx
  on tareas.timeline_catalog_blocks (catalog_version, referencias);

create unique index if not exists timeline_catalog_blocks_unique_idx
  on tareas.timeline_catalog_blocks (
    catalog_version,
    source_order,
    bloque,
    coalesce(momentos, ''),
    coalesce(referencias, '')
  );

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

revoke all on all tables in schema tareas from anon, authenticated;

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
      external_id,
      name,
      event_date,
      pax,
      open_doors_time,
      end_time,
      event_config,
      summary,
      warnings
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
      event_id,
      block_key,
      parent_block_id,
      reference,
      label,
      module,
      phase,
      team,
      starts_at,
      ends_at,
      duration_minutes,
      notes,
      assumptions,
      overlaps_with,
      color_key,
      sort_order,
      raw
    )
    values (
      v_event_id,
      coalesce(nullif(v_block->>'id', ''), 'block-' || v_ordinal),
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
      event_id,
      assumption_key,
      label,
      detail,
      reviewed,
      source,
      sort_order,
      raw
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

grant execute on function public.list_timeline_events() to anon, authenticated;
grant execute on function public.get_timeline_event(uuid) to anon, authenticated;
grant execute on function public.save_timeline_snapshot(jsonb) to anon, authenticated;
grant execute on function public.delete_timeline_event(uuid) to anon, authenticated;
grant execute on function public.mark_timeline_assumption_reviewed(uuid, text, boolean) to anon, authenticated;

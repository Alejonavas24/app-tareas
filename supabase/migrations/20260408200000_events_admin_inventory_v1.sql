drop function if exists logistica_tareas.list_space_inventory_rows(bigint, text, text);
create or replace function logistica_tareas.list_space_inventory_rows(
  p_espacio_id bigint,
  p_actor_nombre text,
  p_formulario text default null
)
returns table (
  articulo_id bigint,
  articulo_nombre text,
  tipologia text,
  formulario text,
  segmento_inventario smallint,
  subgrupo text,
  cantidad_teorica integer,
  cantidad_real integer,
  diferencia integer,
  conteo_estado logistica_tareas.conteo_inventario_estado,
  conteo_updated_at timestamptz
)
language sql
stable
security definer
set search_path to 'logistica_tareas', 'public'
as $function$
  with actor as (
    select nullif(trim(coalesce(p_actor_nombre, '')), '') as actor_nombre
  )
  select
    a.id as articulo_id,
    a.nombre as articulo_nombre,
    a.tipologia,
    a.formulario,
    a.segmento_inventario,
    a.subgrupo,
    coalesce(i.cantidad, 0)::integer as cantidad_teorica,
    coalesce(cp.cantidad_real, coalesce(i.cantidad, 0))::integer as cantidad_real,
    coalesce(cp.diferencia, 0)::integer as diferencia,
    cp.estado as conteo_estado,
    cp.updated_at as conteo_updated_at
  from logistica_tareas.articulos a
  left join logistica_tareas.inventario i
    on i.articulo_id = a.id
   and i.espacio_id = p_espacio_id
  left join actor act on true
  left join logistica_tareas.conteos_inventario_pendientes cp
    on cp.articulo_id = a.id
   and cp.espacio_id = p_espacio_id
   and cp.actor_nombre = act.actor_nombre
   and cp.estado = 'pendiente'::logistica_tareas.conteo_inventario_estado
  where p_espacio_id is not null
    and (
      nullif(trim(coalesce(p_formulario, '')), '') is null
      or a.formulario = nullif(trim(coalesce(p_formulario, '')), '')
    )
  order by
    coalesce(a.segmento_inventario, 999),
    coalesce(a.subgrupo, '(Sin subgrupo)'),
    a.nombre,
    a.id;
$function$;
create or replace function logistica_tareas.list_pending_inventory_counts(
  p_espacio_id bigint default null,
  p_estado logistica_tareas.conteo_inventario_estado default 'pendiente'
)
returns table (
  count_id bigint,
  espacio_id bigint,
  espacio_codigo text,
  espacio_nombre text,
  espacio_rol logistica_tareas.espacio_rol,
  articulo_id bigint,
  articulo_nombre text,
  tipologia text,
  formulario text,
  segmento_inventario smallint,
  subgrupo text,
  actor_nombre text,
  cantidad_teorica integer,
  cantidad_real integer,
  diferencia integer,
  estado logistica_tareas.conteo_inventario_estado,
  created_at timestamptz,
  updated_at timestamptz,
  reviewed_by_nombre text,
  reviewed_at timestamptz
)
language sql
stable
security definer
set search_path to 'logistica_tareas', 'public'
as $function$
  select
    cp.id as count_id,
    e.id as espacio_id,
    e.codigo as espacio_codigo,
    e.nombre as espacio_nombre,
    e.rol as espacio_rol,
    a.id as articulo_id,
    a.nombre as articulo_nombre,
    a.tipologia,
    a.formulario,
    a.segmento_inventario,
    a.subgrupo,
    cp.actor_nombre,
    cp.cantidad_teorica,
    cp.cantidad_real,
    cp.diferencia,
    cp.estado,
    cp.created_at,
    cp.updated_at,
    cp.reviewed_by_nombre,
    cp.reviewed_at
  from logistica_tareas.conteos_inventario_pendientes cp
  join logistica_tareas.espacios e on e.id = cp.espacio_id
  join logistica_tareas.articulos a on a.id = cp.articulo_id
  where (p_espacio_id is null or cp.espacio_id = p_espacio_id)
    and (p_estado is null or cp.estado = p_estado)
  order by
    cp.created_at desc,
    e.nombre,
    a.nombre,
    cp.id desc;
$function$;
create or replace function logistica_tareas.review_inventory_count(
  p_count_id bigint,
  p_decision text,
  p_actor_nombre text
)
returns jsonb
language plpgsql
security definer
set search_path to 'logistica_tareas', 'public'
as $function$
declare
  v_count logistica_tareas.conteos_inventario_pendientes%rowtype;
  v_actor_nombre text := nullif(trim(coalesce(p_actor_nombre, '')), '');
  v_decision text := lower(trim(coalesce(p_decision, '')));
  v_rejected_related integer := 0;
begin
  if p_count_id is null then
    raise exception 'count_id es obligatorio';
  end if;

  if v_actor_nombre is null then
    raise exception 'actor_nombre es obligatorio';
  end if;

  if v_decision not in ('aprobado', 'rechazado') then
    raise exception 'decision invalida: %', p_decision;
  end if;

  select *
  into v_count
  from logistica_tareas.conteos_inventario_pendientes
  where id = p_count_id
  for update;

  if not found then
    raise exception 'No existe el conteo %', p_count_id;
  end if;

  if v_count.estado <> 'pendiente'::logistica_tareas.conteo_inventario_estado then
    raise exception 'El conteo % ya fue revisado', p_count_id;
  end if;

  if v_decision = 'aprobado' then
    insert into logistica_tareas.inventario (
      espacio_id,
      articulo_id,
      cantidad
    )
    values (
      v_count.espacio_id,
      v_count.articulo_id,
      v_count.cantidad_real
    )
    on conflict (espacio_id, articulo_id)
    do update
    set
      cantidad = excluded.cantidad,
      updated_at = timezone('utc', now());

    update logistica_tareas.conteos_inventario_pendientes
    set
      estado = 'aprobado'::logistica_tareas.conteo_inventario_estado,
      reviewed_by_nombre = v_actor_nombre,
      reviewed_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
    where id = v_count.id;

    update logistica_tareas.conteos_inventario_pendientes
    set
      estado = 'rechazado'::logistica_tareas.conteo_inventario_estado,
      reviewed_by_nombre = v_actor_nombre,
      reviewed_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
    where espacio_id = v_count.espacio_id
      and articulo_id = v_count.articulo_id
      and id <> v_count.id
      and estado = 'pendiente'::logistica_tareas.conteo_inventario_estado;

    get diagnostics v_rejected_related = row_count;
  else
    update logistica_tareas.conteos_inventario_pendientes
    set
      estado = 'rechazado'::logistica_tareas.conteo_inventario_estado,
      reviewed_by_nombre = v_actor_nombre,
      reviewed_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
    where id = v_count.id;
  end if;

  return jsonb_build_object(
    'count_id', v_count.id,
    'decision', v_decision,
    'espacio_id', v_count.espacio_id,
    'articulo_id', v_count.articulo_id,
    'cantidad_teorica', v_count.cantidad_teorica,
    'cantidad_real', v_count.cantidad_real,
    'related_rejected', v_rejected_related
  );
end;
$function$;
create or replace function logistica_tareas.list_inventory_rupture_events(
  p_date_from date default null,
  p_date_to date default null
)
returns table (
  planner_evento_id bigint,
  external_event_id text,
  nombre_evento text,
  fecha_evento date,
  espacio_evento_id bigint,
  espacio_evento_codigo text,
  espacio_evento_nombre text,
  articulo_id bigint,
  articulo_nombre text,
  tipologia text,
  formulario text,
  segmento_inventario smallint,
  subgrupo text,
  cantidad_requerida integer,
  cantidad_en_ruptura integer
)
language sql
stable
security definer
set search_path to 'logistica_tareas', 'public'
as $function$
  select
    pe.id as planner_evento_id,
    pe.external_event_id,
    pe.nombre as nombre_evento,
    pe.fecha_evento,
    e.id as espacio_evento_id,
    e.codigo as espacio_evento_codigo,
    e.nombre as espacio_evento_nombre,
    a.id as articulo_id,
    a.nombre as articulo_nombre,
    a.tipologia,
    a.formulario,
    a.segmento_inventario,
    a.subgrupo,
    sum(pr.cantidad_requerida)::integer as cantidad_requerida,
    sum(pr.cantidad_en_ruptura)::integer as cantidad_en_ruptura
  from logistica_tareas.planner_eventos pe
  join logistica_tareas.espacios e on e.id = pe.espacio_evento_id
  join logistica_tareas.planner_requerimientos pr
    on pr.planner_evento_id = pe.id
   and pr.plan_version = pe.plan_version
  join logistica_tareas.articulos a on a.id = pr.articulo_id
  where pe.ruptura_inventario = true
    and coalesce(pr.cantidad_en_ruptura, 0) > 0
    and (p_date_from is null or pe.fecha_evento >= p_date_from)
    and (p_date_to is null or pe.fecha_evento <= p_date_to)
  group by
    pe.id,
    pe.external_event_id,
    pe.nombre,
    pe.fecha_evento,
    e.id,
    e.codigo,
    e.nombre,
    a.id,
    a.nombre,
    a.tipologia,
    a.formulario,
    a.segmento_inventario,
    a.subgrupo
  order by
    pe.fecha_evento,
    pe.nombre,
    a.nombre,
    a.id;
$function$;
create or replace function logistica_tareas.list_inventory_rupture_articles(
  p_date_from date default null,
  p_date_to date default null
)
returns table (
  articulo_id bigint,
  articulo_nombre text,
  tipologia text,
  formulario text,
  segmento_inventario smallint,
  subgrupo text,
  planner_evento_id bigint,
  external_event_id text,
  nombre_evento text,
  fecha_evento date,
  espacio_evento_id bigint,
  espacio_evento_codigo text,
  espacio_evento_nombre text,
  cantidad_requerida integer,
  cantidad_en_ruptura integer
)
language sql
stable
security definer
set search_path to 'logistica_tareas', 'public'
as $function$
  select
    a.id as articulo_id,
    a.nombre as articulo_nombre,
    a.tipologia,
    a.formulario,
    a.segmento_inventario,
    a.subgrupo,
    pe.id as planner_evento_id,
    pe.external_event_id,
    pe.nombre as nombre_evento,
    pe.fecha_evento,
    e.id as espacio_evento_id,
    e.codigo as espacio_evento_codigo,
    e.nombre as espacio_evento_nombre,
    sum(pr.cantidad_requerida)::integer as cantidad_requerida,
    sum(pr.cantidad_en_ruptura)::integer as cantidad_en_ruptura
  from logistica_tareas.planner_eventos pe
  join logistica_tareas.espacios e on e.id = pe.espacio_evento_id
  join logistica_tareas.planner_requerimientos pr
    on pr.planner_evento_id = pe.id
   and pr.plan_version = pe.plan_version
  join logistica_tareas.articulos a on a.id = pr.articulo_id
  where pe.ruptura_inventario = true
    and coalesce(pr.cantidad_en_ruptura, 0) > 0
    and (p_date_from is null or pe.fecha_evento >= p_date_from)
    and (p_date_to is null or pe.fecha_evento <= p_date_to)
  group by
    a.id,
    a.nombre,
    a.tipologia,
    a.formulario,
    a.segmento_inventario,
    a.subgrupo,
    pe.id,
    pe.external_event_id,
    pe.nombre,
    pe.fecha_evento,
    e.id,
    e.codigo,
    e.nombre
  order by
    a.nombre,
    pe.fecha_evento,
    pe.nombre,
    pe.id;
$function$;
grant execute on function logistica_tareas.list_space_inventory_rows(bigint, text, text) to anon, authenticated, service_role;
grant execute on function logistica_tareas.list_pending_inventory_counts(bigint, logistica_tareas.conteo_inventario_estado) to anon, authenticated, service_role;
grant execute on function logistica_tareas.review_inventory_count(bigint, text, text) to anon, authenticated, service_role;
grant execute on function logistica_tareas.list_inventory_rupture_events(date, date) to anon, authenticated, service_role;
grant execute on function logistica_tareas.list_inventory_rupture_articles(date, date) to anon, authenticated, service_role;

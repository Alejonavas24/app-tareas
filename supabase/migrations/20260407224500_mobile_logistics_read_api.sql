grant usage on schema logistica_tareas to anon, authenticated;
create or replace function logistica_tareas.list_available_transport_tasks(
  p_date_from date,
  p_date_to date
)
returns table (
  tarea_id bigint,
  planner_evento_id bigint,
  external_event_id text,
  nombre_evento text,
  fecha_evento date,
  plan_version integer,
  planner_requerimiento_id bigint,
  articulo_id bigint,
  articulo_nombre text,
  cantidad integer,
  cantidad_cargada integer,
  remitente_espacio_id bigint,
  remitente_codigo text,
  remitente_nombre text,
  receptor_espacio_id bigint,
  receptor_codigo text,
  receptor_nombre text,
  conductor_nombre text,
  estado logistica_tareas.tarea_estado,
  estado_carga logistica_tareas.tarea_estado_carga,
  alerta_inventario boolean,
  tarea_origen_id bigint,
  created_at timestamptz,
  asignado_at timestamptz
)
language sql
stable
security definer
set search_path to 'logistica_tareas', 'public'
as $function$
  select
    t.id as tarea_id,
    t.planner_evento_id,
    pe.external_event_id,
    pe.nombre as nombre_evento,
    pe.fecha_evento,
    t.plan_version,
    t.planner_requerimiento_id,
    t.articulo_id,
    a.nombre as articulo_nombre,
    t.cantidad,
    t.cantidad_cargada,
    t.remitente_espacio_id,
    origen.codigo as remitente_codigo,
    origen.nombre as remitente_nombre,
    t.receptor_espacio_id,
    destino.codigo as receptor_codigo,
    destino.nombre as receptor_nombre,
    t.conductor_nombre,
    t.estado,
    t.estado_carga,
    t.alerta_inventario,
    t.tarea_origen_id,
    t.created_at,
    t.asignado_at
  from logistica_tareas.tareas t
  join logistica_tareas.planner_eventos pe on pe.id = t.planner_evento_id
  join logistica_tareas.articulos a on a.id = t.articulo_id
  join logistica_tareas.espacios origen on origen.id = t.remitente_espacio_id
  join logistica_tareas.espacios destino on destino.id = t.receptor_espacio_id
  where t.estado in ('pendiente', 'en_proceso')
    and t.conductor_nombre is null
    and pe.fecha_evento between p_date_from and p_date_to
  order by pe.fecha_evento, origen.codigo, destino.codigo, a.nombre, t.id;
$function$;
create or replace function logistica_tareas.list_driver_transport_tasks(
  p_conductor_nombre text,
  p_include_closed boolean default false,
  p_date_from date default null,
  p_date_to date default null
)
returns table (
  tarea_id bigint,
  planner_evento_id bigint,
  external_event_id text,
  nombre_evento text,
  fecha_evento date,
  plan_version integer,
  planner_requerimiento_id bigint,
  articulo_id bigint,
  articulo_nombre text,
  cantidad integer,
  cantidad_cargada integer,
  remitente_espacio_id bigint,
  remitente_codigo text,
  remitente_nombre text,
  receptor_espacio_id bigint,
  receptor_codigo text,
  receptor_nombre text,
  conductor_nombre text,
  estado logistica_tareas.tarea_estado,
  estado_carga logistica_tareas.tarea_estado_carga,
  alerta_inventario boolean,
  tarea_origen_id bigint,
  created_at timestamptz,
  asignado_at timestamptz
)
language sql
stable
security definer
set search_path to 'logistica_tareas', 'public'
as $function$
  select
    t.id as tarea_id,
    t.planner_evento_id,
    pe.external_event_id,
    pe.nombre as nombre_evento,
    pe.fecha_evento,
    t.plan_version,
    t.planner_requerimiento_id,
    t.articulo_id,
    a.nombre as articulo_nombre,
    t.cantidad,
    t.cantidad_cargada,
    t.remitente_espacio_id,
    origen.codigo as remitente_codigo,
    origen.nombre as remitente_nombre,
    t.receptor_espacio_id,
    destino.codigo as receptor_codigo,
    destino.nombre as receptor_nombre,
    t.conductor_nombre,
    t.estado,
    t.estado_carga,
    t.alerta_inventario,
    t.tarea_origen_id,
    t.created_at,
    t.asignado_at
  from logistica_tareas.tareas t
  join logistica_tareas.planner_eventos pe on pe.id = t.planner_evento_id
  join logistica_tareas.articulos a on a.id = t.articulo_id
  join logistica_tareas.espacios origen on origen.id = t.remitente_espacio_id
  join logistica_tareas.espacios destino on destino.id = t.receptor_espacio_id
  where t.conductor_nombre = nullif(trim(coalesce(p_conductor_nombre, '')), '')
    and (
      p_include_closed
      or t.estado not in ('completada', 'cancelada')
    )
    and (p_date_from is null or pe.fecha_evento >= p_date_from)
    and (p_date_to is null or pe.fecha_evento <= p_date_to)
  order by pe.fecha_evento, origen.codigo, destino.codigo, a.nombre, t.id;
$function$;
grant execute on function logistica_tareas.assign_task_driver(bigint, text, text) to anon, authenticated;
grant execute on function logistica_tareas.unassign_task_driver(bigint, text) to anon, authenticated;
grant execute on function logistica_tareas.save_task_loading_draft(bigint, integer, text) to anon, authenticated;
grant execute on function logistica_tareas.finalize_task_loading(bigint, integer, logistica_tareas.tarea_estado_carga, text) to anon, authenticated;
grant execute on function logistica_tareas.list_available_transport_tasks(date, date) to anon, authenticated;
grant execute on function logistica_tareas.list_driver_transport_tasks(text, boolean, date, date) to anon, authenticated;

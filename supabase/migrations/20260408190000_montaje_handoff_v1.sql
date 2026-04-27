alter type logistica_tareas.tarea_estado_carga
  add value if not exists 'lista_para_recibir';
alter type logistica_tareas.tarea_estado_carga
  add value if not exists 'recibido';
alter table logistica_tareas.tareas
  add column if not exists recibido_por_nombre text,
  add column if not exists recibido_at timestamptz;
create or replace function logistica_tareas.get_task_snapshot(
  p_tarea_id bigint
)
returns jsonb
language sql
stable
security definer
set search_path to 'logistica_tareas', 'public'
as $function$
  select jsonb_build_object(
    'tarea_id', t.id,
    'planner_evento_id', t.planner_evento_id,
    'plan_version', t.plan_version,
    'planner_requerimiento_id', t.planner_requerimiento_id,
    'articulo_id', t.articulo_id,
    'articulo_nombre', a.nombre,
    'cantidad', t.cantidad,
    'cantidad_cargada', t.cantidad_cargada,
    'cantidad_restante', greatest(t.cantidad - t.cantidad_cargada, 0),
    'estado', t.estado,
    'estado_carga', t.estado_carga,
    'alerta_inventario', t.alerta_inventario,
    'conductor_nombre', t.conductor_nombre,
    'asignado_por_nombre', t.asignado_por_nombre,
    'asignado_at', t.asignado_at,
    'cerrado_por_nombre', t.cerrado_por_nombre,
    'cerrado_at', t.cerrado_at,
    'recibido_por_nombre', t.recibido_por_nombre,
    'recibido_at', t.recibido_at,
    'tarea_origen_id', t.tarea_origen_id,
    'remitente_espacio_id', t.remitente_espacio_id,
    'remitente_codigo', origen.codigo,
    'remitente_nombre', origen.nombre,
    'receptor_espacio_id', t.receptor_espacio_id,
    'receptor_codigo', destino.codigo,
    'receptor_nombre', destino.nombre,
    'created_at', t.created_at,
    'updated_at', t.updated_at,
    'completed_at', t.completed_at
  )
  from logistica_tareas.tareas t
  join logistica_tareas.articulos a on a.id = t.articulo_id
  join logistica_tareas.espacios origen on origen.id = t.remitente_espacio_id
  join logistica_tareas.espacios destino on destino.id = t.receptor_espacio_id
  where t.id = p_tarea_id;
$function$;
create or replace function logistica_tareas.handoff_task_to_montaje(
  p_tarea_id bigint,
  p_cantidad_cargada integer,
  p_estado_carga_final logistica_tareas.tarea_estado_carga,
  p_actor_nombre text
)
returns jsonb
language plpgsql
security definer
set search_path to 'logistica_tareas', 'public'
as $function$
declare
  v_tarea logistica_tareas.tareas%rowtype;
  v_movimiento logistica_tareas.inventario_movimientos%rowtype;
  v_actor text := nullif(trim(coalesce(p_actor_nombre, '')), '');
  v_cantidad_original integer;
  v_cantidad_cargada integer := coalesce(p_cantidad_cargada, 0);
  v_restante integer;
  v_tarea_remanente_id bigint;
begin
  if v_actor is null then
    raise exception 'actor_nombre es obligatorio';
  end if;

  select *
  into v_tarea
  from logistica_tareas.tareas
  where id = p_tarea_id
  for update;

  if not found then
    raise exception 'No existe la tarea %', p_tarea_id;
  end if;

  if v_tarea.estado in ('completada', 'cancelada') then
    raise exception 'La tarea % ya esta %', p_tarea_id, v_tarea.estado;
  end if;

  if v_tarea.estado_carga in (
    'lista_para_recibir'::logistica_tareas.tarea_estado_carga,
    'recibido'::logistica_tareas.tarea_estado_carga
  ) then
    raise exception 'La tarea % ya fue entregada a montaje', p_tarea_id;
  end if;

  if p_estado_carga_final = 'seleccionado_por_error' then
    return logistica_tareas.unassign_task_driver(p_tarea_id, v_actor);
  end if;

  if v_tarea.conductor_nombre is null then
    raise exception 'La tarea % no tiene conductor asignado', p_tarea_id;
  end if;

  if v_tarea.conductor_nombre <> v_actor then
    raise exception 'La tarea % esta asignada a % y no a %', p_tarea_id, v_tarea.conductor_nombre, v_actor;
  end if;

  select *
  into v_movimiento
  from logistica_tareas.inventario_movimientos
  where tarea_id = p_tarea_id
    and estado = 'activo'::logistica_tareas.movimiento_estado
  order by id desc
  limit 1
  for update;

  if not found then
    raise exception 'La tarea % no tiene un movimiento activo', p_tarea_id;
  end if;

  if v_cantidad_cargada < 0 then
    raise exception 'cantidad_cargada debe ser mayor o igual a cero';
  end if;

  if v_cantidad_cargada > v_tarea.cantidad then
    raise exception 'cantidad_cargada no puede ser mayor a la cantidad de la tarea';
  end if;

  v_cantidad_original := v_tarea.cantidad;
  v_restante := v_cantidad_original - v_cantidad_cargada;

  case p_estado_carga_final
    when 'carga_completa' then
      if v_cantidad_cargada <> v_cantidad_original then
        raise exception 'carga_completa requiere cargar la cantidad total de la tarea';
      end if;

    when 'pendiente' then
      if v_cantidad_cargada <= 0 or v_restante <= 0 then
        raise exception 'pendiente requiere una carga parcial mayor a cero y menor a la cantidad total';
      end if;

    when 'no_las_puedo_recoger' then
      if v_cantidad_cargada <= 0 or v_restante <= 0 then
        raise exception 'no_las_puedo_recoger requiere una carga parcial mayor a cero y menor a la cantidad total';
      end if;

    when 'carga_incompleta' then
      if v_cantidad_cargada <= 0 or v_restante <= 0 then
        raise exception 'carga_incompleta requiere una carga parcial mayor a cero y menor a la cantidad total';
      end if;

    else
      raise exception 'estado_carga_final no soportado para entrega a montaje: %', p_estado_carga_final;
  end case;

  if v_restante > 0 then
    v_tarea_remanente_id := logistica_tareas.create_task_remainder(
      p_tarea_id,
      v_restante,
      case
        when p_estado_carga_final = 'pendiente' then v_tarea.conductor_nombre
        else null
      end,
      v_actor
    );
  end if;

  update logistica_tareas.tareas
  set
    cantidad = v_cantidad_cargada,
    cantidad_cargada = v_cantidad_cargada,
    estado = 'en_proceso',
    estado_carga = 'lista_para_recibir',
    alerta_inventario = (p_estado_carga_final = 'carga_incompleta'),
    cerrado_por_nombre = null,
    cerrado_at = null,
    recibido_por_nombre = null,
    recibido_at = null,
    completed_at = null,
    updated_at = timezone('utc', now())
  where id = p_tarea_id;

  update logistica_tareas.inventario_movimientos
  set
    cantidad = v_cantidad_cargada,
    updated_at = timezone('utc', now())
  where id = v_movimiento.id;

  return logistica_tareas.get_task_snapshot(p_tarea_id) || jsonb_build_object(
    'cantidad_original', v_cantidad_original,
    'cantidad_cargada_final', v_cantidad_cargada,
    'cantidad_restante', v_restante,
    'tarea_remanente_id', v_tarea_remanente_id
  );
end;
$function$;
create or replace function logistica_tareas.receive_task_at_space(
  p_tarea_id bigint,
  p_actor_nombre text
)
returns jsonb
language plpgsql
security definer
set search_path to 'logistica_tareas', 'public'
as $function$
declare
  v_tarea logistica_tareas.tareas%rowtype;
  v_actor text := nullif(trim(coalesce(p_actor_nombre, '')), '');
begin
  if v_actor is null then
    raise exception 'actor_nombre es obligatorio';
  end if;

  select *
  into v_tarea
  from logistica_tareas.tareas
  where id = p_tarea_id
  for update;

  if not found then
    raise exception 'No existe la tarea %', p_tarea_id;
  end if;

  if v_tarea.estado in ('completada', 'cancelada') then
    raise exception 'La tarea % ya esta %', p_tarea_id, v_tarea.estado;
  end if;

  if v_tarea.estado_carga <> 'lista_para_recibir'::logistica_tareas.tarea_estado_carga then
    raise exception 'La tarea % no esta lista para recibir', p_tarea_id;
  end if;

  update logistica_tareas.tareas
  set
    estado_carga = 'recibido',
    recibido_por_nombre = v_actor,
    recibido_at = timezone('utc', now()),
    cerrado_por_nombre = v_actor,
    cerrado_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where id = p_tarea_id;

  return logistica_tareas.complete_task_transfer(p_tarea_id);
end;
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
      or (
        t.estado not in ('completada', 'cancelada')
        and t.estado_carga not in (
          'lista_para_recibir'::logistica_tareas.tarea_estado_carga,
          'recibido'::logistica_tareas.tarea_estado_carga
        )
      )
    )
    and (p_date_from is null or pe.fecha_evento >= p_date_from)
    and (p_date_to is null or pe.fecha_evento <= p_date_to)
  order by pe.fecha_evento, origen.codigo, destino.codigo, a.nombre, t.id;
$function$;
create or replace function logistica_tareas.list_montaje_incoming_tasks(
  p_espacio_id bigint,
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
  where t.receptor_espacio_id = p_espacio_id
    and t.estado not in ('completada', 'cancelada')
    and t.estado_carga = 'lista_para_recibir'::logistica_tareas.tarea_estado_carga
    and (p_date_from is null or pe.fecha_evento >= p_date_from)
    and (p_date_to is null or pe.fecha_evento <= p_date_to)
  order by pe.fecha_evento, pe.nombre, origen.codigo, a.nombre, t.id;
$function$;
create or replace function logistica_tareas.list_montaje_event_items(
  p_espacio_id bigint,
  p_date_from date default null,
  p_date_to date default null
)
returns table (
  planner_evento_id bigint,
  external_event_id text,
  nombre_evento text,
  fecha_evento date,
  articulo_id bigint,
  articulo_nombre text,
  cantidad_requerida integer,
  cantidad_disponible integer
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
    pr.articulo_id,
    a.nombre as articulo_nombre,
    sum(pr.cantidad_requerida)::integer as cantidad_requerida,
    coalesce(i.cantidad, 0)::integer as cantidad_disponible
  from logistica_tareas.planner_eventos pe
  join logistica_tareas.planner_requerimientos pr
    on pr.planner_evento_id = pe.id
   and pr.plan_version = pe.plan_version
  join logistica_tareas.articulos a on a.id = pr.articulo_id
  left join logistica_tareas.inventario i
    on i.espacio_id = p_espacio_id
   and i.articulo_id = pr.articulo_id
  where pe.espacio_evento_id = p_espacio_id
    and (p_date_from is null or pe.fecha_evento >= p_date_from)
    and (p_date_to is null or pe.fecha_evento <= p_date_to)
  group by
    pe.id,
    pe.external_event_id,
    pe.nombre,
    pe.fecha_evento,
    pr.articulo_id,
    a.nombre,
    i.cantidad
  order by pe.fecha_evento, pe.nombre, a.nombre, pr.articulo_id;
$function$;
grant execute on function logistica_tareas.get_task_snapshot(bigint) to anon, authenticated;
grant execute on function logistica_tareas.handoff_task_to_montaje(bigint, integer, logistica_tareas.tarea_estado_carga, text) to anon, authenticated;
grant execute on function logistica_tareas.receive_task_at_space(bigint, text) to anon, authenticated;
grant execute on function logistica_tareas.list_montaje_incoming_tasks(bigint, date, date) to anon, authenticated;
grant execute on function logistica_tareas.list_montaje_event_items(bigint, date, date) to anon, authenticated;
grant execute on function logistica_tareas.list_driver_transport_tasks(text, boolean, date, date) to anon, authenticated;
grant execute on function logistica_tareas.get_task_snapshot(bigint) to service_role;
grant execute on function logistica_tareas.handoff_task_to_montaje(bigint, integer, logistica_tareas.tarea_estado_carga, text) to service_role;
grant execute on function logistica_tareas.receive_task_at_space(bigint, text) to service_role;
grant execute on function logistica_tareas.list_montaje_incoming_tasks(bigint, date, date) to service_role;
grant execute on function logistica_tareas.list_montaje_event_items(bigint, date, date) to service_role;
grant execute on function logistica_tareas.list_driver_transport_tasks(text, boolean, date, date) to service_role;

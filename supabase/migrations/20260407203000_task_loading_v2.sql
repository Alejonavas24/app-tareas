do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'logistica_tareas'
      and t.typname = 'tarea_estado_carga'
  ) then
    create type logistica_tareas.tarea_estado_carga as enum (
      'sin_iniciar',
      'en_borrador',
      'carga_completa',
      'pendiente',
      'no_las_puedo_recoger',
      'seleccionado_por_error',
      'carga_incompleta'
    );
  end if;
end;
$$;
alter table logistica_tareas.tareas
  add column if not exists conductor_nombre text,
  add column if not exists asignado_por_nombre text,
  add column if not exists asignado_at timestamptz,
  add column if not exists cantidad_cargada integer not null default 0,
  add column if not exists estado_carga logistica_tareas.tarea_estado_carga not null default 'sin_iniciar',
  add column if not exists alerta_inventario boolean not null default false,
  add column if not exists cerrado_por_nombre text,
  add column if not exists cerrado_at timestamptz,
  add column if not exists tarea_origen_id bigint references logistica_tareas.tareas (id) on delete set null;
alter table logistica_tareas.tareas
  drop constraint if exists tareas_cantidad_check;
alter table logistica_tareas.tareas
  drop constraint if exists tareas_cantidad_nonnegative_check;
alter table logistica_tareas.tareas
  add constraint tareas_cantidad_nonnegative_check check (cantidad >= 0);
alter table logistica_tareas.tareas
  drop constraint if exists tareas_cantidad_cargada_check;
alter table logistica_tareas.tareas
  add constraint tareas_cantidad_cargada_check check (
    cantidad_cargada >= 0
    and cantidad_cargada <= cantidad
  );
create index if not exists tareas_operativas_idx
  on logistica_tareas.tareas (conductor_nombre, estado, estado_carga);
create index if not exists tareas_origen_idx
  on logistica_tareas.tareas (tarea_origen_id);
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
    'tarea_origen_id', t.tarea_origen_id,
    'remitente_espacio_id', t.remitente_espacio_id,
    'remitente_codigo', origen.codigo,
    'remitente_nombre', origen.nombre,
    'receptor_espacio_id', t.receptor_espacio_id,
    'receptor_codigo', destino.codigo,
    'receptor_nombre', destino.nombre,
    'created_at', t.created_at,
    'updated_at', t.updated_at
  )
  from logistica_tareas.tareas t
  join logistica_tareas.articulos a on a.id = t.articulo_id
  join logistica_tareas.espacios origen on origen.id = t.remitente_espacio_id
  join logistica_tareas.espacios destino on destino.id = t.receptor_espacio_id
  where t.id = p_tarea_id;
$function$;
create or replace function logistica_tareas.complete_task_transfer(
  p_tarea_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path to 'logistica_tareas', 'public'
as $function$
declare
  v_tarea logistica_tareas.tareas%rowtype;
  v_movimiento logistica_tareas.inventario_movimientos%rowtype;
  v_stock_origen integer;
begin
  select *
  into v_tarea
  from logistica_tareas.tareas
  where id = p_tarea_id
  for update;

  if not found then
    raise exception 'No existe la tarea %', p_tarea_id;
  end if;

  if v_tarea.estado = 'completada'::logistica_tareas.tarea_estado then
    raise exception 'La tarea % ya esta completada', p_tarea_id;
  end if;

  if v_tarea.estado = 'cancelada'::logistica_tareas.tarea_estado then
    raise exception 'La tarea % esta cancelada', p_tarea_id;
  end if;

  if v_tarea.cantidad <= 0 then
    raise exception 'La tarea % no tiene cantidad positiva para mover', p_tarea_id;
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
    raise exception 'La tarea % no tiene una reserva de traslado activa', p_tarea_id;
  end if;

  perform logistica_tareas.ensure_inventory_row(v_tarea.remitente_espacio_id, v_tarea.articulo_id);
  perform logistica_tareas.ensure_inventory_row(v_tarea.receptor_espacio_id, v_tarea.articulo_id);

  select cantidad
  into v_stock_origen
  from logistica_tareas.inventario
  where espacio_id = v_tarea.remitente_espacio_id
    and articulo_id = v_tarea.articulo_id
  for update;

  perform 1
  from logistica_tareas.inventario
  where espacio_id = v_tarea.receptor_espacio_id
    and articulo_id = v_tarea.articulo_id
  for update;

  if v_stock_origen < v_tarea.cantidad then
    raise exception 'Inventario insuficiente para completar la tarea %', p_tarea_id;
  end if;

  update logistica_tareas.inventario
  set cantidad = cantidad - v_tarea.cantidad
  where espacio_id = v_tarea.remitente_espacio_id
    and articulo_id = v_tarea.articulo_id;

  update logistica_tareas.inventario
  set cantidad = cantidad + v_tarea.cantidad
  where espacio_id = v_tarea.receptor_espacio_id
    and articulo_id = v_tarea.articulo_id;

  update logistica_tareas.tareas
  set
    estado = 'completada',
    completed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where id = p_tarea_id;

  update logistica_tareas.inventario_movimientos
  set
    estado = 'aplicado',
    applied_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where id = v_movimiento.id;

  insert into logistica_tareas.inventario_movimientos (
    planner_evento_id,
    plan_version,
    planner_requerimiento_id,
    tarea_id,
    semana_operativa_inicio,
    tipo,
    estado,
    espacio_origen_id,
    espacio_destino_id,
    articulo_id,
    cantidad,
    applied_at
  )
  values (
    v_tarea.planner_evento_id,
    v_tarea.plan_version,
    v_tarea.planner_requerimiento_id,
    v_tarea.id,
    v_movimiento.semana_operativa_inicio,
    'traslado_completado',
    'aplicado',
    v_tarea.remitente_espacio_id,
    v_tarea.receptor_espacio_id,
    v_tarea.articulo_id,
    v_tarea.cantidad,
    timezone('utc', now())
  );

  return logistica_tareas.get_task_snapshot(p_tarea_id);
end;
$function$;
create or replace function logistica_tareas.create_task_remainder(
  p_tarea_id bigint,
  p_cantidad_restante integer,
  p_conductor_nombre text default null,
  p_actor_nombre text default null
)
returns bigint
language plpgsql
security definer
set search_path to 'logistica_tareas', 'public'
as $function$
declare
  v_tarea logistica_tareas.tareas%rowtype;
  v_movimiento logistica_tareas.inventario_movimientos%rowtype;
  v_nueva_tarea_id bigint;
begin
  if p_cantidad_restante is null or p_cantidad_restante <= 0 then
    raise exception 'La cantidad restante debe ser mayor a cero';
  end if;

  select *
  into v_tarea
  from logistica_tareas.tareas
  where id = p_tarea_id
  for update;

  if not found then
    raise exception 'No existe la tarea origen %', p_tarea_id;
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
    raise exception 'La tarea origen % no tiene un movimiento activo', p_tarea_id;
  end if;

  insert into logistica_tareas.tareas (
    planner_evento_id,
    plan_version,
    planner_requerimiento_id,
    remitente_espacio_id,
    receptor_espacio_id,
    articulo_id,
    cantidad,
    estado,
    conductor_nombre,
    asignado_por_nombre,
    asignado_at,
    cantidad_cargada,
    estado_carga,
    alerta_inventario,
    tarea_origen_id
  )
  values (
    v_tarea.planner_evento_id,
    v_tarea.plan_version,
    v_tarea.planner_requerimiento_id,
    v_tarea.remitente_espacio_id,
    v_tarea.receptor_espacio_id,
    v_tarea.articulo_id,
    p_cantidad_restante,
    case
      when nullif(trim(coalesce(p_conductor_nombre, '')), '') is null then 'pendiente'::logistica_tareas.tarea_estado
      else 'en_proceso'::logistica_tareas.tarea_estado
    end,
    nullif(trim(coalesce(p_conductor_nombre, '')), ''),
    case
      when nullif(trim(coalesce(p_conductor_nombre, '')), '') is null then null
      else nullif(trim(coalesce(p_actor_nombre, '')), '')
    end,
    case
      when nullif(trim(coalesce(p_conductor_nombre, '')), '') is null then null
      else timezone('utc', now())
    end,
    0,
    'sin_iniciar',
    false,
    v_tarea.id
  )
  returning id into v_nueva_tarea_id;

  insert into logistica_tareas.inventario_movimientos (
    planner_evento_id,
    plan_version,
    planner_requerimiento_id,
    tarea_id,
    semana_operativa_inicio,
    tipo,
    estado,
    espacio_origen_id,
    espacio_destino_id,
    articulo_id,
    cantidad
  )
  values (
    v_movimiento.planner_evento_id,
    v_movimiento.plan_version,
    v_movimiento.planner_requerimiento_id,
    v_nueva_tarea_id,
    v_movimiento.semana_operativa_inicio,
    'reserva_traslado',
    'activo',
    v_movimiento.espacio_origen_id,
    v_movimiento.espacio_destino_id,
    v_movimiento.articulo_id,
    p_cantidad_restante
  );

  return v_nueva_tarea_id;
end;
$function$;
create or replace function logistica_tareas.assign_task_driver(
  p_tarea_id bigint,
  p_conductor_nombre text,
  p_actor_nombre text
)
returns jsonb
language plpgsql
security definer
set search_path to 'logistica_tareas', 'public'
as $function$
declare
  v_tarea logistica_tareas.tareas%rowtype;
  v_conductor text := nullif(trim(coalesce(p_conductor_nombre, '')), '');
  v_actor text := nullif(trim(coalesce(p_actor_nombre, '')), '');
begin
  if v_conductor is null then
    raise exception 'conductor_nombre es obligatorio';
  end if;

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
    raise exception 'No se puede asignar la tarea % porque ya esta %', p_tarea_id, v_tarea.estado;
  end if;

  update logistica_tareas.tareas
  set
    conductor_nombre = v_conductor,
    asignado_por_nombre = v_actor,
    asignado_at = timezone('utc', now()),
    cantidad_cargada = 0,
    estado_carga = 'sin_iniciar',
    alerta_inventario = false,
    estado = 'en_proceso',
    updated_at = timezone('utc', now())
  where id = p_tarea_id;

  return logistica_tareas.get_task_snapshot(p_tarea_id);
end;
$function$;
create or replace function logistica_tareas.unassign_task_driver(
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
    raise exception 'No se puede desasignar la tarea % porque ya esta %', p_tarea_id, v_tarea.estado;
  end if;

  update logistica_tareas.tareas
  set
    conductor_nombre = null,
    asignado_por_nombre = null,
    asignado_at = null,
    cantidad_cargada = 0,
    estado_carga = 'sin_iniciar',
    estado = 'pendiente',
    updated_at = timezone('utc', now())
  where id = p_tarea_id;

  return logistica_tareas.get_task_snapshot(p_tarea_id);
end;
$function$;
create or replace function logistica_tareas.save_task_loading_draft(
  p_tarea_id bigint,
  p_cantidad_cargada integer,
  p_conductor_nombre text
)
returns jsonb
language plpgsql
security definer
set search_path to 'logistica_tareas', 'public'
as $function$
declare
  v_tarea logistica_tareas.tareas%rowtype;
  v_conductor text := nullif(trim(coalesce(p_conductor_nombre, '')), '');
begin
  if v_conductor is null then
    raise exception 'conductor_nombre es obligatorio';
  end if;

  if p_cantidad_cargada is null or p_cantidad_cargada < 0 then
    raise exception 'cantidad_cargada debe ser mayor o igual a cero';
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
    raise exception 'No se puede guardar borrador para la tarea % porque ya esta %', p_tarea_id, v_tarea.estado;
  end if;

  if v_tarea.conductor_nombre is null then
    raise exception 'La tarea % no tiene conductor asignado', p_tarea_id;
  end if;

  if v_tarea.conductor_nombre <> v_conductor then
    raise exception 'La tarea % esta asignada a % y no a %', p_tarea_id, v_tarea.conductor_nombre, v_conductor;
  end if;

  if p_cantidad_cargada > v_tarea.cantidad then
    raise exception 'cantidad_cargada no puede ser mayor a la cantidad de la tarea';
  end if;

  update logistica_tareas.tareas
  set
    cantidad_cargada = p_cantidad_cargada,
    estado_carga = 'en_borrador',
    estado = 'en_proceso',
    updated_at = timezone('utc', now())
  where id = p_tarea_id;

  return logistica_tareas.get_task_snapshot(p_tarea_id);
end;
$function$;
create or replace function logistica_tareas.finalize_task_loading(
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
  v_resultado jsonb;
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

  if p_estado_carga_final = 'seleccionado_por_error' then
    return logistica_tareas.unassign_task_driver(p_tarea_id, v_actor);
  end if;

  if v_tarea.conductor_nombre is null then
    raise exception 'La tarea % no tiene conductor asignado', p_tarea_id;
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
      if v_restante <= 0 then
        raise exception 'carga_incompleta requiere dejar remanente sin cargar';
      end if;

    else
      raise exception 'estado_carga_final no soportado para cierre: %', p_estado_carga_final;
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

  if v_cantidad_cargada > 0 then
    update logistica_tareas.tareas
    set
      cantidad = v_cantidad_cargada,
      cantidad_cargada = v_cantidad_cargada,
      estado_carga = p_estado_carga_final,
      alerta_inventario = (p_estado_carga_final = 'carga_incompleta'),
      cerrado_por_nombre = v_actor,
      cerrado_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
    where id = p_tarea_id;

    update logistica_tareas.inventario_movimientos
    set
      cantidad = v_cantidad_cargada,
      updated_at = timezone('utc', now())
    where id = v_movimiento.id;

    v_resultado := logistica_tareas.complete_task_transfer(p_tarea_id);
  else
    update logistica_tareas.inventario_movimientos
    set
      estado = 'cancelado',
      cancelled_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
    where id = v_movimiento.id;

    update logistica_tareas.tareas
    set
      cantidad = 0,
      cantidad_cargada = 0,
      estado = 'completada',
      estado_carga = p_estado_carga_final,
      alerta_inventario = (p_estado_carga_final = 'carga_incompleta'),
      cerrado_por_nombre = v_actor,
      cerrado_at = timezone('utc', now()),
      completed_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
    where id = p_tarea_id;

    v_resultado := logistica_tareas.get_task_snapshot(p_tarea_id);
  end if;

  return v_resultado || jsonb_build_object(
    'cantidad_original', v_cantidad_original,
    'cantidad_cargada_final', v_cantidad_cargada,
    'cantidad_restante', v_restante,
    'tarea_remanente_id', v_tarea_remanente_id
  );
end;
$function$;
create or replace function logistica_tareas.list_available_tasks()
returns table (
  tarea_id bigint,
  planner_evento_id bigint,
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
  join logistica_tareas.articulos a on a.id = t.articulo_id
  join logistica_tareas.espacios origen on origen.id = t.remitente_espacio_id
  join logistica_tareas.espacios destino on destino.id = t.receptor_espacio_id
  where t.estado in ('pendiente', 'en_proceso')
    and t.conductor_nombre is null
  order by t.created_at, t.id;
$function$;
create or replace function logistica_tareas.list_driver_tasks(
  p_conductor_nombre text,
  p_include_closed boolean default false
)
returns table (
  tarea_id bigint,
  planner_evento_id bigint,
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
  join logistica_tareas.articulos a on a.id = t.articulo_id
  join logistica_tareas.espacios origen on origen.id = t.remitente_espacio_id
  join logistica_tareas.espacios destino on destino.id = t.receptor_espacio_id
  where t.conductor_nombre = nullif(trim(coalesce(p_conductor_nombre, '')), '')
    and (
      p_include_closed
      or t.estado not in ('completada', 'cancelada')
    )
  order by t.created_at desc, t.id desc;
$function$;
create or replace function logistica_tareas.complete_task(
  p_tarea_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path to 'logistica_tareas', 'public'
as $function$
declare
  v_tarea logistica_tareas.tareas%rowtype;
begin
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

  if v_tarea.cantidad = 0 then
    update logistica_tareas.inventario_movimientos
    set
      estado = 'cancelado',
      cancelled_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
    where tarea_id = p_tarea_id
      and estado = 'activo';

    update logistica_tareas.tareas
    set
      estado = 'completada',
      estado_carga = 'carga_completa',
      cantidad_cargada = 0,
      cerrado_por_nombre = coalesce(cerrado_por_nombre, 'system'),
      cerrado_at = coalesce(cerrado_at, timezone('utc', now())),
      completed_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
    where id = p_tarea_id;

    return logistica_tareas.get_task_snapshot(p_tarea_id);
  end if;

  update logistica_tareas.tareas
  set
    estado_carga = 'carga_completa',
    cantidad_cargada = cantidad,
    cerrado_por_nombre = coalesce(cerrado_por_nombre, 'system'),
    cerrado_at = coalesce(cerrado_at, timezone('utc', now())),
    updated_at = timezone('utc', now())
  where id = p_tarea_id;

  return logistica_tareas.complete_task_transfer(p_tarea_id);
end;
$function$;
grant execute on function logistica_tareas.get_task_snapshot(bigint) to service_role;
grant execute on function logistica_tareas.assign_task_driver(bigint, text, text) to service_role;
grant execute on function logistica_tareas.unassign_task_driver(bigint, text) to service_role;
grant execute on function logistica_tareas.save_task_loading_draft(bigint, integer, text) to service_role;
grant execute on function logistica_tareas.finalize_task_loading(bigint, integer, logistica_tareas.tarea_estado_carga, text) to service_role;
grant execute on function logistica_tareas.list_available_tasks() to service_role;
grant execute on function logistica_tareas.list_driver_tasks(text, boolean) to service_role;
grant execute on function logistica_tareas.complete_task_transfer(bigint) to service_role;
grant execute on function logistica_tareas.create_task_remainder(bigint, integer, text, text) to service_role;

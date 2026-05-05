-- Expose the tareas catalog without RPC. The APK reads these public views directly.
drop function if exists public.get_event_catalog(integer);
drop view if exists public.event_catalog_tasks;
drop view if exists public.event_catalog_blocks;

create view public.event_catalog_blocks as
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
from tareas.event_blocks;

create view public.event_catalog_tasks as
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
from tareas.event_tasks;

alter table tareas.event_blocks disable row level security;
alter table tareas.event_tasks disable row level security;

grant usage on schema tareas to anon, authenticated;
grant select on tareas.event_blocks to anon, authenticated;
grant select on tareas.event_tasks to anon, authenticated;
grant select on public.event_catalog_blocks to anon, authenticated;
grant select on public.event_catalog_tasks to anon, authenticated;

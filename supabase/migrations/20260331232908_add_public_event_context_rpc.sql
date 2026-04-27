-- Public administrative event context reader for anon frontend flows.
-- Apply on a non-production environment first, then review before production rollout.

create or replace function public.administracion_get_event_context(
  _id_evento uuid
)
returns table(
  id uuid,
  fecha date,
  "fechaB" date,
  id_espacio uuid,
  id_calendario_espacio_seleccion text,
  invitados_adultos bigint,
  invitados_adultos_b numeric
)
language sql
security definer
set search_path = public
as $$
  select
    e.id,
    e.fecha,
    e."fechaB",
    e.id_espacio,
    e.id_calendario_espacio_seleccion,
    e.invitados_adultos,
    e.invitados_adultos_b
  from public.evento e
  where e.id = _id_evento
  limit 1;
$$;

grant execute on function public.administracion_get_event_context(uuid) to anon, authenticated;;

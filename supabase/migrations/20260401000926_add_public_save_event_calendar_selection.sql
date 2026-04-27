create or replace function public.administracion_save_event_calendar_selection(
  _id_evento uuid,
  _fecha date default null,
  _id_calendario_espacio_seleccion text default null,
  _id_espacio uuid default null,
  _invitados_adultos_b numeric default null
)
returns table(
  id uuid,
  "fechaB" date,
  id_espacio uuid,
  id_calendario_espacio_seleccion text,
  invitados_adultos_b numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if _id_evento is null then
    raise exception 'No fue posible encontrar el evento indicado.';
  end if;

  update public.evento e
  set
    "fechaB" = _fecha,
    id_calendario_espacio_seleccion = nullif(btrim(coalesce(_id_calendario_espacio_seleccion, '')), ''),
    id_espacio = _id_espacio,
    invitados_adultos_b = coalesce(_invitados_adultos_b, e.invitados_adultos_b)
  where e.id = _id_evento;

  if not found then
    raise exception 'No fue posible actualizar la selección del evento.';
  end if;

  return query
  select
    e.id,
    e."fechaB",
    e.id_espacio,
    e.id_calendario_espacio_seleccion,
    e.invitados_adultos_b
  from public.evento e
  where e.id = _id_evento
  limit 1;
end;
$$;

grant execute on function public.administracion_save_event_calendar_selection(uuid, date, text, uuid, numeric) to anon, authenticated;;

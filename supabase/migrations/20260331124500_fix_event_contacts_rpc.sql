create or replace function public.gastronomia_get_event_contacts(
  _id_evento uuid
)
returns table(
  id_eventoxcontacto uuid,
  id_contacto uuid,
  nombre text,
  apellido text,
  email text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  rel_table regclass;
  sql text;
  apellido_expr text;
begin
  if _id_evento is null then
    return;
  end if;

  rel_table := to_regclass('public."eventoXcontacto"');
  if rel_table is null then
    rel_table := to_regclass('public.eventoxcontacto');
  end if;

  if rel_table is null then
    raise exception 'No existe la tabla eventoXcontacto/eventoxcontacto.';
  end if;

  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'contacto'
       and column_name = 'apellido'
  ) then
    apellido_expr := 'c.apellido';
  elsif exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'contacto'
       and column_name = 'apellido_1'
  ) then
    apellido_expr := 'nullif(trim(concat_ws('' '', c.apellido_1, c.apellido_2)), '''')';
  else
    apellido_expr := 'null::text';
  end if;

  sql := format(
    'select ex.id as id_eventoxcontacto,
            c.id as id_contacto,
            c.nombre as nombre,
            %s as apellido,
            c.email as email
       from %s ex
       join public.contacto c on c.id = ex.id_contacto
      where ex.id_evento = $1
      order by ex.id asc',
    apellido_expr,
    rel_table
  );

  return query execute sql using _id_evento;
end;
$$;
grant execute on function public.gastronomia_get_event_contacts(uuid) to anon, authenticated;

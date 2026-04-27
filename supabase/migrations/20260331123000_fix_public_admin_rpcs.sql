-- Public administrative RPCs for administracionAppClientes.
-- Apply on a non-production environment first, then review before production rollout.

create or replace function public.gastronomia_resolve_contacto(
  _email text,
  _id_evento uuid default null
)
returns table(
  id_contacto uuid,
  id_evento uuid,
  id_eventoxcontacto uuid,
  email text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  rel_table regclass;
  sql text;
begin
  if coalesce(trim(_email), '') = '' then
    return;
  end if;

  rel_table := to_regclass('public."eventoXcontacto"');
  if rel_table is null then
    rel_table := to_regclass('public.eventoxcontacto');
  end if;

  if rel_table is null then
    raise exception 'No existe la tabla eventoXcontacto/eventoxcontacto.';
  end if;

  sql := format(
    'select c.id as id_contacto,
            ex.id_evento as id_evento,
            ex.id as id_eventoxcontacto,
            c.email as email
       from public.contacto c
       join %s ex on ex.id_contacto = c.id
      where lower(c.email) = lower($1)
        and ($2::uuid is null or ex.id_evento = $2)
      order by ex.id desc',
    rel_table
  );

  return query execute sql using _email, _id_evento;
end;
$$;
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

  sql := format(
    'select ex.id as id_eventoxcontacto,
            c.id as id_contacto,
            c.nombre as nombre,
            c.apellido as apellido,
            c.email as email
       from %s ex
       join public.contacto c on c.id = ex.id_contacto
      where ex.id_evento = $1
      order by ex.id asc',
    rel_table
  );

  return query execute sql using _id_evento;
end;
$$;
create or replace function public.gastronomia_get_preselecciones(
  _id_evento uuid,
  _pantalla text default 'gastronomia',
  _contador integer default null,
  _id_contacto uuid default null,
  _id_eventoxcontacto uuid default null
)
returns table(
  id uuid,
  id_seleccion uuid,
  nombre_seleccion text,
  precio_seleccion double precision,
  tab text,
  contador_seleccion integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  has_id_contacto boolean;
  has_id_persona boolean;
  has_id_eventoxcontacto boolean;
  sql text;
begin
  if _id_evento is null then
    return;
  end if;

  select exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'selecciones'
       and column_name = 'id_contacto'
  ) into has_id_contacto;

  select exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'selecciones'
       and column_name = 'id_persona'
  ) into has_id_persona;

  select exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'selecciones'
       and column_name = 'id_eventoxcontacto'
  ) into has_id_eventoxcontacto;

  sql :=
    'select s.id,
            s.id_seleccion,
            s.nombre_seleccion,
            s.precio_seleccion,
            s.tab,
            s.contador_seleccion
       from public.selecciones s
      where s.id_evento = $1
        and s.pantalla = $2';

  if _contador is not null then
    sql := sql || ' and s.contador_seleccion = $3';
  end if;

  if _id_eventoxcontacto is not null and has_id_eventoxcontacto then
    sql := sql || ' and s.id_eventoxcontacto = $4';
  elsif _id_contacto is not null and has_id_contacto then
    sql := sql || ' and s.id_contacto = $5';
  elsif _id_contacto is not null and has_id_persona then
    sql := sql || ' and s.id_persona = $5';
  end if;

  sql := sql || ' order by s.contador_seleccion desc nulls last, s.id desc';

  return query execute sql
    using _id_evento,
          coalesce(nullif(_pantalla, ''), 'gastronomia'),
          _contador,
          _id_eventoxcontacto,
          _id_contacto;
end;
$$;
create or replace function public.gastronomia_sync_evento_counter(
  _id_evento uuid,
  _should_increment boolean default false
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.administracion_sync_evento_counter(
    _id_evento,
    'gastronomia',
    _should_increment
  );
end;
$$;
create or replace function public.bulk_insert_selecciones_items(
  _id_evento uuid,
  _pantalla text,
  _tab text,
  _contador integer,
  _items jsonb
)
returns setof public.selecciones
language sql
security definer
set search_path = public
as $$
  with payload as (
    select
      (x->>'id')::uuid as id_seleccion,
      nullif(trim(x->>'nombre'), '')::text as nombre_seleccion,
      nullif(trim(x->>'precio'), '')::double precision as precio_seleccion
    from jsonb_array_elements(coalesce(_items, '[]'::jsonb)) x
    where x ? 'id'
  )
  insert into public.selecciones (
    id_evento,
    pantalla,
    tab,
    contador_seleccion,
    nombre_seleccion,
    precio_seleccion,
    id_seleccion
  )
  select
    _id_evento,
    _pantalla,
    _tab,
    _contador,
    p.nombre_seleccion,
    p.precio_seleccion,
    p.id_seleccion
  from payload p
  returning *;
$$;
create or replace function public.administracion_save_section_selections(
  _id_evento uuid,
  _section_key text,
  _should_increment boolean default false,
  _selected_by_tab jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_section text;
  pantalla_key text;
  saved_counter integer;
begin
  if _id_evento is null then
    raise exception 'El evento es obligatorio.';
  end if;

  normalized_section := lower(coalesce(nullif(trim(_section_key), ''), 'gastronomia'));

  pantalla_key := case normalized_section
    when 'gastronomia' then 'gastronomia'
    when 'bodega' then 'bodega'
    when 'bebida' then 'bebida'
    when 'bebidas' then 'bebida'
    when 'tematica' then 'tematica'
    when 'adicionales' then 'adicionales'
    else null
  end;

  if pantalla_key is null then
    raise exception 'La seccion % no esta soportada.', normalized_section;
  end if;

  saved_counter := public.administracion_sync_evento_counter(
    _id_evento,
    normalized_section,
    coalesce(_should_increment, false)
  );

  insert into public.selecciones (
    id_evento,
    pantalla,
    tab,
    contador_seleccion,
    nombre_seleccion,
    precio_seleccion,
    id_seleccion
  )
  select
    _id_evento,
    pantalla_key,
    tabs.tab,
    saved_counter,
    nullif(trim(item.value->>'nombre'), '')::text,
    nullif(trim(item.value->>'precio'), '')::double precision,
    (item.value->>'id')::uuid
  from jsonb_each(
    case
      when jsonb_typeof(coalesce(_selected_by_tab, '{}'::jsonb)) = 'object'
        then coalesce(_selected_by_tab, '{}'::jsonb)
      else '{}'::jsonb
    end
  ) as tabs(tab, items)
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(tabs.items) = 'array' then tabs.items
      else '[]'::jsonb
    end
  ) as item(value)
  where item.value ? 'id';

  return saved_counter;
end;
$$;
grant execute on function public.gastronomia_resolve_contacto(text, uuid) to anon, authenticated;
grant execute on function public.gastronomia_get_event_contacts(uuid) to anon, authenticated;
grant execute on function public.gastronomia_get_preselecciones(uuid, text, integer, uuid, uuid) to anon, authenticated;
grant execute on function public.gastronomia_sync_evento_counter(uuid, boolean) to anon, authenticated;
grant execute on function public.bulk_insert_selecciones_items(uuid, text, text, integer, jsonb) to anon, authenticated;
grant execute on function public.administracion_save_section_selections(uuid, text, boolean, jsonb) to anon, authenticated;

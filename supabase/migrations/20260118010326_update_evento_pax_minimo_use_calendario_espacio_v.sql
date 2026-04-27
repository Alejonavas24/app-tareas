create or replace function public.evento_pax_minimo(p_evento uuid)
returns numeric
language sql
stable
as $function$
  with e as (
    select *
    from public.evento
    where id = p_evento
  ),
  cev as (
    select v.*
    from public.calendario_espacio_v v
    join e on v.id::text = e.id_calendario_espacio_seleccion
  )
  select coalesce(max(cev.pax_minimo)::numeric, 0::numeric)
  from cev;
$function$;
;

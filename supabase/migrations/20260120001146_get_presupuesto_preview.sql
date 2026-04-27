create or replace function public.get_presupuesto_preview(
  p_evento uuid,
  p_invitados numeric,
  p_calendario_espacio_ids uuid[],
  p_gastronomia_ids uuid[] default '{}',
  p_bodega_ids uuid[] default '{}',
  p_bebida_ids uuid[] default '{}',
  p_tematica_ids uuid[] default '{}',
  p_adicionales_ids uuid[] default '{}'
)
returns table (
  calendario_espacio_id uuid,
  precio_por_invitado numeric
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with params as (
    select
      coalesce(p_invitados, public.evento_invitados_efectivos(p_evento), 0)::numeric as invitados,
      public.param_val('descuento_excedente')::numeric as desc_excedente,
      public.param_val('incremento_faltante')::numeric as inc_faltante,
      public.param_val('rentabilidad_anual')::numeric as rent_anual,
      public.param_val('rentabilidad_app')::numeric as rent_app
  ),
  cal as (
    select
      v.id as calendario_espacio_id,
      v.espacio_id,
      v.pax_minimo::numeric as pax_minimo,
      v.precio_base_evento::numeric as precio_base_evento,
      v.rentabilidad_unitaria::numeric as rent_cal,
      e.rentabilidad_unitaria::numeric as rent_espacio
    from public.calendario_espacio_v v
    left join public.espacios e on e.id = v.espacio_id
    where v.id = any(p_calendario_espacio_ids)
  ),
  factor as (
    select
      c.*,
      p.invitados,
      p.rent_anual,
      p.rent_app,
      case
        when p.invitados is null or p.invitados <= 0 or c.pax_minimo is null then 1::numeric
        else (
          with base as (
            select case
              when p.invitados > c.pax_minimo then coalesce(p.desc_excedente, 0)
              when p.invitados < c.pax_minimo then coalesce(p.inc_faltante, 0)
              else 0
            end as base
          ),
          aplicado as (
            select case
              when base <> 0 then round(base - (base * c.pax_minimo) / p.invitados, 2)
              else 0
            end as aplicado
            from base
          )
          select case
            when aplicado > 0 then round(1 - (aplicado / 100.0), 6)
            when aplicado < 0 then round(1 + (abs(aplicado) / 100.0), 6)
            else 1::numeric
          end
          from aplicado
        )
      end as factor_evento
    from cal c
    cross join params p
  ),
  totals as (
    select
      f.calendario_espacio_id,
      f.invitados,
      f.precio_base_evento,
      f.factor_evento,
      f.rent_anual,
      f.rent_app,
      coalesce(f.rent_cal, f.rent_espacio, 0)::numeric as rent_espacio,
      coalesce((
        select sum(public.menu_precio_base_pax(m.id) * f.factor_evento)
        from public.menu m
        where m.id = any(coalesce(p_gastronomia_ids, '{}'::uuid[]))
      ), 0)::numeric as gastro_total,
      coalesce((
        select sum(public.bodega_precio_base_pax(b.id) * f.factor_evento)
        from public.bodega b
        where b.id = any(coalesce(p_bodega_ids, '{}'::uuid[]))
      ), 0)::numeric as bodega_total,
      coalesce((
        select sum(public.bebida_precio_base_pax(be.id) * f.factor_evento)
        from public.bebidas be
        where be.id = any(coalesce(p_bebida_ids, '{}'::uuid[]))
      ), 0)::numeric as bebida_total,
      coalesce((
        select sum(
          (coalesce(t.precio_coste_es_pax, 0)::numeric + coalesce(t.precio_coste_op_pax, 0)::numeric)
          * (1 + (coalesce(t.rentabilidad_unitaria::numeric, f.rent_anual, 0)
            + f.rent_espacio + f.rent_app) / 100)
          * f.factor_evento
        )
        from public.tematicas t
        where t.id = any(coalesce(p_tematica_ids, '{}'::uuid[]))
          and coalesce(t.activo, true)
      ), 0)::numeric as tematica_total,
      coalesce((
        select sum(
          (coalesce(a.precio_coste_es_pax, 0)::numeric + coalesce(a.precio_coste_op_pax, 0)::numeric)
          * (1 + (coalesce(a.rentabilidad_unitaria::numeric, f.rent_anual, 0)
            + f.rent_espacio + f.rent_app) / 100)
          * f.factor_evento
        )
        from public.adicionales a
        where a.id = any(coalesce(p_adicionales_ids, '{}'::uuid[]))
      ), 0)::numeric as adicional_total
    from factor f
  )
  select
    calendario_espacio_id,
    round(
      coalesce(
        case when invitados > 0 then precio_base_evento / invitados else 0 end,
        0
      )
      + gastro_total
      + bodega_total
      + bebida_total
      + tematica_total
      + adicional_total,
      2
    ) as precio_por_invitado
  from totals;
$function$;;

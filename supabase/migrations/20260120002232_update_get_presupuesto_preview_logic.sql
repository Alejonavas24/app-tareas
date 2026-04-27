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
      public.param_val('descuento_excedente')::numeric as desc_excedente_live,
      public.param_val('incremento_faltante')::numeric as inc_faltante_live,
      (select valor::numeric from public.parametros_app where item = 'descuento_excedente' limit 1) as desc_excedente_tbl,
      (select valor::numeric from public.parametros_app where item = 'incremento_faltante' limit 1) as inc_faltante_tbl,
      (select valor::numeric from public.parametros_app where item = 'rentabilidad_anual' limit 1) as rent_anual,
      (select valor::numeric from public.parametros_app where item = 'rentabilidad_app' limit 1) as rent_app
  ),
  cal_v as (
    select
      v.id as calendario_espacio_id,
      v.espacio_id,
      v.pax_minimo::numeric as pax_minimo_v,
      v.precio_base_evento::numeric as precio_base_evento
    from public.calendario_espacio_v v
    where v.id = any(p_calendario_espacio_ids)
  ),
  cal_raw as (
    select
      c.id as calendario_espacio_id,
      c.espacio_id,
      c.rentabilidad_unitaria::numeric as rent_cal,
      t.pax_minimo::numeric as pax_minimo_raw
    from public.calendario_espacio c
    left join public.temporalidad t
      on t.espacio = c.espacio_id
     and t.temporalidad_dia = c."temporalidad A"
     and t.temporalidad_mes = c.month::text
    where c.id = any(p_calendario_espacio_ids)
  ),
  esp as (
    select id, rentabilidad_unitaria::numeric as rent_espacio
    from public.espacios
  ),
  cal as (
    select
      v.calendario_espacio_id,
      v.espacio_id,
      v.pax_minimo_v,
      v.precio_base_evento,
      r.pax_minimo_raw,
      coalesce(r.rent_cal, e.rent_espacio, 0)::numeric as rent_espacio
    from cal_v v
    left join cal_raw r on r.calendario_espacio_id = v.calendario_espacio_id
    left join esp e on e.id = v.espacio_id
  ),
  factor as (
    select
      c.*,
      p.invitados,
      coalesce(p.desc_excedente_live, 0)::numeric as desc_excedente_live,
      coalesce(p.inc_faltante_live, 0)::numeric as inc_faltante_live,
      coalesce(p.desc_excedente_tbl, 0)::numeric as desc_excedente_tbl,
      coalesce(p.inc_faltante_tbl, 0)::numeric as inc_faltante_tbl,
      coalesce(p.rent_anual, 0)::numeric as rent_anual,
      coalesce(p.rent_app, 0)::numeric as rent_app,
      case
        when p.invitados is null or p.invitados <= 0 or c.pax_minimo_v is null then 1::numeric
        else (
          with base as (
            select case
              when p.invitados > c.pax_minimo_v then coalesce(p.desc_excedente_live, 0)
              when p.invitados < c.pax_minimo_v then coalesce(p.inc_faltante_live, 0)
              else 0
            end as base
          ),
          aplicado as (
            select case
              when base <> 0 then round(base - (base * c.pax_minimo_v) / p.invitados, 2)
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
      end as factor_menu,
      case
        when p.invitados is null or p.invitados <= 0 or c.pax_minimo_raw is null then 1::numeric
        else (
          with base as (
            select case
              when p.invitados > c.pax_minimo_raw then coalesce(p.desc_excedente_tbl, 0)
              when p.invitados < c.pax_minimo_raw then coalesce(p.inc_faltante_tbl, 0)
              else 0
            end as base
          ),
          aplicado as (
            select case
              when base <> 0 then round(base - (base * c.pax_minimo_raw) / p.invitados, 2)
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
      end as factor_tematica
    from cal c
    cross join params p
  ),
  totals as (
    select
      f.calendario_espacio_id,
      f.invitados,
      f.precio_base_evento,
      f.factor_menu,
      f.factor_tematica,
      f.rent_anual,
      f.rent_app,
      f.rent_espacio,
      coalesce((
        select sum(public.menu_precio_base_pax(m.id) * f.factor_menu)
        from public.menu m
        where m.id = any(coalesce(p_gastronomia_ids, '{}'::uuid[]))
      ), 0)::numeric as gastro_total,
      coalesce((
        select sum(public.bodega_precio_base_pax(b.id) * f.factor_menu)
        from public.bodega b
        where b.id = any(coalesce(p_bodega_ids, '{}'::uuid[]))
      ), 0)::numeric as bodega_total,
      coalesce((
        select sum(public.bebida_precio_base_pax(be.id) * f.factor_menu)
        from public.bebidas be
        where be.id = any(coalesce(p_bebida_ids, '{}'::uuid[]))
      ), 0)::numeric as bebida_total,
      coalesce((
        select sum(
          (coalesce(t.precio_coste_es_pax, 0)::numeric + coalesce(t.precio_coste_op_pax, 0)::numeric)
          * (1 + (coalesce(t.rentabilidad_unitaria::numeric, f.rent_anual, 0)
            + f.rent_espacio + f.rent_app) / 100)
          * f.factor_tematica
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
          * f.factor_tematica
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

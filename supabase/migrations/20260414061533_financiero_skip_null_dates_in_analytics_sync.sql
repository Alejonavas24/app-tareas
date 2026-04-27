create or replace function financiero.replace_analytics_tiempo_pax(p_rows jsonb, p_run_id uuid)
returns integer
language plpgsql
as $$
declare
  v_rows integer := 0;
begin
  truncate table financiero.analytics_re_vs_pr_tiempo_pax_daily;

  insert into financiero.analytics_re_vs_pr_tiempo_pax_daily (
    fecha,
    anio,
    mes,
    escenario,
    total,
    pax_contratados,
    sync_run_id,
    synced_at
  )
  select
    parsed_fecha,
    coalesce(nullif(row_item ->> 'anio', ''), extract(year from parsed_fecha)::text)::integer,
    coalesce(nullif(row_item ->> 'mes', ''), extract(month from parsed_fecha)::text)::integer,
    upper(coalesce(nullif(row_item ->> 'escenario', ''), 'REAL')),
    financiero.parse_analytics_numeric(coalesce(nullif(row_item ->> 'total', ''), '0')),
    financiero.parse_analytics_numeric(coalesce(nullif(row_item ->> 'pax_contratados', ''), nullif(row_item ->> 'pax', ''), '0')),
    p_run_id,
    now()
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as row_item
  cross join lateral (
    select nullif(row_item ->> 'fecha', '')::date as parsed_fecha
  ) d
  where parsed_fecha is not null;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

create or replace function financiero.replace_analytics_tipo_pax(p_rows jsonb, p_run_id uuid)
returns integer
language plpgsql
as $$
declare
  v_rows integer := 0;
begin
  truncate table financiero.analytics_re_vs_pr_tipo_pax_daily;

  insert into financiero.analytics_re_vs_pr_tipo_pax_daily (
    fecha,
    anio,
    mes,
    escenario,
    tipo,
    total,
    pax_contratados,
    sync_run_id,
    synced_at
  )
  select
    parsed_fecha,
    coalesce(nullif(row_item ->> 'anio', ''), extract(year from parsed_fecha)::text)::integer,
    coalesce(nullif(row_item ->> 'mes', ''), extract(month from parsed_fecha)::text)::integer,
    upper(coalesce(nullif(row_item ->> 'escenario', ''), 'REAL')),
    coalesce(nullif(row_item ->> 'tipo', ''), 'OTROS'),
    financiero.parse_analytics_numeric(coalesce(nullif(row_item ->> 'total', ''), '0')),
    financiero.parse_analytics_numeric(coalesce(nullif(row_item ->> 'pax_contratados', ''), nullif(row_item ->> 'pax', ''), '0')),
    p_run_id,
    now()
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as row_item
  cross join lateral (
    select nullif(row_item ->> 'fecha', '')::date as parsed_fecha
  ) d
  where parsed_fecha is not null;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;;

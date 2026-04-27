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
    nullif(row_item ->> 'fecha', '')::date,
    coalesce(nullif(row_item ->> 'anio', ''), extract(year from nullif(row_item ->> 'fecha', '')::date)::text)::integer,
    coalesce(nullif(row_item ->> 'mes', ''), extract(month from nullif(row_item ->> 'fecha', '')::date)::text)::integer,
    upper(coalesce(nullif(row_item ->> 'escenario', ''), 'REAL')),
    coalesce(nullif(row_item ->> 'total', ''), '0')::numeric,
    coalesce(nullif(row_item ->> 'pax_contratados', ''), nullif(row_item ->> 'pax', ''), '0')::numeric,
    p_run_id,
    now()
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as row_item;

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
    nullif(row_item ->> 'fecha', '')::date,
    coalesce(nullif(row_item ->> 'anio', ''), extract(year from nullif(row_item ->> 'fecha', '')::date)::text)::integer,
    coalesce(nullif(row_item ->> 'mes', ''), extract(month from nullif(row_item ->> 'fecha', '')::date)::text)::integer,
    upper(coalesce(nullif(row_item ->> 'escenario', ''), 'REAL')),
    coalesce(nullif(row_item ->> 'tipo', ''), 'OTROS'),
    coalesce(nullif(row_item ->> 'total', ''), '0')::numeric,
    coalesce(nullif(row_item ->> 'pax_contratados', ''), nullif(row_item ->> 'pax', ''), '0')::numeric,
    p_run_id,
    now()
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as row_item;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;;

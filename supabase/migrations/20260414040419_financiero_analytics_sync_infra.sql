create schema if not exists financiero;

create table if not exists financiero.analytics_sync_sources (
  id uuid primary key default extensions.gen_random_uuid(),
  source_key text not null unique,
  source_sql text not null,
  destination_key text not null,
  enabled boolean not null default true,
  full_refresh boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists financiero.analytics_sync_runs (
  id uuid primary key default extensions.gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running','success','failed','partial')),
  triggered_by text not null default 'manual',
  source_key text,
  message text,
  details jsonb not null default '{}'::jsonb,
  rows_loaded integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists financiero.analytics_re_vs_pr_tiempo_pax_daily (
  fecha date not null,
  anio integer,
  mes integer,
  escenario text not null,
  total numeric,
  pax_contratados numeric,
  sync_run_id uuid references financiero.analytics_sync_runs(id) on delete set null,
  synced_at timestamptz not null default now(),
  primary key (fecha, escenario)
);

create table if not exists financiero.analytics_re_vs_pr_tipo_pax_daily (
  fecha date not null,
  anio integer,
  mes integer,
  escenario text not null,
  tipo text not null,
  total numeric,
  pax_contratados numeric,
  sync_run_id uuid references financiero.analytics_sync_runs(id) on delete set null,
  synced_at timestamptz not null default now(),
  primary key (fecha, escenario, tipo)
);

create table if not exists financiero.zoho_analytics_oauth_cache (
  provider text primary key,
  access_token text,
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  last_refresh_error text
);

insert into financiero.analytics_sync_sources (source_key, source_sql, destination_key, notes)
values
  ('QT_VAL_RE_VS_PR_TIEMPO_PAX', 'select * from "QT_VAL_RE_VS_PR_TIEMPO_PAX"', 'tiempo_pax', 'Serie diaria para total vs pax'),
  ('QT_VAL_RE_VS_PR_TIPO_PAX', 'select * from "QT_VAL_RE_VS_PR_TIPO_PAX"', 'tipo_pax', 'Serie diaria por tipo para total vs pax')
on conflict (source_key) do update
set source_sql = excluded.source_sql,
    destination_key = excluded.destination_key,
    notes = excluded.notes,
    updated_at = now();

create or replace function financiero.secret_value(p_name text)
returns text
language sql
security definer
set search_path = ''
as $$
  select ds.decrypted_secret
  from vault.decrypted_secrets ds
  where ds.name = p_name
  limit 1;
$$;

create or replace function financiero.replace_analytics_tiempo_pax(p_rows jsonb, p_run_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  delete from financiero.analytics_re_vs_pr_tiempo_pax_daily;

  insert into financiero.analytics_re_vs_pr_tiempo_pax_daily (
    fecha, anio, mes, escenario, total, pax_contratados, sync_run_id, synced_at
  )
  select
    nullif(trim(x.fecha), '')::date,
    nullif(trim(x.anio), '')::integer,
    nullif(trim(x.mes), '')::integer,
    trim(x.escenario),
    nullif(replace(trim(x.total), ',', '.'), '')::numeric,
    nullif(replace(trim(x.pax_contratados), ',', '.'), '')::numeric,
    p_run_id,
    now()
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as x(
    fecha text,
    anio text,
    mes text,
    escenario text,
    total text,
    pax_contratados text
  )
  where nullif(trim(x.fecha), '') is not null
    and nullif(trim(x.escenario), '') is not null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function financiero.replace_analytics_tipo_pax(p_rows jsonb, p_run_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  delete from financiero.analytics_re_vs_pr_tipo_pax_daily;

  insert into financiero.analytics_re_vs_pr_tipo_pax_daily (
    fecha, anio, mes, escenario, tipo, total, pax_contratados, sync_run_id, synced_at
  )
  select
    nullif(trim(x.fecha), '')::date,
    nullif(trim(x.anio), '')::integer,
    nullif(trim(x.mes), '')::integer,
    trim(x.escenario),
    trim(x.tipo),
    nullif(replace(trim(x.total), ',', '.'), '')::numeric,
    nullif(replace(trim(x.pax_contratados), ',', '.'), '')::numeric,
    p_run_id,
    now()
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as x(
    fecha text,
    anio text,
    mes text,
    escenario text,
    tipo text,
    total text,
    pax_contratados text
  )
  where nullif(trim(x.fecha), '') is not null
    and nullif(trim(x.escenario), '') is not null
    and nullif(trim(x.tipo), '') is not null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function financiero.bucket_date(p_fecha date, p_grain text)
returns date
language sql
immutable
as $$
  select case lower(coalesce(p_grain, 'day'))
    when 'day' then p_fecha
    when 'week' then date_trunc('week', p_fecha::timestamp)::date
    when 'month' then date_trunc('month', p_fecha::timestamp)::date
    when 'quarter' then date_trunc('quarter', p_fecha::timestamp)::date
    when 'year' then date_trunc('year', p_fecha::timestamp)::date
    else p_fecha
  end;
$$;

create or replace function financiero.dashboard_re_vs_pr_pax(
  p_start date,
  p_end date,
  p_grain text default 'day'
)
returns table (
  periodo date,
  escenario text,
  total numeric,
  pax numeric,
  total_por_pax numeric
)
language sql
stable
as $$
  with base as (
    select
      financiero.bucket_date(fecha, p_grain) as periodo,
      escenario,
      sum(coalesce(total, 0)) as total,
      sum(coalesce(pax_contratados, 0)) as pax
    from financiero.analytics_re_vs_pr_tiempo_pax_daily
    where fecha between p_start and p_end
    group by 1, 2
  )
  select
    periodo,
    escenario,
    total,
    pax,
    case when coalesce(pax, 0) = 0 then null else total / pax end as total_por_pax
  from base
  order by periodo, escenario;
$$;

create or replace function financiero.dashboard_re_vs_pr_tipo_pax(
  p_start date,
  p_end date,
  p_grain text default 'day'
)
returns table (
  periodo date,
  escenario text,
  tipo text,
  total numeric,
  pax numeric,
  total_por_pax numeric
)
language sql
stable
as $$
  with base as (
    select
      financiero.bucket_date(fecha, p_grain) as periodo,
      escenario,
      tipo,
      sum(coalesce(total, 0)) as total,
      sum(coalesce(pax_contratados, 0)) as pax
    from financiero.analytics_re_vs_pr_tipo_pax_daily
    where fecha between p_start and p_end
    group by 1, 2, 3
  )
  select
    periodo,
    escenario,
    tipo,
    total,
    pax,
    case when coalesce(pax, 0) = 0 then null else total / pax end as total_por_pax
  from base
  order by periodo, escenario, tipo;
$$;

create or replace function financiero.dashboard_re_vs_pr_pax_resumen(
  p_start date,
  p_end date
)
returns table (
  total_real numeric,
  total_prevision numeric,
  pax_total numeric,
  real_por_pax numeric,
  prevision_por_pax numeric
)
language sql
stable
as $$
  with agg as (
    select
      sum(case when escenario = 'REAL' then coalesce(total, 0) else 0 end) as total_real,
      sum(case when escenario = 'PREVISION' then coalesce(total, 0) else 0 end) as total_prevision,
      sum(case when escenario = 'REAL' then coalesce(pax_contratados, 0) else 0 end) as pax_total
    from financiero.analytics_re_vs_pr_tiempo_pax_daily
    where fecha between p_start and p_end
  )
  select
    total_real,
    total_prevision,
    pax_total,
    case when coalesce(pax_total, 0) = 0 then null else total_real / pax_total end as real_por_pax,
    case when coalesce(pax_total, 0) = 0 then null else total_prevision / pax_total end as prevision_por_pax
  from agg;
$$;

select cron.schedule(
  'zoho_analytics_sync_every_6_hours',
  '0 */6 * * *',
  format($job$
    select net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-zoho-worker-secret', coalesce(financiero.secret_value('zoho_worker_secret'), '')
      ),
      body := jsonb_build_object('triggered_by', 'pg_cron'),
      timeout_milliseconds := 120000
    );
  $job$, 'https://ltljoocphqjoskstpwjb.supabase.co/functions/v1/zoho-analytics-sync')
);
;

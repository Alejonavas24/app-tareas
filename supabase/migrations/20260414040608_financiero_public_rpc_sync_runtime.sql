create or replace function public.financiero_get_sync_sources(p_source_key text default null)
returns table (
  source_key text,
  source_sql text,
  destination_key text,
  enabled boolean
)
language sql
security definer
set search_path = ''
as $$
  select s.source_key, s.source_sql, s.destination_key, s.enabled
  from financiero.analytics_sync_sources s
  where s.enabled = true
    and (p_source_key is null or s.source_key = p_source_key)
  order by s.source_key;
$$;

grant execute on function public.financiero_get_sync_sources(text) to anon, authenticated, service_role;

create or replace function public.financiero_create_sync_run(p_triggered_by text, p_source_key text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into financiero.analytics_sync_runs(triggered_by, source_key)
  values (coalesce(nullif(trim(p_triggered_by), ''), 'manual'), p_source_key)
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.financiero_create_sync_run(text, text) to anon, authenticated, service_role;

create or replace function public.financiero_finish_sync_run(
  p_run_id uuid,
  p_status text,
  p_message text default null,
  p_details jsonb default '{}'::jsonb,
  p_rows_loaded integer default 0
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update financiero.analytics_sync_runs
  set status = p_status,
      message = p_message,
      details = coalesce(p_details, '{}'::jsonb),
      rows_loaded = coalesce(p_rows_loaded, 0),
      finished_at = now()
  where id = p_run_id;
end;
$$;

grant execute on function public.financiero_finish_sync_run(uuid, text, text, jsonb, integer) to anon, authenticated, service_role;;

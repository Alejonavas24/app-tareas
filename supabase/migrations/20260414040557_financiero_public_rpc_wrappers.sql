create or replace function public.financiero_secret_value(p_name text)
returns text
language sql
security definer
set search_path = ''
as $$
  select financiero.secret_value(p_name);
$$;

grant execute on function public.financiero_secret_value(text) to anon, authenticated, service_role;

create or replace function public.financiero_replace_analytics_tiempo_pax(p_rows jsonb, p_run_id uuid)
returns integer
language sql
security definer
set search_path = ''
as $$
  select financiero.replace_analytics_tiempo_pax(p_rows, p_run_id);
$$;

grant execute on function public.financiero_replace_analytics_tiempo_pax(jsonb, uuid) to anon, authenticated, service_role;

create or replace function public.financiero_replace_analytics_tipo_pax(p_rows jsonb, p_run_id uuid)
returns integer
language sql
security definer
set search_path = ''
as $$
  select financiero.replace_analytics_tipo_pax(p_rows, p_run_id);
$$;

grant execute on function public.financiero_replace_analytics_tipo_pax(jsonb, uuid) to anon, authenticated, service_role;;

create or replace function public.financiero_dashboard_re_vs_pr_pax(
  p_start date,
  p_end date,
  p_grain text default 'month'
)
returns table (
  periodo date,
  escenario text,
  total numeric,
  pax numeric,
  total_por_pax numeric
)
language sql
security definer
set search_path = public, financiero
as $$
  select *
  from financiero.dashboard_re_vs_pr_pax(p_start, p_end, p_grain);
$$;

grant execute on function public.financiero_dashboard_re_vs_pr_pax(date, date, text) to anon, authenticated, service_role;

create or replace function public.financiero_dashboard_re_vs_pr_tipo_pax(
  p_start date,
  p_end date,
  p_grain text default 'month'
)
returns table (
  periodo date,
  tipo text,
  escenario text,
  total numeric,
  pax numeric,
  total_por_pax numeric
)
language sql
security definer
set search_path = public, financiero
as $$
  select *
  from financiero.dashboard_re_vs_pr_tipo_pax(p_start, p_end, p_grain);
$$;

grant execute on function public.financiero_dashboard_re_vs_pr_tipo_pax(date, date, text) to anon, authenticated, service_role;

create or replace function public.financiero_dashboard_re_vs_pr_pax_resumen(
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
security definer
set search_path = public, financiero
as $$
  select *
  from financiero.dashboard_re_vs_pr_pax_resumen(p_start, p_end);
$$;

grant execute on function public.financiero_dashboard_re_vs_pr_pax_resumen(date, date) to anon, authenticated, service_role;;

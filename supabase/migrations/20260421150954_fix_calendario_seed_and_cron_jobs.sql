-- Fix calendario seed functions and cron command drift.
-- Root cause:
-- 1) seed_* functions still inserted into removed column "estado".
-- 2) cal_espacio_crm_refresh_daily used CALL for a function (must use SELECT).
-- 3) sync_calendario_con_eventos_crm_all could fail on duplicate (espacio_id, fecha) rows from eventos_crm.

create or replace function public.seed_calendario_espacio(
  p_espacio_id uuid,
  p_start date,
  p_end date,
  p_estado text default 'libre'::text
)
returns void
language sql
security definer
set search_path = public
as $function$
  insert into public.calendario_espacio (espacio_id, fecha)
  select p_espacio_id, d::date
  from generate_series(p_start, p_end, interval '1 day') g(d)
  on conflict (espacio_id, fecha) do nothing;
$function$;

create or replace function public.seed_missing_days_2years()
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_today date := (now() at time zone 'UTC')::date;
  v_horizon date := ((now() at time zone 'UTC')::date + interval '2 years')::date;
begin
  insert into public.calendario_espacio (espacio_id, fecha)
  select e.id, d::date
  from public.espacios e
  cross join generate_series(v_today, v_horizon, interval '1 day') g(d)
  left join public.calendario_espacio c
    on c.espacio_id = e.id
   and c.fecha = g.d::date
  where c.id is null
  on conflict (espacio_id, fecha) do nothing;
end;
$function$;

create or replace function public.sync_calendario_con_eventos_crm_all()
returns void
language plpgsql
set search_path = public
as $function$
begin
  -- Enciende todos los pares presentes (deduplicados por espacio+fecha)
  insert into public.calendario_espacio (id, espacio_id, fecha, crm_ocupado, created_at)
  select gen_random_uuid(), x.id_espacio, x.fecha, true, now()
  from (
    select distinct e.id_espacio, e.fecha
    from public.eventos_crm e
    where e.id_espacio is not null
      and e.fecha is not null
  ) x
  on conflict (espacio_id, fecha) do update
    set crm_ocupado = true;

  -- Apaga donde ya no existan eventos
  update public.calendario_espacio c
  set crm_ocupado = false
  where c.crm_ocupado = true
    and not exists (
      select 1
      from public.eventos_crm e
      where e.id_espacio = c.espacio_id
        and e.fecha = c.fecha
    );
end;
$function$;

do $$
declare
  v_jobid bigint;
  v_schedule text;
begin
  select jobid, schedule
    into v_jobid, v_schedule
  from cron.job
  where jobname = 'cal_espacio_crm_refresh_daily'
  order by jobid
  limit 1;

  if v_jobid is not null then
    perform cron.alter_job(
      v_jobid,
      schedule := v_schedule,
      command := 'select public.sync_calendario_con_eventos_crm_all();',
      active := true
    );
  end if;
end
$$;

-- Immediate healing after deploy.
select public.seed_missing_days_2years();
select public.sync_calendario_con_eventos_crm_all();;

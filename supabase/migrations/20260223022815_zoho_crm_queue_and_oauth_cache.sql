create extension if not exists pgcrypto with schema extensions;

create table if not exists public.zoho_crm_sync_queue (
  id uuid primary key default extensions.gen_random_uuid(),
  event_external_id text not null unique,
  payload jsonb not null default '{}'::jsonb,
  sync_signature text not null default '',
  payload_hash text not null default '',
  component_hashes jsonb not null default '{}'::jsonb,
  route_max_rank integer not null default 0,
  priority integer not null default 0,
  status text not null default 'pending',
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_by text,
  locked_at timestamptz,
  last_success_at timestamptz,
  last_success_signature text,
  last_success_component_hashes jsonb not null default '{}'::jsonb,
  deal_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'zoho_crm_sync_queue_status_check'
      and conrelid = 'public.zoho_crm_sync_queue'::regclass
  ) then
    alter table public.zoho_crm_sync_queue
      add constraint zoho_crm_sync_queue_status_check
      check (status in ('pending', 'processing', 'retry', 'done', 'failed'));
  end if;
end
$$;

create index if not exists idx_zoho_crm_sync_queue_ready
  on public.zoho_crm_sync_queue (status, next_attempt_at, priority desc, route_max_rank desc, updated_at);

create index if not exists idx_zoho_crm_sync_queue_locked
  on public.zoho_crm_sync_queue (status, locked_at);

create index if not exists idx_zoho_crm_sync_queue_updated
  on public.zoho_crm_sync_queue (updated_at desc);

create table if not exists public.zoho_crm_oauth_cache (
  provider text primary key,
  access_token text,
  expires_at timestamptz,
  refresh_in_progress boolean not null default false,
  refresh_owner text,
  refresh_started_at timestamptz,
  last_refresh_error text,
  updated_at timestamptz not null default now()
);

insert into public.zoho_crm_oauth_cache (provider)
values ('zoho_crm')
on conflict (provider) do nothing;

create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_zoho_crm_sync_queue_updated_at on public.zoho_crm_sync_queue;
create trigger trg_zoho_crm_sync_queue_updated_at
before update on public.zoho_crm_sync_queue
for each row
execute function public.tg_set_updated_at();

drop trigger if exists trg_zoho_crm_oauth_cache_updated_at on public.zoho_crm_oauth_cache;
create trigger trg_zoho_crm_oauth_cache_updated_at
before update on public.zoho_crm_oauth_cache
for each row
execute function public.tg_set_updated_at();

create or replace function public.upsert_zoho_crm_sync_job(
  p_event_external_id text,
  p_payload jsonb,
  p_sync_signature text,
  p_payload_hash text,
  p_route_max_rank integer default 0,
  p_priority integer default 0,
  p_component_hashes jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.zoho_crm_sync_queue%rowtype;
  v_changed boolean := false;
  v_queued boolean := true;
  v_reason text := 'queued_new';
begin
  if coalesce(trim(p_event_external_id), '') = '' then
    raise exception 'event_external_id is required';
  end if;

  select *
  into v_row
  from public.zoho_crm_sync_queue
  where event_external_id = p_event_external_id
  for update;

  if not found then
    insert into public.zoho_crm_sync_queue (
      event_external_id,
      payload,
      sync_signature,
      payload_hash,
      component_hashes,
      route_max_rank,
      priority,
      status,
      next_attempt_at,
      attempts,
      last_error
    )
    values (
      p_event_external_id,
      coalesce(p_payload, '{}'::jsonb),
      coalesce(p_sync_signature, ''),
      coalesce(p_payload_hash, ''),
      coalesce(p_component_hashes, '{}'::jsonb),
      greatest(coalesce(p_route_max_rank, 0), 0),
      greatest(coalesce(p_priority, 0), 0),
      'pending',
      now(),
      0,
      null
    );

    v_changed := true;
    v_reason := 'queued_new';

    return jsonb_build_object(
      'changed', v_changed,
      'queued', v_queued,
      'reason', v_reason,
      'event_external_id', p_event_external_id
    );
  end if;

  if coalesce(v_row.sync_signature, '') = coalesce(p_sync_signature, '') then
    if v_row.status in ('pending', 'retry', 'processing', 'failed') then
      update public.zoho_crm_sync_queue
      set route_max_rank = greatest(v_row.route_max_rank, greatest(coalesce(p_route_max_rank, 0), 0)),
          priority = greatest(v_row.priority, greatest(coalesce(p_priority, 0), 0)),
          payload_hash = coalesce(nullif(p_payload_hash, ''), v_row.payload_hash),
          component_hashes = case
            when coalesce(p_component_hashes, '{}'::jsonb) = '{}'::jsonb then v_row.component_hashes
            else p_component_hashes
          end,
          payload = case
            when coalesce(p_payload, '{}'::jsonb) = '{}'::jsonb then v_row.payload
            else p_payload
          end,
          status = case when v_row.status = 'failed' then 'retry' else v_row.status end,
          next_attempt_at = case when v_row.status = 'failed' then now() else v_row.next_attempt_at end,
          last_error = case when v_row.status = 'failed' then null else v_row.last_error end,
          updated_at = now()
      where id = v_row.id;

      v_queued := true;
      v_reason := 'already_queued_same_signature';
    else
      v_queued := false;
      v_reason := 'unchanged_already_synced';
    end if;

    return jsonb_build_object(
      'changed', v_changed,
      'queued', v_queued,
      'reason', v_reason,
      'event_external_id', p_event_external_id
    );
  end if;

  update public.zoho_crm_sync_queue
  set payload = coalesce(p_payload, '{}'::jsonb),
      sync_signature = coalesce(p_sync_signature, ''),
      payload_hash = coalesce(p_payload_hash, ''),
      component_hashes = coalesce(p_component_hashes, '{}'::jsonb),
      route_max_rank = greatest(v_row.route_max_rank, greatest(coalesce(p_route_max_rank, 0), 0)),
      priority = greatest(v_row.priority, greatest(coalesce(p_priority, 0), 0)),
      status = case when v_row.status = 'processing' then 'retry' else 'pending' end,
      next_attempt_at = now(),
      locked_by = null,
      locked_at = null,
      last_error = null,
      updated_at = now()
  where id = v_row.id;

  v_changed := true;
  v_queued := true;
  v_reason := 'queued_updated';

  return jsonb_build_object(
    'changed', v_changed,
    'queued', v_queued,
    'reason', v_reason,
    'event_external_id', p_event_external_id
  );
end;
$$;

create or replace function public.claim_zoho_crm_sync_jobs(
  p_worker_id text,
  p_batch_size integer default 5
)
returns setof public.zoho_crm_sync_queue
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(trim(p_worker_id), '') = '' then
    raise exception 'worker_id is required';
  end if;

  return query
  with candidates as (
    select q.id
    from public.zoho_crm_sync_queue q
    where (
      (q.status in ('pending', 'retry') and q.next_attempt_at <= now())
      or (q.status = 'processing' and q.locked_at < now() - interval '2 minutes')
    )
      and coalesce(q.sync_signature, '') <> coalesce(q.last_success_signature, '')
    order by q.priority desc, q.route_max_rank desc, q.updated_at asc
    limit least(greatest(coalesce(p_batch_size, 1), 1), 25)
    for update skip locked
  )
  update public.zoho_crm_sync_queue q
  set status = 'processing',
      locked_by = p_worker_id,
      locked_at = now(),
      attempts = case when q.status = 'processing' then q.attempts else q.attempts + 1 end,
      updated_at = now()
  from candidates
  where q.id = candidates.id
  returning q.*;
end;
$$;

create or replace function public.mark_zoho_crm_sync_job_success(
  p_job_id uuid,
  p_worker_id text,
  p_deal_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.zoho_crm_sync_queue
  set status = 'done',
      next_attempt_at = now(),
      locked_by = null,
      locked_at = null,
      last_success_at = now(),
      last_success_signature = sync_signature,
      last_success_component_hashes = component_hashes,
      deal_id = coalesce(p_deal_id, deal_id),
      last_error = null,
      updated_at = now()
  where id = p_job_id
    and (locked_by = p_worker_id or p_worker_id is null);
end;
$$;

create or replace function public.mark_zoho_crm_sync_job_failure(
  p_job_id uuid,
  p_worker_id text,
  p_error text,
  p_retry_delay_seconds integer default 60,
  p_mark_failed_after integer default 15
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.zoho_crm_sync_queue
  set status = case
        when attempts >= greatest(1, coalesce(p_mark_failed_after, 15))
          then 'failed'
        else 'retry'
      end,
      next_attempt_at = case
        when attempts >= greatest(1, coalesce(p_mark_failed_after, 15))
          then now() + interval '1 day'
        else now() + make_interval(secs => greatest(5, coalesce(p_retry_delay_seconds, 60)))
      end,
      locked_by = null,
      locked_at = null,
      last_error = left(coalesce(p_error, 'unknown_error'), 4000),
      updated_at = now()
  where id = p_job_id
    and (locked_by = p_worker_id or p_worker_id is null);
end;
$$;

create or replace function public.acquire_zoho_crm_refresh_lock(
  p_owner text,
  p_stale_seconds integer default 90
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if coalesce(trim(p_owner), '') = '' then
    return false;
  end if;

  insert into public.zoho_crm_oauth_cache (provider)
  values ('zoho_crm')
  on conflict (provider) do nothing;

  update public.zoho_crm_oauth_cache
  set refresh_in_progress = true,
      refresh_owner = p_owner,
      refresh_started_at = now(),
      updated_at = now()
  where provider = 'zoho_crm'
    and (
      refresh_in_progress = false
      or refresh_started_at is null
      or refresh_started_at < now() - make_interval(secs => greatest(10, coalesce(p_stale_seconds, 90)))
    );

  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

create or replace function public.set_zoho_crm_access_token(
  p_owner text,
  p_access_token text,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if coalesce(trim(p_owner), '') = '' then
    return false;
  end if;

  update public.zoho_crm_oauth_cache
  set access_token = p_access_token,
      expires_at = p_expires_at,
      refresh_in_progress = false,
      refresh_owner = null,
      refresh_started_at = null,
      last_refresh_error = null,
      updated_at = now()
  where provider = 'zoho_crm'
    and refresh_owner = p_owner;

  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

create or replace function public.release_zoho_crm_refresh_lock(
  p_owner text,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.zoho_crm_oauth_cache
  set refresh_in_progress = false,
      refresh_owner = null,
      refresh_started_at = null,
      last_refresh_error = left(coalesce(p_error, ''), 2000),
      updated_at = now()
  where provider = 'zoho_crm'
    and (refresh_owner = p_owner or p_owner is null);
end;
$$;;

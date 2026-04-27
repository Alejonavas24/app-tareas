create or replace function public.invoke_zoho_crm_worker(
  p_batch_size integer default 8,
  p_worker_url text default 'https://ltljoocphqjoskstpwjb.supabase.co/functions/v1/zoho-crm-worker'
)
returns bigint
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_worker_secret text;
  v_service_role text;
  v_headers jsonb;
  v_request_id bigint;
begin
  if coalesce(trim(p_worker_url), '') = '' then
    return null;
  end if;

  select decrypted_secret
  into v_worker_secret
  from vault.decrypted_secrets
  where lower(name) = 'zoho_worker_secret'
  order by updated_at desc
  limit 1;

  if coalesce(trim(v_worker_secret), '') = '' then
    -- Worker secret not configured in Vault yet.
    return null;
  end if;

  select decrypted_secret
  into v_service_role
  from vault.decrypted_secrets
  where lower(name) = 'supabase_service_role_key'
  order by updated_at desc
  limit 1;

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-worker-secret', v_worker_secret
  );

  if coalesce(trim(v_service_role), '') <> '' then
    v_headers := v_headers || jsonb_build_object('Authorization', 'Bearer ' || v_service_role);
  end if;

  select net.http_post(
    url := p_worker_url,
    headers := v_headers,
    body := jsonb_build_object('batch_size', greatest(1, least(25, coalesce(p_batch_size, 8))))
  )
  into v_request_id;

  return v_request_id;
end;
$$;

grant execute on function public.invoke_zoho_crm_worker(integer, text) to service_role;

do $$
begin
  if not exists (
    select 1
    from cron.job
    where jobname = 'zoho_crm_worker_every_minute'
  ) then
    perform cron.schedule(
      'zoho_crm_worker_every_minute',
      '* * * * *',
      $job$select public.invoke_zoho_crm_worker(8);$job$
    );
  end if;
end
$$;;

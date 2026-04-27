create or replace function public.financiero_get_zoho_analytics_oauth_cache()
returns table (
  access_token text,
  expires_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select c.access_token, c.expires_at
  from financiero.zoho_analytics_oauth_cache c
  where c.provider = 'zoho_analytics'
  limit 1;
$$;

grant execute on function public.financiero_get_zoho_analytics_oauth_cache() to anon, authenticated, service_role;

create or replace function public.financiero_upsert_zoho_analytics_oauth_cache(
  p_access_token text,
  p_expires_at timestamptz,
  p_last_refresh_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into financiero.zoho_analytics_oauth_cache(provider, access_token, expires_at, updated_at, last_refresh_error)
  values ('zoho_analytics', p_access_token, p_expires_at, now(), p_last_refresh_error)
  on conflict (provider) do update
  set access_token = excluded.access_token,
      expires_at = excluded.expires_at,
      updated_at = now(),
      last_refresh_error = excluded.last_refresh_error;
end;
$$;

grant execute on function public.financiero_upsert_zoho_analytics_oauth_cache(text, timestamptz, text) to anon, authenticated, service_role;;

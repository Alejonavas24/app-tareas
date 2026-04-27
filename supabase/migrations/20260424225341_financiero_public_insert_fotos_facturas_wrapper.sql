create or replace function public.financiero_insert_foto_factura(
  p_fecha_factura date,
  p_total numeric,
  p_nif_proveedor text,
  p_id_registro_crm bigint,
  p_link_supabase text,
  p_foto_procesada boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into financiero.fotos_facturas (
    fecha_factura,
    total,
    nif_proveedor,
    id_registro_crm,
    link_supabase,
    foto_procesada
  ) values (
    p_fecha_factura,
    p_total,
    p_nif_proveedor,
    p_id_registro_crm,
    p_link_supabase,
    p_foto_procesada
  )
  returning id into v_id;

  return v_id;
end;
$$;
grant execute on function public.financiero_insert_foto_factura(date, numeric, text, bigint, text, boolean)
to anon, authenticated, service_role;

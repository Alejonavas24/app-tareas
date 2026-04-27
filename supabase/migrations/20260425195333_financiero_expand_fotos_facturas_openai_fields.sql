alter table financiero.fotos_facturas
  add column if not exists nombre_empresa text,
  add column if not exists numero_factura text,
  add column if not exists direccion text,
  add column if not exists total_sin_iva numeric(12,2),
  add column if not exists iva_aplicado numeric(6,2),
  add column if not exists valor_iva numeric(12,2),
  add column if not exists porcentaje_retencion numeric(6,2),
  add column if not exists valor_retencion numeric(12,2),
  add column if not exists metodo_pago text;
drop function if exists public.financiero_insert_foto_factura(date, numeric, text, bigint, text, boolean);
create or replace function public.financiero_insert_foto_factura(
  p_fecha_factura date,
  p_total numeric,
  p_nif_proveedor text,
  p_id_registro_crm bigint,
  p_link_supabase text,
  p_foto_procesada boolean,
  p_nombre_empresa text,
  p_numero_factura text,
  p_direccion text,
  p_total_sin_iva numeric,
  p_iva_aplicado numeric,
  p_valor_iva numeric,
  p_porcentaje_retencion numeric,
  p_valor_retencion numeric,
  p_metodo_pago text
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
    foto_procesada,
    nombre_empresa,
    numero_factura,
    direccion,
    total_sin_iva,
    iva_aplicado,
    valor_iva,
    porcentaje_retencion,
    valor_retencion,
    metodo_pago
  ) values (
    p_fecha_factura,
    p_total,
    p_nif_proveedor,
    p_id_registro_crm,
    p_link_supabase,
    p_foto_procesada,
    p_nombre_empresa,
    p_numero_factura,
    p_direccion,
    p_total_sin_iva,
    p_iva_aplicado,
    p_valor_iva,
    p_porcentaje_retencion,
    p_valor_retencion,
    p_metodo_pago
  )
  returning id into v_id;

  return v_id;
end;
$$;
grant execute on function public.financiero_insert_foto_factura(
  date,
  numeric,
  text,
  bigint,
  text,
  boolean,
  text,
  text,
  text,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric,
  text
) to anon, authenticated, service_role;

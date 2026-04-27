create extension if not exists pgcrypto;
create schema if not exists financiero;
create table if not exists financiero.fotos_facturas (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  fecha_factura date null,
  total numeric(12,2) null,
  nif_proveedor text null,
  id_registro_crm bigint null,
  link_supabase text not null,
  foto_procesada boolean not null default false
);
insert into storage.buckets (id, name, public)
values ('fotos-facturas', 'fotos-facturas', true)
on conflict (id)
do update set
  name = excluded.name,
  public = excluded.public;

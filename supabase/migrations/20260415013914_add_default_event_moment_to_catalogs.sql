alter table public.menu
  add column if not exists default_event_moment text;

alter table public.bebidas
  add column if not exists default_event_moment text;

alter table public.bodega
  add column if not exists default_event_moment text;

alter table public.adicionales
  add column if not exists default_event_moment text;

alter table public.tematicas
  add column if not exists default_event_moment text;

comment on column public.menu.default_event_moment is
  'Momento del evento por defecto sugerido para el item (ceremonia, coctel, banquete, fiesta).';

comment on column public.bebidas.default_event_moment is
  'Momento del evento por defecto sugerido para el item (ceremonia, coctel, banquete, fiesta).';

comment on column public.bodega.default_event_moment is
  'Momento del evento por defecto sugerido para el item (ceremonia, coctel, banquete, fiesta).';

comment on column public.adicionales.default_event_moment is
  'Momento del evento por defecto sugerido para el item (ceremonia, coctel, banquete, fiesta).';

comment on column public.tematicas.default_event_moment is
  'Momento del evento por defecto sugerido para el item (ceremonia, coctel, banquete, fiesta).';

update public.menu
set default_event_moment = 'coctel'
where default_event_moment is null
  and tipologia in ('Aperitivo', 'Puesto');

update public.menu
set default_event_moment = 'banquete'
where default_event_moment is null
  and tipologia in ('Entrante', 'Primero', 'Segundo', 'Postre');

update public.bebidas
set default_event_moment = 'fiesta'
where default_event_moment is null
  and "tipología" = 'Barra libre';

update public.bebidas
set default_event_moment = 'coctel'
where default_event_moment is null
  and "tipología" = 'Rincón';

update public.bebidas
set default_event_moment = 'banquete'
where default_event_moment is null
  and (
    nombre ilike '%cafe%'
    or nombre ilike '%infusion%'
    or nombre ilike '%sorbete%'
  );

update public.bebidas
set default_event_moment = 'coctel'
where default_event_moment is null
  and nombre ilike '%cerveza%';

update public.bebidas
set default_event_moment = 'fiesta'
where nombre ilike '%mojito%'
  or nombre ilike '%gin tonic%';

update public.adicionales
set default_event_moment = 'ceremonia'
where default_event_moment is null
  and "tipología" = 'Boda civil'
  and nombre in ('Boda civil clásico', 'Boda civil premium');

update public.adicionales
set default_event_moment = 'coctel'
where default_event_moment is null
  and (
    nombre ilike 'Mobiliario cóctel%'
    or nombre ilike 'Mobiliario coctel%'
  );

update public.adicionales
set default_event_moment = 'fiesta'
where default_event_moment is null
  and (
    nombre ilike '%resopón%'
    or nombre ilike '%resopon%'
    or nombre ilike '%horchata%'
    or nombre ilike '%candy bar%'
  );

update public.adicionales
set default_event_moment = 'banquete'
where default_event_moment is null
  and nombre ilike '%tarta%';

update public.tematicas
set default_event_moment = 'ceremonia'
where default_event_moment is null
  and nombre ilike 'Limonada';

create or replace view planner.catalogo_v as
  select
    'menu'::text as source_type,
    mp.id as source_id,
    mp.nombre as name,
    mp.marca as brand,
    mp.tipologia as category,
    mp."terminación" as subcategory,
    mp.descripcion as description,
    coalesce(mp.precio, 0)::numeric(12,2) as unit_price,
    (coalesce(m.impuesto, 10)::numeric / 100::numeric) as vat_rate,
    coalesce(mp.unidades_por_pax, 1)::numeric(10,2) as units_per_pax,
    'pax'::text as unit_label,
    coalesce(mp.activo, true) as active,
    mp.orden as sort_order,
    m.categoria_adicional as additional_category,
    m.default_event_moment
  from public.menu_precios_v mp
  left join public.menu m
    on m.id = mp.id

  union all

  select
    'bebidas'::text as source_type,
    b.id as source_id,
    b.nombre as name,
    b.marca as brand,
    b."tipología" as category,
    null::text as subcategory,
    null::text as description,
    coalesce(b.precio, 0)::numeric(12,2) as unit_price,
    (coalesce(b.impuesto, 10)::numeric / 100::numeric) as vat_rate,
    coalesce(b.unidades_por_pax, 1)::numeric(10,2) as units_per_pax,
    'pax'::text as unit_label,
    coalesce(b.activo, true) as active,
    b.orden as sort_order,
    b.categoria_adicional as additional_category,
    b.default_event_moment
  from public.bebidas b

  union all

  select
    'bodega'::text as source_type,
    bg.id as source_id,
    bg.nombre as name,
    bg.bodega as brand,
    bg."tipología" as category,
    bg.envejecimiento as subcategory,
    bg.origen as description,
    coalesce(bg.precio, 0)::numeric(12,2) as unit_price,
    (coalesce(bg.impuesto, 10)::numeric / 100::numeric) as vat_rate,
    coalesce(bg.unidades_por_pax, 1)::numeric(10,2) as units_per_pax,
    'pax'::text as unit_label,
    coalesce(bg.activo, true) as active,
    bg.orden as sort_order,
    bg.categoria_adicional as additional_category,
    bg.default_event_moment
  from public.bodega bg

  union all

  select
    'adicionales'::text as source_type,
    a.id as source_id,
    a.nombre as name,
    a.marca as brand,
    a."tipología" as category,
    null::text as subcategory,
    a.descripcion as description,
    coalesce(a.precio, 0)::numeric(12,2) as unit_price,
    (coalesce(a.impuesto, 10)::numeric / 100::numeric) as vat_rate,
    1::numeric(10,2) as units_per_pax,
    'servicio'::text as unit_label,
    coalesce(a.activo, true) as active,
    a.orden as sort_order,
    null::text as additional_category,
    a.default_event_moment
  from public.adicionales a

  union all

  select
    'tematicas'::text as source_type,
    t.id as source_id,
    t.nombre as name,
    t.marca as brand,
    t.nombre as category,
    null::text as subcategory,
    t.descripcion as description,
    coalesce(t.precio, 0)::numeric(12,2) as unit_price,
    (coalesce(t.impuesto, 10)::numeric / 100::numeric) as vat_rate,
    1::numeric(10,2) as units_per_pax,
    'servicio'::text as unit_label,
    coalesce(t.activo, true) as active,
    t.orden::integer as sort_order,
    null::text as additional_category,
    t.default_event_moment
  from public.tematicas t;;

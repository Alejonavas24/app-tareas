create schema if not exists financiero;

create table if not exists financiero."Contactos (Zoho CRM)" (
  "Id" text,
  "Apellidos" text,
  "Propietario de Contacto" text,
  "Propietario de Contacto Name" text,
  "Nombre de Cuenta" text,
  "Correo electrónico" text,
  "Fuente de Posible cliente" text,
  "Hora de creación" timestamptz,
  "Nombre completo" text,
  "Hora de modificación" timestamptz,
  "Subordinado de" text,
  "Nombre" text,
  "Género" text,
  "Teléfono" text,
  "Nombre de Proveedor" text
);

create table if not exists financiero."Espacios (Zoho CRM)" (
  "Id" text,
  "Hora de creación" timestamptz,
  "Hora de modificación" timestamptz,
  "Nombre de Espacio" text,
  "Espacio Propietario" text,
  "Espacio Propietario Name" text,
  "CIF Sociedad" text,
  "Ciudad del Espacio" text,
  "Cuenta Bancaria Sociedad" text,
  "Dirección" text,
  "Id Supabase" text,
  "Sociedad" text,
  "Sociedad." text
);

create table if not exists financiero."Sociedades (Zoho CRM)" (
  "Id" text,
  "Abreviatura" text,
  "CIF" text,
  "Codigo" text,
  "Hora de creación" timestamptz,
  "cuenta qonto" text,
  "idAnfix" text,
  "idSupabase" text,
  "Hora de modificación" timestamptz,
  "Nombre de Sociedad" text,
  "Nombre en Anfix" text,
  "Sociedad Propietario" text,
  "Sociedad Propietario Name" text,
  "VersionDiaBQ" text,
  "Tipo de sociedad" text
);

create table if not exists financiero."Tratos (Zoho CRM)" (
  "Id" text,
  "Nombre de Trato" text,
  "Fecha contratada Evento" date,
  "Fecha Cierre" date,
  "Tipo de evento" text,
  "Espacio Contratado" text,
  "Pax Contratados" numeric,
  "Invitados adultos real" numeric,
  "Valor de reserva" numeric,
  "Fase" text,
  "Canal" text
);

create table if not exists financiero."DB_RFV2" (
  "digito_1" text,
  "digitos_4" text,
  "contrapartida" text,
  "referencia_contrapartida" text,
  "digitos_3" text,
  "mapping" text,
  "mapping_0" text,
  "mapping_1" text,
  "concepto" text,
  "subconcepto" text
);

create table if not exists financiero."diario_anfix_general" (
  "anfix_id" text,
  "company_id" text,
  "abreviatura" text,
  "entry_id" text,
  "note_id" text,
  "fecha" date,
  "asiento" text,
  "apunte" text,
  "subcuenta" text,
  "descripcion" text,
  "concepto" text,
  "debe" numeric,
  "haber" numeric,
  "sync_batch_id" text,
  "row_hash" text,
  "inserted_at" timestamptz,
  "updated_at" timestamptz
);

create table if not exists financiero."HI_PA_PV" (
  "fecha" date,
  "asiento" text,
  "apunte" text,
  "subcuenta" text,
  "descripcion" text,
  "concepto" text,
  "debe" numeric,
  "haber" numeric,
  "total" numeric,
  "sociedad" text,
  "tipo_de_dato" text,
  "mapping_0" text,
  "mapping" text,
  "subconcepto" text
);

create table if not exists financiero."HI_PR_CO" (
  "clase" text,
  "sociedad" text,
  "mapping" text,
  "subconcepto" text,
  "estado" text,
  "fecha" date,
  "valor" numeric,
  "tipo_de_evento" text
);

create table if not exists financiero."HI_PR_GA_2" (
  "sociedad" text,
  "mapping" text,
  "subconcepto" text,
  "valor_2024" text,
  "ajuste_2025" text,
  "valor_2025" text,
  "ajuste_2026" text,
  "valor_2026" text,
  "ajuste_2027" text,
  "valor_2027" text
);

create table if not exists financiero."HI_PR_IN" (
  "concepto" text,
  "tipo" text,
  "valor" numeric,
  "periodo" int,
  "mes" text
);

create table if not exists financiero."HI_PR_PJ" (
  "sociedad" text,
  "mapping" text,
  "subconcepto" text,
  "descripcion" text,
  "estado" text,
  "fecha" date,
  "valor" numeric
);

create or replace view financiero."QT_Calendario_Mensual" as
select (date_trunc('month', d)::date + interval '1 month - 1 day')::date as "fecha"
from generate_series(date '2024-01-01', date '2027-12-01', interval '1 month') d;

create or replace view financiero."QT_Espacios_Sociedades" as
select
  E."Id" as "espacio_id",
  E."Nombre de Espacio" as "nombre_espacio_crm",
  trim(replace(E."Nombre de Espacio", ' by Bonho', '')) as "espacio_join",
  E."Sociedad." as "sociedad_id",
  S."Codigo" as "sociedad_codigo",
  S."Abreviatura" as "sociedad_abreviatura",
  S."Nombre de Sociedad" as "sociedad_nombre"
from financiero."Espacios (Zoho CRM)" E
left join financiero."Sociedades (Zoho CRM)" S on E."Sociedad." = S."Id";

create or replace view financiero."QT_Tratos_Ganados_Base" as
select
  T."Id" as "ID_de_registro",
  T."Nombre de Trato" as "Nombre_de_Trato",
  T."Fecha contratada Evento" as "Fecha_contratada_Evento",
  T."Fecha Cierre" as "Fecha_Cierre",
  T."Tipo de evento" as "Tipo_de_evento",
  T."Espacio Contratado" as "Espacio_Contratado",
  ES."sociedad_codigo" as "Sociedad_Espacio",
  coalesce(T."Pax Contratados", 0) as "Pax_Contratados",
  coalesce(T."Invitados adultos real", 0) as "Pax_Reales",
  T."Valor de reserva" as "Valor_reserva_raw",
  T."Fase" as "Fase",
  T."Canal" as "Canal"
from financiero."Tratos (Zoho CRM)" T
left join financiero."QT_Espacios_Sociedades" ES
  on trim(replace(T."Espacio Contratado", ' by Bonho', '')) = ES."espacio_join"
where T."Fase" = 'Cerrado ganado'
  and T."Canal" = 'KAM';

create or replace view financiero."QT_RE_v3" as
with all_data as (
  select "fecha", "asiento", "apunte", "subcuenta", "descripcion", "concepto", "debe", "haber"
  from financiero."diario_anfix_general"
), filtered_data as (
  select
    A."fecha" as "fecha",
    A."asiento" as "asiento",
    A."apunte" as "apunte",
    A."subcuenta" as "subcuenta",
    A."subcuenta"::text as "subcuenta_txt",
    A."descripcion" as "descripcion",
    A."concepto" as "concepto",
    coalesce(A."debe", 0) as "debe",
    coalesce(A."haber", 0) as "haber"
  from all_data A
  where length(A."subcuenta"::text) = 10
    and A."subcuenta"::text >= '6000000000'
    and A."subcuenta"::text <= '9999999999'
    and A."subcuenta"::text not like '68%'
    and not (A."subcuenta"::text like '7%' and substring(A."subcuenta"::text, 9, 1) > '0')
    and A."subcuenta"::text not like '6070__9%'
    and coalesce(trim(A."concepto"), '') <> 'Asiento de Regularización'
), db_rf_unico as (
  select
    "digitos_4"::text as "digitos_4_txt",
    "referencia_contrapartida"::text as "referencia_contrapartida_txt",
    min("mapping") as "mapping",
    min("subconcepto") as "subconcepto"
  from financiero."DB_RFV2"
  group by "digitos_4"::text, "referencia_contrapartida"::text
)
select
  F."fecha" as "fecha",
  F."asiento" as "asiento",
  F."apunte" as "apunte",
  F."subcuenta" as "subcuenta",
  F."descripcion" as "descripcion",
  F."concepto" as "concepto",
  F."debe" as "debe",
  F."haber" as "haber",
  (-F."debe" + F."haber") as "total",
  substring(F."subcuenta_txt", 6, 1) as "sociedad",
  case when F."subcuenta_txt" < '6000000000' then 'BS' else 'PL' end as "mapping_0",
  D."mapping" as "mapping",
  D."subconcepto" as "subconcepto",
  'RE'::text as "tipo_de_dato"
from filtered_data F
left join db_rf_unico D
  on substring(F."subcuenta_txt", 1, 4) = D."digitos_4_txt"
  and (substring(F."subcuenta_txt", 1, 4) || substring(F."subcuenta_txt", 7, 4)) = D."referencia_contrapartida_txt";

create or replace view financiero."QT_HI_PR_GA_2_NUM" as
select
  "sociedad"::text as "sociedad",
  trim("mapping") as "mapping",
  trim("subconcepto") as "subconcepto",
  case
    when "ajuste_2025" is null then 1
    when trim("ajuste_2025"::text) in ('', '#DIV/0!', '-', 'N/A', 'NA', 'NULL') then 1
    else replace(trim("ajuste_2025"::text), ',', '.')::numeric(18,6)
  end as "ajuste_2025",
  case
    when "ajuste_2026" is null then 1
    when trim("ajuste_2026"::text) in ('', '#DIV/0!', '-', 'N/A', 'NA', 'NULL') then 1
    else replace(trim("ajuste_2026"::text), ',', '.')::numeric(18,6)
  end as "ajuste_2026"
from financiero."HI_PR_GA_2"
where "sociedad" is not null
  and "mapping" is not null
  and "subconcepto" is not null;

create or replace view financiero."QT_GA_REAL_2024_BASE" as
select
  "fecha" as "fecha",
  "sociedad"::text as "sociedad",
  "mapping_0" as "mapping_0",
  trim("mapping") as "mapping",
  trim("subconcepto") as "subconcepto",
  sum("total") as "total_base"
from financiero."QT_RE_v3"
where extract(year from "fecha") = 2024
  and "mapping" is not null
  and "subconcepto" is not null
  and trim("subconcepto") <> ''
  and "total" is not null
  and "subcuenta"::text >= '6110000000'
  and "subcuenta"::text <= '6999999999'
  and "mapping" not in ('06. Gastos de personal', '19. Impuestos sobre beneficios')
group by "fecha", "sociedad", "mapping_0", trim("mapping"), trim("subconcepto")
having abs(sum("total")) > 0.01;

create or replace view financiero."QT_VF_PR_GA_2025" as
select
  (B."fecha" + interval '1 year')::date as "fecha",
  round(B."total_base" * coalesce(H."ajuste_2025", 1), 2) as "total",
  B."sociedad" as "sociedad",
  'HI'::text as "tipo_de_dato",
  B."mapping_0" as "mapping_0",
  B."mapping" as "mapping",
  B."subconcepto" as "subconcepto"
from financiero."QT_GA_REAL_2024_BASE" B
left join financiero."QT_HI_PR_GA_2_NUM" H
  on B."sociedad" = H."sociedad"
  and trim(B."mapping") = trim(H."mapping")
  and trim(B."subconcepto") = trim(H."subconcepto")
where abs(round(B."total_base" * coalesce(H."ajuste_2025", 1), 2)) > 0.01;

create or replace view financiero."QT_PR_CO_Hipotesis_Activas_v2" as
with hipotesis_con_intervalos as (
  select
    H."clase" as "clase",
    H."sociedad" as "sociedad",
    H."mapping" as "mapping",
    H."subconcepto" as "subconcepto",
    H."estado" as "estado",
    H."fecha" as "fecha_inicio",
    H."valor" as "valor_hipotesis",
    H."tipo_de_evento" as "tipo_de_evento",
    lead(H."fecha") over (partition by H."mapping", H."subconcepto" order by H."fecha") as "fecha_fin_siguiente"
  from financiero."HI_PR_CO" H
  where H."estado" in ('on', 'off')
    and H."fecha" is not null
)
select
  H."clase" as "clase",
  H."sociedad" as "sociedad",
  H."mapping" as "mapping",
  H."subconcepto" as "subconcepto",
  H."fecha_inicio" as "fecha_inicio",
  H."fecha_fin_siguiente" as "fecha_fin",
  H."valor_hipotesis" as "valor_hipotesis",
  H."tipo_de_evento" as "tipo_de_evento"
from hipotesis_con_intervalos H
where H."estado" = 'on';

create or replace view financiero."QT_PR_CO_Eventos_Base_v2" as
select
  T."ID_de_registro" as "ID_de_registro",
  T."Fecha_contratada_Evento" as "Fecha_contratada_Evento",
  T."Tipo_de_evento" as "evento_tipo",
  T."Nombre_de_Trato" as "Nombre_de_Trato",
  T."Espacio_Contratado" as "Espacio_Contratado",
  coalesce(T."Sociedad_Espacio", '0') as "Sociedad_Espacio",
  coalesce(T."Pax_Contratados", 0) as "Pax_Contratados",
  H."clase" as "clase",
  H."sociedad" as "sociedad_hipotesis",
  H."mapping" as "mapping",
  H."subconcepto" as "subconcepto",
  H."fecha_inicio" as "fecha_inicio",
  H."fecha_fin" as "fecha_fin",
  H."valor_hipotesis" as "valor_hipotesis",
  coalesce(DP."valor", 0) as "dias_pago_final",
  coalesce(MEP."valor", 1) as "margen_error_pax"
from financiero."QT_Tratos_Ganados_Base" T
left join financiero."QT_PR_CO_Hipotesis_Activas_v2" H
  on T."Tipo_de_evento" = H."tipo_de_evento"
  and T."Fecha_contratada_Evento" >= H."fecha_inicio"
  and (T."Fecha_contratada_Evento" <= H."fecha_fin" or H."fecha_fin" is null)
left join financiero."HI_PR_IN" DP
  on T."Tipo_de_evento" = DP."tipo"
  and extract(year from T."Fecha_contratada_Evento") = DP."periodo"
  and DP."concepto" = 'Dias pago final'
left join financiero."HI_PR_IN" MEP
  on T."Tipo_de_evento" = MEP."tipo"
  and extract(year from T."Fecha_contratada_Evento") = MEP."periodo"
  and MEP."concepto" = 'Margen error pax'
where T."Fecha_contratada_Evento" is not null;

create or replace view financiero."QT_PR_CO_v2" as
select
  (B."Fecha_contratada_Evento" - (B."dias_pago_final" * interval '1 day'))::date as "fecha",
  (-1 * coalesce(B."Pax_Contratados" * B."margen_error_pax" * B."valor_hipotesis", 0)) as "total",
  B."Sociedad_Espacio" as "sociedad",
  'PR'::text as "tipo_de_dato",
  'PL'::text as "mapping_0",
  B."mapping" as "mapping",
  B."subconcepto" as "subconcepto"
from financiero."QT_PR_CO_Eventos_Base_v2" B
where B."mapping" is not null
  and B."subconcepto" is not null;

create or replace view financiero."QT_IN_CE" as
with hi_in as (
  select
    HI."tipo" as "tipo",
    HI."periodo" as "periodo",
    max(case when HI."concepto" = 'Dias pago parcial' then HI."valor" end) as "dias_pago_parcial",
    max(case when HI."concepto" = 'Dias pago final' then HI."valor" end) as "dias_pago_final",
    max(case when HI."concepto" = 'Margen error pax' then HI."valor" end) as "margen_error_pax",
    max(case when HI."concepto" = 'Ticket medio' then HI."valor" end) as "ticket_medio",
    max(case when HI."concepto" = 'Importe pago parcial' then HI."valor" end) as "importe_pago_parcial",
    max(case when HI."concepto" = 'Importe pago final' then HI."valor" end) as "importe_pago_final"
  from financiero."HI_PR_IN" HI
  group by HI."tipo", HI."periodo"
), eventos as (
  select
    T."ID_de_registro" as "ID_de_registro",
    T."Fecha_contratada_Evento" as "Fecha_contratada_Evento",
    T."Tipo_de_evento" as "Tipo_de_evento",
    coalesce(T."Pax_Contratados", 0) as "Pax_Contratados",
    T."Nombre_de_Trato" as "Nombre_de_Trato",
    T."Espacio_Contratado" as "Espacio_Contratado",
    coalesce(T."Sociedad_Espacio", '0') as "Sociedad_Espacio",
    coalesce(H."dias_pago_parcial", 0) as "dias_pago_parcial",
    coalesce(H."dias_pago_final", 0) as "dias_pago_final",
    coalesce(H."margen_error_pax", 1) as "margen_error_pax",
    coalesce(H."ticket_medio", 1) as "ticket_medio",
    coalesce(H."importe_pago_parcial", 0) as "importe_pago_parcial",
    coalesce(H."importe_pago_final", 1) as "importe_pago_final"
  from financiero."QT_Tratos_Ganados_Base" T
  left join hi_in H
    on T."Tipo_de_evento" = H."tipo"
    and extract(year from T."Fecha_contratada_Evento") = H."periodo"
  where T."Fecha_contratada_Evento" is not null
    and T."Tipo_de_evento" in ('Boda', 'Evento')
)
select
  (E."Fecha_contratada_Evento" - (E."dias_pago_parcial" * interval '1 day'))::date as "fecha",
  ((E."Pax_Contratados" * E."margen_error_pax" * E."ticket_medio" * E."importe_pago_parcial") - 2000) as "total",
  E."Sociedad_Espacio" as "sociedad",
  'PR'::text as "tipo_de_dato",
  'PL'::text as "mapping_0",
  '01. Importe neto de la cifra de negocios'::text as "mapping",
  'Liquidacion parcial'::text as "subconcepto"
from eventos E
where E."Tipo_de_evento" = 'Boda'
union all
select
  (E."Fecha_contratada_Evento" - (E."dias_pago_final" * interval '1 day'))::date as "fecha",
  (E."Pax_Contratados" * E."margen_error_pax" * E."ticket_medio" * E."importe_pago_final") as "total",
  E."Sociedad_Espacio" as "sociedad",
  'PR'::text as "tipo_de_dato",
  'PL'::text as "mapping_0",
  '01. Importe neto de la cifra de negocios'::text as "mapping",
  'Liquidacion final'::text as "subconcepto"
from eventos E
where E."Tipo_de_evento" = 'Boda'
union all
select
  (E."Fecha_contratada_Evento" - (E."dias_pago_final" * interval '1 day'))::date as "fecha",
  (E."Pax_Contratados" * E."margen_error_pax" * E."ticket_medio" * E."importe_pago_final") as "total",
  E."Sociedad_Espacio" as "sociedad",
  'PR'::text as "tipo_de_dato",
  'PL'::text as "mapping_0",
  '01. Importe neto de la cifra de negocios'::text as "mapping",
  'Liquidacion final'::text as "subconcepto"
from eventos E
where E."Tipo_de_evento" = 'Evento';

create or replace view financiero."QT_IN_PM" as
with meses as (
  select * from (values
    ('enero','01'),('febrero','02'),('marzo','03'),('abril','04'),('mayo','05'),('junio','06'),
    ('julio','07'),('agosto','08'),('septiembre','09'),('octubre','10'),('noviembre','11'),('diciembre','12')
  ) as m("mes","mes_num")
), fechas_pagos as (
  select
    (date_trunc('month', to_date(
      concat(
        case when HI."concepto" in ('Fecha pago prueba menú', 'Fecha pago showroom') and HI."mes" = 'diciembre'
             then (HI."periodo" - 1)::text
             else HI."periodo"::text
        end,
        '-', M."mes_num", '-01'
      ), 'YYYY-MM-DD'
    )) + interval '1 month - 1 day')::date as "fecha",
    HI."concepto" as "concepto",
    HI."valor" as "valor"
  from financiero."HI_PR_IN" HI
  join meses M on HI."mes" = M."mes"
  where HI."concepto" in ('Fecha pago prueba menú', 'Fecha pago showroom')
), importe_pago as (
  select HI."concepto" as "concepto", HI."valor" as "valor"
  from financiero."HI_PR_IN" HI
  where HI."concepto" in ('Importe pago prueba menú', 'Importe pago showroom')
)
select distinct
  F."fecha" as "fecha",
  (F."valor" * IP."valor") as "total",
  '0'::text as "sociedad",
  'PR'::text as "tipo_de_dato",
  'PL'::text as "mapping_0",
  '01. Importe neto de la cifra de negocios'::text as "mapping",
  case
    when F."concepto" = 'Fecha pago prueba menú' then 'Prueba de menu'
    when F."concepto" = 'Fecha pago showroom' then 'Showroom'
  end as "subconcepto"
from fechas_pagos F
join importe_pago IP
  on (F."concepto" = 'Fecha pago prueba menú' and IP."concepto" = 'Importe pago prueba menú')
  or (F."concepto" = 'Fecha pago showroom' and IP."concepto" = 'Importe pago showroom');

create or replace view financiero."QT_IN_VE" as
with hi_reserva as (
  select "periodo" as "periodo", "valor" as "valor"
  from financiero."HI_PR_IN"
  where "concepto" = 'Importe reserva'
)
select
  make_date(extract(year from T."Fecha_Cierre")::int + 1, extract(month from T."Fecha_Cierre")::int, extract(day from T."Fecha_Cierre")::int) as "fecha",
  coalesce(HR."valor", 0) as "total",
  coalesce(T."Sociedad_Espacio", '0') as "sociedad",
  'PR'::text as "tipo_de_dato",
  'PL'::text as "mapping_0",
  '01. Importe neto de la cifra de negocios'::text as "mapping",
  'Reserva'::text as "subconcepto"
from financiero."QT_Tratos_Ganados_Base" T
left join hi_reserva HR on extract(year from T."Fecha_Cierre")::int + 1 = HR."periodo"
where T."Fecha_Cierre" is not null
  and T."Fecha_Cierre" >= date '2023-01-01';

create or replace view financiero."QT_PAX_CONTRATADOS_DIARIO" as
select
  T."Fecha_contratada_Evento" as "fecha",
  extract(year from T."Fecha_contratada_Evento")::int as "anio",
  extract(month from T."Fecha_contratada_Evento")::int as "mes",
  sum(coalesce(T."Pax_Contratados", 0)) as "pax_contratados",
  sum(coalesce(T."Pax_Reales", 0)) as "pax_reales",
  sum(case when coalesce(T."Pax_Reales", 0) > 0 then T."Pax_Reales" else coalesce(T."Pax_Contratados", 0) end) as "pax_final"
from financiero."QT_Tratos_Ganados_Base" T
where T."Fecha_contratada_Evento" is not null
group by T."Fecha_contratada_Evento";

create or replace view financiero."QT_PAX_DIARIO_V3" as
select
  T."Fecha_contratada_Evento" as "fecha",
  extract(year from T."Fecha_contratada_Evento")::int as "anio",
  extract(month from T."Fecha_contratada_Evento")::int as "mes",
  sum(coalesce(T."Pax_Contratados", 0)) as "pax_contratados",
  sum(coalesce(T."Pax_Reales", 0)) as "pax_reales",
  sum(coalesce(T."Pax_Contratados", 0) * coalesce(H."valor", 1)) as "pax_previstos"
from financiero."QT_Tratos_Ganados_Base" T
left join financiero."HI_PR_IN" H
  on T."Tipo_de_evento" = H."tipo"
  and extract(year from T."Fecha_contratada_Evento")::int = H."periodo"
  and H."concepto" = 'Margen error pax'
where T."Fecha_contratada_Evento" is not null
group by T."Fecha_contratada_Evento";

create or replace view financiero."QT_PAX_MENSUAL_V3" as
select
  "anio" as "anio",
  "mes" as "mes",
  make_date("anio"::int, "mes"::int, 1) as "fecha_mes",
  sum(coalesce("pax_contratados", 0)) as "pax_contratados",
  sum(coalesce("pax_reales", 0)) as "pax_reales",
  sum(coalesce("pax_previstos", 0)) as "pax_previstos"
from financiero."QT_PAX_DIARIO_V3"
group by "anio", "mes";

create or replace view financiero."QT_PR_PJ" as
with data_preparada as (
  select
    H."sociedad" as "sociedad",
    H."mapping" as "mapping",
    H."subconcepto" as "subconcepto",
    H."descripcion" as "descripcion",
    H."valor" as "valor",
    H."estado" as "estado",
    H."fecha" as "fecha"
  from financiero."HI_PR_PJ" H
  where H."valor" is not null and H."fecha" is not null
), events as (
  select
    D."sociedad" as "sociedad",
    D."subconcepto" as "subconcepto",
    D."mapping" as "mapping",
    D."descripcion" as "descripcion",
    D."valor" as "valor",
    D."estado" as "estado",
    D."fecha" as "fecha",
    lead(D."estado") over (partition by D."sociedad", D."subconcepto", D."descripcion" order by D."fecha") as "estado_siguiente",
    lead(D."fecha") over (partition by D."sociedad", D."subconcepto", D."descripcion" order by D."fecha") as "fecha_siguiente"
  from data_preparada D
), periods as (
  select
    E."sociedad" as "sociedad",
    E."subconcepto" as "subconcepto",
    E."mapping" as "mapping",
    E."descripcion" as "descripcion",
    E."valor" as "valor",
    E."fecha" as "inicio_periodo",
    case
      when E."estado_siguiente" in ('off','on') and E."fecha_siguiente" is not null then (E."fecha_siguiente" - interval '1 day')::date
      else date '2027-12-31'
    end as "fin_periodo"
  from events E
  where E."estado" = 'on'
)
select
  C."fecha" as "fecha",
  P."descripcion" as "descripcion",
  P."valor" as "total",
  P."sociedad" as "sociedad",
  'PR'::text as "tipo_de_dato",
  'PL'::text as "mapping_0",
  P."mapping" as "mapping",
  P."subconcepto" as "subconcepto"
from periods P
join financiero."QT_Calendario_Mensual" C
  on C."fecha" >= P."inicio_periodo" and C."fecha" <= P."fin_periodo";

create or replace view financiero."RE_VS_PR_UNION" as
select "fecha", "subconcepto", "total", "sociedad", "tipo_de_dato", "mapping_0", "mapping", 'REAL'::text as "escenario", 'QT_RE_v3'::text as "origen"
from financiero."QT_RE_v3"
union all
select "fecha", "subconcepto", "total", "sociedad", "tipo_de_dato", "mapping_0", "mapping", 'PREVISION', 'QT_IN_CE'
from financiero."QT_IN_CE"
union all
select "fecha", "subconcepto", "total", "sociedad", "tipo_de_dato", "mapping_0", "mapping", 'PREVISION', 'QT_IN_PM'
from financiero."QT_IN_PM"
union all
select "fecha", "subconcepto", "total", "sociedad", "tipo_de_dato", "mapping_0", "mapping", 'PREVISION', 'QT_IN_VE'
from financiero."QT_IN_VE"
union all
select "fecha", "subconcepto", "total", "sociedad", "tipo_de_dato", "mapping_0", "mapping", 'PREVISION', 'QT_PR_CO_v2'
from financiero."QT_PR_CO_v2"
union all
select "fecha", "subconcepto", "total", "sociedad", "tipo_de_dato", "mapping_0", "mapping", 'PREVISION', 'QT_PR_PJ'
from financiero."QT_PR_PJ"
union all
select "fecha", "subconcepto", "total", "sociedad", "tipo_de_dato", "mapping_0", "mapping", 'PREVISION', 'HI_PA_PV'
from financiero."HI_PA_PV"
union all
select "fecha", "subconcepto", "total", "sociedad", "tipo_de_dato", "mapping_0", "mapping", 'PREVISION', 'QT_VF_PR_GA_2025'
from financiero."QT_VF_PR_GA_2025";

create or replace view financiero."RE_VS_PR_PAX_DIARIO" as
select
  X."fecha" as "fecha",
  extract(year from X."fecha")::int as "anio",
  extract(month from X."fecha")::int as "mes",
  X."escenario" as "escenario",
  sum(X."total") as "total",
  coalesce(sum(P."pax_reales"), 0) as "pax_reales"
from financiero."RE_VS_PR_UNION" X
left join financiero."QT_PAX_CONTRATADOS_DIARIO" P on X."fecha" = P."fecha"
group by X."fecha", X."escenario";

create or replace function financiero.re_vs_pr_pax_resumen(p_start date, p_end date)
returns table(
  total_real numeric,
  pax_reales numeric,
  ratio_real_pax numeric,
  total_prevision numeric
)
language sql stable as $$
with real_tot as (
  select coalesce(sum(total), 0) as total_real
  from financiero."QT_RE_v3"
  where fecha between p_start and p_end
), pax_tot as (
  select coalesce(sum(pax_reales), 0) as pax_reales
  from financiero."QT_PAX_CONTRATADOS_DIARIO"
  where fecha between p_start and p_end
), prev_tot as (
  select coalesce(sum(total), 0) as total_prevision
  from financiero."RE_VS_PR_UNION"
  where escenario = 'PREVISION' and fecha between p_start and p_end
)
select
  r.total_real,
  p.pax_reales,
  case when p.pax_reales = 0 then null else r.total_real / p.pax_reales end as ratio_real_pax,
  pr.total_prevision
from real_tot r cross join pax_tot p cross join prev_tot pr;
$$;
;

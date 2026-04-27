CREATE OR REPLACE FUNCTION public.get_adicionales_precios_evento(
  p_adicional_ids uuid[],
  p_evento_id uuid,
  p_invitados_override numeric DEFAULT NULL::numeric
)
RETURNS TABLE(
  adicional_id uuid,
  coste_total_pax numeric,
  rentabilidad_total_pct numeric,
  precio_base_pax numeric,
  factor_evento numeric,
  precio_ajustado_pax numeric,
  impuesto_pct numeric,
  impuesto_pax numeric,
  precio_final_pax numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_invitados      numeric;
  v_espacio        uuid;
  v_fecha          date;

  v_pax_minimo     numeric;
  v_rent_espacio   numeric;

  v_rent_anual     numeric;
  v_rent_app       numeric;
  v_factor_evento  numeric;
BEGIN
  --------------------------------------------------------------------
  -- 1. Contexto del evento
  --------------------------------------------------------------------
  SELECT
    COALESCE(
      p_invitados_override,
      COALESCE(e.invitados_adultos_b::numeric, e.invitados_adultos::numeric, 0)
    ),
    e.id_espacio,
    e.fecha
  INTO
    v_invitados,
    v_espacio,
    v_fecha
  FROM public.evento e
  WHERE e.id = p_evento_id;

  v_invitados := COALESCE(v_invitados, 0);

  --------------------------------------------------------------------
  -- 2. Rentabilidad del espacio + pax mínimo + factor desde get_evento_ajuste_live
  --------------------------------------------------------------------
  IF v_espacio IS NOT NULL AND v_fecha IS NOT NULL THEN
    -- Rentabilidad del espacio y pax_minimo base
    SELECT
      c.rentabilidad_unitaria,
      t.pax_minimo
    INTO
      v_rent_espacio,
      v_pax_minimo
    FROM public.calendario_espacio c
    LEFT JOIN public.temporalidad t
      ON t.espacio          = c.espacio_id
     AND t.temporalidad_dia = c."temporalidad A"
     AND t.temporalidad_mes = c.month::text
    WHERE c.espacio_id = v_espacio
      AND c.fecha      = v_fecha
    LIMIT 1;

    IF v_rent_espacio IS NULL THEN
      SELECT es.rentabilidad_unitaria
      INTO v_rent_espacio
      FROM public.espacios es
      WHERE es.id = v_espacio;
    END IF;

    -- Pax mínimo y factor del evento desde la función live
    SELECT
      aj.pax_minimo::numeric,
      aj.factor_multiplicador::numeric
    INTO
      v_pax_minimo,
      v_factor_evento
    FROM public.get_evento_ajuste_live(p_evento_id, p_invitados_override) aj
    LIMIT 1;
  END IF;

  v_rent_espacio := COALESCE(v_rent_espacio, 0);
  v_pax_minimo   := COALESCE(v_pax_minimo, v_invitados);  -- si no hay dato, usa invitados

  --------------------------------------------------------------------
  -- 3. Parámetros globales
  --------------------------------------------------------------------
  SELECT valor INTO v_rent_app
  FROM public.parametros_app
  WHERE item = 'rentabilidad_app'
  LIMIT 1;

  SELECT valor INTO v_rent_anual
  FROM public.parametros_app
  WHERE item = 'rentabilidad_anual'
  LIMIT 1;

  v_rent_app       := COALESCE(v_rent_app, 0);
  v_rent_anual     := COALESCE(v_rent_anual, 0);

  v_factor_evento := COALESCE(v_factor_evento, 1);

  --------------------------------------------------------------------
  -- 4. Cálculos por adicional
  --------------------------------------------------------------------
  RETURN QUERY
  WITH params AS (
    SELECT
      v_invitados::numeric      AS invitados,
      v_pax_minimo::numeric     AS pax_minimo,
      v_rent_espacio::numeric   AS rent_espacio,
      v_rent_anual::numeric     AS rent_anual,
      v_rent_app::numeric       AS rent_app,
      v_factor_evento::numeric  AS factor_evento
  ),
  base AS (
    SELECT
      a.id AS adicional_id,

      (COALESCE(a.precio_coste_es_pax, 0)::numeric +
       COALESCE(a.precio_coste_op_pax, 0)::numeric) AS coste_total_pax,

      COALESCE(a.rentabilidad_unitaria::numeric, p.rent_anual, 0)
        + p.rent_espacio
        + p.rent_app AS rentabilidad_total_pct,

      a.excedente::numeric AS excedente,

      COALESCE(
        a.impuesto::numeric,
        (SELECT valor::numeric
         FROM public.parametros_app
         WHERE item = 'impuesto_default_adicionales'
         LIMIT 1),
        0
      ) AS impuesto_pct,

      p.*
    FROM public.adicionales a
    CROSS JOIN params p
    WHERE (p_adicional_ids IS NULL OR a.id = ANY (p_adicional_ids))
  ),
  calc AS (
    SELECT
      b.adicional_id,
      b.coste_total_pax,
      b.rentabilidad_total_pct,

      -- Precio base con rentabilidad
      b.coste_total_pax * (1 + b.rentabilidad_total_pct/100) AS precio_base_pax,

      -- Factor ya calculado (coherente con evento_ajuste)
      b.factor_evento,

      b.impuesto_pct
    FROM base b
  )
  SELECT
    c.adicional_id,
    ROUND(c.coste_total_pax, 2)::numeric(12,2)                             AS coste_total_pax,
    ROUND(c.rentabilidad_total_pct, 4)::numeric(10,4)                      AS rentabilidad_total_pct,
    ROUND(c.precio_base_pax, 2)::numeric(12,2)                             AS precio_base_pax,
    ROUND(c.factor_evento, 4)::numeric(10,4)                               AS factor_evento,
    ROUND(c.precio_base_pax * c.factor_evento, 2)::numeric(12,2)           AS precio_ajustado_pax,
    ROUND(c.impuesto_pct, 2)::numeric(5,2)                                 AS impuesto_pct,
    ROUND(c.precio_base_pax * c.factor_evento * c.impuesto_pct / 100, 2)
      ::numeric(12,2)                                                      AS impuesto_pax,
    ROUND(c.precio_base_pax * c.factor_evento * (1 + c.impuesto_pct/100), 2)
      ::numeric(12,2)                                                      AS precio_final_pax
  FROM calc c;

END;
$function$;

CREATE OR REPLACE FUNCTION public.get_tematicas_precios_evento(
  p_tematica_ids uuid[],
  p_evento_id uuid,
  p_invitados_override numeric DEFAULT NULL::numeric
)
RETURNS TABLE(
  tematica_id uuid,
  coste_total_pax numeric,
  rentabilidad_total_pct numeric,
  precio_base_pax numeric,
  factor_evento numeric,
  precio_ajustado_pax numeric,
  impuesto_pct numeric,
  impuesto_pax numeric,
  precio_final_pax numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_invitados      numeric;
  v_espacio        uuid;
  v_fecha          date;

  v_pax_minimo     numeric;
  v_rent_espacio   numeric;

  v_rent_anual     numeric;
  v_rent_app       numeric;
  v_factor_evento  numeric;

  
BEGIN
  --------------------------------------------------------------------
  -- 1. Contexto del evento
  --------------------------------------------------------------------
  SELECT
    COALESCE(
      p_invitados_override,
      COALESCE(e.invitados_adultos_b::numeric, e.invitados_adultos::numeric, 0)
    ),
    e.id_espacio,
    e.fecha
  INTO
    v_invitados,
    v_espacio,
    v_fecha
  FROM public.evento e
  WHERE e.id = p_evento_id;

  v_invitados := COALESCE(v_invitados, 0);

  --------------------------------------------------------------------
  -- 2. Rentabilidad del espacio + pax mínimo + factor desde get_evento_ajuste_live
  --------------------------------------------------------------------
  IF v_espacio IS NOT NULL AND v_fecha IS NOT NULL THEN
    -- Rentabilidad del espacio y pax_minimo base (por si la vista no existe / no devuelve)
    SELECT
      c.rentabilidad_unitaria,
      t.pax_minimo
    INTO
      v_rent_espacio,
      v_pax_minimo
    FROM public.calendario_espacio c
    LEFT JOIN public.temporalidad t
      ON t.espacio          = c.espacio_id
     AND t.temporalidad_dia = c."temporalidad A"
     AND t.temporalidad_mes = c.month::text
    WHERE c.espacio_id = v_espacio
      AND c.fecha      = v_fecha
    LIMIT 1;

    IF v_rent_espacio IS NULL THEN
      SELECT es.rentabilidad_unitaria
      INTO v_rent_espacio
      FROM public.espacios es
      WHERE es.id = v_espacio;
    END IF;

    -- Pax mínimo y factor del evento desde la función live
    SELECT
      aj.pax_minimo::numeric,
      aj.factor_multiplicador::numeric
    INTO
      v_pax_minimo,
      v_factor_evento
    FROM public.get_evento_ajuste_live(p_evento_id, p_invitados_override) aj
    LIMIT 1;
  END IF;

  v_rent_espacio := COALESCE(v_rent_espacio, 0);
  v_pax_minimo   := COALESCE(v_pax_minimo, v_invitados);  -- si no hay dato, usa invitados

  --------------------------------------------------------------------
  -- 3. Parámetros globales
  --------------------------------------------------------------------
  SELECT valor INTO v_rent_app
  FROM public.parametros_app
  WHERE item = 'rentabilidad_app'
  LIMIT 1;

  SELECT valor INTO v_rent_anual
  FROM public.parametros_app
  WHERE item = 'rentabilidad_anual'
  LIMIT 1;

  v_rent_app       := COALESCE(v_rent_app, 0);
  v_rent_anual     := COALESCE(v_rent_anual, 0);

  v_factor_evento := COALESCE(v_factor_evento, 1);


  --------------------------------------------------------------------
  -- 4. Cálculos por temática
  --------------------------------------------------------------------
  RETURN QUERY
  WITH params AS (
    SELECT
      v_invitados::numeric      AS invitados,
      v_pax_minimo::numeric     AS pax_minimo,
      v_rent_espacio::numeric   AS rent_espacio,
      v_rent_anual::numeric     AS rent_anual,
      v_rent_app::numeric       AS rent_app,
      v_factor_evento::numeric    AS factor_evento
  ),
  base AS (
    SELECT
      t.id AS tematica_id,

      (COALESCE(t.precio_coste_es_pax, 0)::numeric +
       COALESCE(t.precio_coste_op_pax, 0)::numeric) AS coste_total_pax,

      COALESCE(t.rentabilidad_unitaria::numeric, p.rent_anual, 0)
        + p.rent_espacio
        + p.rent_app AS rentabilidad_total_pct,

      t.excedente::numeric AS excedente,

      COALESCE(
        t.impuesto::numeric,
        (SELECT valor::numeric
         FROM public.parametros_app
         WHERE item = 'impuesto_default_tematicas'
         LIMIT 1),
        0
      ) AS impuesto_pct,

      p.*
    FROM public.tematicas t
    CROSS JOIN params p
    WHERE (p_tematica_ids IS NULL OR t.id = ANY (p_tematica_ids))
      AND COALESCE(t.activo, TRUE)
  ),
 calc AS (
    SELECT
      b.tematica_id,
      b.coste_total_pax,
      b.rentabilidad_total_pct,

      -- Precio base con rentabilidad
      b.coste_total_pax * (1 + b.rentabilidad_total_pct/100) AS precio_base_pax,

      -- Factor del evento ya calculado (coherente con evento_ajuste)
      b.factor_evento,

      b.impuesto_pct
    FROM base b
  )
  
  SELECT
    c.tematica_id,
    ROUND(c.coste_total_pax, 2)::numeric(12,2)                             AS coste_total_pax,
    ROUND(c.rentabilidad_total_pct, 4)::numeric(10,4)                      AS rentabilidad_total_pct,
    ROUND(c.precio_base_pax, 2)::numeric(12,2)                             AS precio_base_pax,
    ROUND(c.factor_evento, 4)::numeric(10,4)                               AS factor_evento,
    ROUND(c.precio_base_pax * c.factor_evento, 2)::numeric(12,2)           AS precio_ajustado_pax,
    ROUND(c.impuesto_pct, 2)::numeric(5,2)                                 AS impuesto_pct,
    ROUND(c.precio_base_pax * c.factor_evento * c.impuesto_pct / 100, 2)
      ::numeric(12,2)                                                      AS impuesto_pax,
    ROUND(c.precio_base_pax * c.factor_evento * (1 + c.impuesto_pct/100), 2)
      ::numeric(12,2)                                                      AS precio_final_pax
  FROM calc c;

END;
$function$;;

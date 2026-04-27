CREATE OR REPLACE FUNCTION public.tg_transacciones_banco_link_evento()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Si la referencia viene nula o solo espacios, no hacemos nada
  IF NEW.referencia IS NULL OR btrim(NEW.referencia) = '' THEN
    RETURN NEW;
  END IF;

  -- Validar importe y moneda
  IF NEW.valor IS NULL OR NEW.moneda IS NULL THEN
    RETURN NEW;
  END IF;

  -- Solo acepta 2000 EUR (tolerancia por redondeo)
  IF NEW.moneda <> 'EUR' OR abs(NEW.valor - 2000) > 0.01 THEN
    RETURN NEW;
  END IF;

  -- a) Actualiza el pago del evento si la referencia coincide EXACTA con id_short
  UPDATE public.evento e
  SET id_calendario_espacio_pago = ce.id
  FROM public.calendario_espacio ce
  WHERE e.id_short = NEW.referencia
    AND e.id_calendario_espacio_seleccion IS NOT NULL
    AND e.id_calendario_espacio_seleccion = ce.id::text
    AND (e.id_calendario_espacio_pago IS DISTINCT FROM ce.id);

  -- b) Marca el calendario como ocupado
  UPDATE public.calendario_espacio ce
  SET crm_ocupado = TRUE
  FROM public.evento e
  WHERE e.id_short = NEW.referencia
    AND e.id_calendario_espacio_seleccion IS NOT NULL
    AND e.id_calendario_espacio_seleccion = ce.id::text
    AND ce.crm_ocupado IS DISTINCT FROM TRUE;

  RETURN NEW;
END;
$$;;

-- HU-34. Requiere 002 (versión del plan) y 010 (puntos de ruta).
-- Instalar una sola vez; el registro condicional no hace repetible el DDL.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.puntos_ruta') IS NULL THEN
    RAISE EXCEPTION 'HU34_PUNTOS_REQUERIDOS: aplicar primero 010';
  END IF;
END
$$;

ALTER TABLE public.puntos_ruta ADD CONSTRAINT hu34_uq_punto_expedicion UNIQUE (expedicion_id, id);

CREATE FUNCTION public.treksafe_normalizar_nota_avance(p_nota text)
RETURNS text LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $f$
  SELECT nullif(btrim(replace(replace(p_nota, E'\r\n', E'\n'), E'\r', E'\n'), E' \t\n'), '');
$f$;

CREATE TABLE public.avances_expedicion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  senderista_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  expedicion_id uuid NOT NULL REFERENCES public.expediciones(id) ON DELETE CASCADE,
  punto_id uuid NOT NULL,
  punto_nombre text NOT NULL,
  punto_orden smallint NOT NULL CHECK (punto_orden BETWEEN 1 AND 20),
  solicitud_id uuid NOT NULL,
  registrado_en timestamptz(3) NOT NULL,
  nota text,
  CONSTRAINT hu34_fk_punto FOREIGN KEY (expedicion_id, punto_id)
    REFERENCES public.puntos_ruta(expedicion_id, id) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT hu34_uq_solicitud UNIQUE (senderista_id, solicitud_id),
  CONSTRAINT hu34_chk_solicitud CHECK (solicitud_id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  CONSTRAINT hu34_chk_nombre CHECK (char_length(punto_nombre) BETWEEN 1 AND 100),
  CONSTRAINT hu34_chk_nota CHECK (nota IS NULL OR (
    char_length(nota) BETWEEN 1 AND 500
    AND nota = public.treksafe_normalizar_nota_avance(nota)
    AND nota !~ E'[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'
  ))
);
CREATE INDEX hu34_ultimo_avance ON public.avances_expedicion(expedicion_id, registrado_en DESC, id DESC);
COMMENT ON TABLE public.avances_expedicion IS
  'Declaraciones manuales online, con hora de servidor y punto propio. No modifican estado, versión o plazo del plan.';

CREATE FUNCTION public.treksafe_avance_json(p_avance public.avances_expedicion)
RETURNS jsonb LANGUAGE sql STABLE
SET search_path = pg_catalog, pg_temp
AS $f$
  SELECT jsonb_build_object(
    'id', p_avance.id, 'solicitudId', p_avance.solicitud_id, 'expedicionId', p_avance.expedicion_id,
    'punto', jsonb_build_object('id', p_avance.punto_id, 'nombre', p_avance.punto_nombre, 'orden', p_avance.punto_orden),
    'registradoEn', to_char(p_avance.registrado_en AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'nota', p_avance.nota);
$f$;

CREATE FUNCTION public.treksafe_registrar_avance(
  p_senderista_id uuid, p_expedicion_id uuid, p_solicitud_id uuid, p_punto_id uuid, p_nota text
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $f$
DECLARE
  v_plan public.expediciones%ROWTYPE;
  v_punto public.puntos_ruta%ROWTYPE;
  v_avance public.avances_expedicion%ROWTYPE;
  v_nota text := public.treksafe_normalizar_nota_avance(p_nota);
  v_constraint text;
  v_repetida boolean := false;
BEGIN
  IF p_senderista_id IS NULL OR p_expedicion_id IS NULL OR p_punto_id IS NULL OR p_solicitud_id IS NULL
     OR p_solicitud_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_punto_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR char_length(v_nota) > 500 OR v_nota ~ E'[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]' THEN
    RETURN jsonb_build_object('tipo', 'datos_invalidos');
  END IF;
  -- Mismo bloqueo que HU-32 y los cambios de estado; evaluar después de esperar.
  SELECT * INTO v_plan FROM public.expediciones
    WHERE id=p_expedicion_id AND senderista_id=p_senderista_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('tipo','no_encontrado'); END IF;

  SELECT * INTO v_avance FROM public.avances_expedicion
    WHERE senderista_id=p_senderista_id AND solicitud_id=p_solicitud_id;
  IF FOUND THEN
    IF v_avance.expedicion_id=p_expedicion_id AND v_avance.punto_id=p_punto_id
       AND v_avance.nota IS NOT DISTINCT FROM v_nota THEN
      RETURN jsonb_build_object('tipo','repetido','avance',public.treksafe_avance_json(v_avance));
    END IF;
    RETURN jsonb_build_object('tipo','solicitud_reutilizada');
  END IF;
  IF v_plan.estado::text <> 'en_progreso' THEN RETURN jsonb_build_object('tipo','estado_no_admitido'); END IF;
  SELECT * INTO v_punto FROM public.puntos_ruta
    WHERE expedicion_id=p_expedicion_id AND id=p_punto_id FOR KEY SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('tipo','punto_no_disponible'); END IF;

  BEGIN
    INSERT INTO public.avances_expedicion(senderista_id,expedicion_id,punto_id,punto_nombre,punto_orden,solicitud_id,registrado_en,nota)
      VALUES(p_senderista_id,p_expedicion_id,p_punto_id,v_punto.nombre,v_punto.orden,p_solicitud_id,
        date_trunc('milliseconds',clock_timestamp()),v_nota) RETURNING * INTO v_avance;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint <> 'hu34_uq_solicitud' THEN RAISE; END IF;
    -- También cubre dos expediciones distintas que compiten por la misma clave.
    SELECT * INTO v_avance FROM public.avances_expedicion
      WHERE senderista_id=p_senderista_id AND solicitud_id=p_solicitud_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Reintentar la transacción de avance' USING ERRCODE='40001'; END IF;
    IF v_avance.expedicion_id<>p_expedicion_id OR v_avance.punto_id<>p_punto_id
       OR v_avance.nota IS DISTINCT FROM v_nota THEN
      RETURN jsonb_build_object('tipo','solicitud_reutilizada');
    END IF;
    v_repetida := true;
  END;
  RETURN jsonb_build_object('tipo',CASE WHEN v_repetida THEN 'repetido' ELSE 'registrado' END,
    'avance',public.treksafe_avance_json(v_avance));
END;
$f$;

CREATE FUNCTION public.treksafe_consultar_ultimo_avance(p_senderista_id uuid, p_expedicion_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $f$
  SELECT jsonb_build_object('tipo','consultado','ultimoAvance',(
    SELECT public.treksafe_avance_json(a) FROM public.avances_expedicion a
      WHERE a.expedicion_id=e.id AND a.senderista_id=p_senderista_id
      ORDER BY a.registrado_en DESC,a.id DESC LIMIT 1
  )) FROM public.expediciones e WHERE e.id=p_expedicion_id AND e.senderista_id=p_senderista_id;
$f$;

ALTER TABLE public.avances_expedicion ENABLE ROW LEVEL SECURITY;
CREATE POLICY hu34_deny_cliente ON public.avances_expedicion
  FOR ALL TO anon,authenticated USING(false) WITH CHECK(false);
REVOKE ALL ON public.avances_expedicion FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.treksafe_normalizar_nota_avance(text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.treksafe_avance_json(public.avances_expedicion) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.treksafe_registrar_avance(uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.treksafe_consultar_ultimo_avance(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.treksafe_registrar_avance(uuid,uuid,uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.treksafe_consultar_ultimo_avance(uuid,uuid) TO service_role;

DO $$
BEGIN
  IF to_regclass('public.treksafe_migraciones') IS NOT NULL THEN
    EXECUTE $sql$
      INSERT INTO public.treksafe_migraciones(version,nombre,hu)
      VALUES('016','hu34_avances_expedicion','HU-34') ON CONFLICT(version) DO NOTHING
    $sql$;
  END IF;
END
$$;
COMMIT;

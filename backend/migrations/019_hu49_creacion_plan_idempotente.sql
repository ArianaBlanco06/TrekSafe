-- HU-49. Número 019 provisional: verificar que siga libre antes del merge.
-- Requiere esquema inicial, 002 y 014. Aplicación coordinada en DEV pendiente.
BEGIN;

CREATE TABLE public.creaciones_plan_offline (
  senderista_id uuid NOT NULL REFERENCES public.perfiles_senderista(usuario_id) ON DELETE CASCADE,
  borrador_id uuid NOT NULL,
  datos jsonb NOT NULL,
  expedicion_id uuid REFERENCES public.expediciones(id) ON DELETE SET NULL,
  creado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (senderista_id, borrador_id)
);
ALTER TABLE public.creaciones_plan_offline ENABLE ROW LEVEL SECURITY;
CREATE POLICY treksafe_deny_anon_authenticated ON public.creaciones_plan_offline
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
REVOKE ALL ON public.creaciones_plan_offline FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.creaciones_plan_offline TO service_role;

CREATE FUNCTION public.treksafe_crear_plan_borrador(p_senderista_id uuid, p_borrador_id uuid, p_datos jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_previa public.creaciones_plan_offline%ROWTYPE;
  v_plan public.expediciones%ROWTYPE;
  v_inicio timestamptz;
  v_retorno timestamptz;
  v_ahora timestamptz;
  v_contactos uuid[];
  v_contacto uuid;
  v_repetido boolean := false;
BEGIN
  -- Un lock por cuenta serializa creaciones offline y reenvíos concurrentes.
  -- No modifica el plan, su cron ni los eventos de otras historias.
  PERFORM 1 FROM public.perfiles_senderista s JOIN public.usuarios u ON u.id=s.usuario_id
    WHERE s.usuario_id=p_senderista_id AND u.rol='senderista' FOR UPDATE OF s;
  IF NOT FOUND THEN RETURN jsonb_build_object('tipo','no_autorizado'); END IF;
  IF p_borrador_id IS NULL OR jsonb_typeof(p_datos) IS DISTINCT FROM 'object' THEN
    RETURN jsonb_build_object('tipo','datos_invalidos');
  END IF;
  SELECT * INTO v_previa FROM public.creaciones_plan_offline
    WHERE senderista_id=p_senderista_id AND borrador_id=p_borrador_id;
  IF FOUND THEN
    IF v_previa.datos IS DISTINCT FROM p_datos THEN RETURN jsonb_build_object('tipo','solicitud_reutilizada'); END IF;
    IF v_previa.expedicion_id IS NULL THEN RETURN jsonb_build_object('tipo','plan_eliminado'); END IF;
    SELECT * INTO v_plan FROM public.expediciones WHERE id=v_previa.expedicion_id AND senderista_id=p_senderista_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('tipo','plan_eliminado'); END IF;
    v_repetido := true;
  ELSE
    -- Validación también dentro de la transacción, tras cualquier espera de lock.
    IF NOT (p_datos ?& ARRAY['lugarInicio','lugarFin','horaInicio','horaRetornoEstimada','minutosTolerancia',
      'minutosRecordatorio','idsContactos','nombresAcompanantes'])
      OR jsonb_typeof(p_datos->'idsContactos') IS DISTINCT FROM 'array'
      OR jsonb_typeof(p_datos->'nombresAcompanantes') IS DISTINCT FROM 'array'
      OR jsonb_typeof(p_datos->'minutosTolerancia') IS DISTINCT FROM 'number'
      OR jsonb_typeof(p_datos->'minutosRecordatorio') IS DISTINCT FROM 'number'
      OR jsonb_typeof(p_datos->'lugarInicio') IS DISTINCT FROM 'string'
      OR jsonb_typeof(p_datos->'lugarFin') IS DISTINCT FROM 'string'
    THEN RETURN jsonb_build_object('tipo','datos_invalidos'); END IF;
    BEGIN
      v_inicio := (p_datos->>'horaInicio')::timestamptz;
      v_retorno := (p_datos->>'horaRetornoEstimada')::timestamptz;
      SELECT array_agg(x::uuid ORDER BY x) INTO v_contactos FROM jsonb_array_elements_text(p_datos->'idsContactos') AS t(x);
    EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN
      RETURN jsonb_build_object('tipo','datos_invalidos');
    END;
    v_ahora := clock_timestamp();
    IF v_inicio IS NULL OR v_retorno IS NULL OR NOT isfinite(v_inicio) OR NOT isfinite(v_retorno)
      OR v_inicio<=v_ahora OR v_retorno<=v_inicio THEN RETURN jsonb_build_object('tipo','fechas_invalidas'); END IF;
    IF length(btrim(p_datos->>'lugarInicio')) NOT BETWEEN 3 AND 500
      OR length(btrim(p_datos->>'lugarFin')) NOT BETWEEN 3 AND 500
      OR (p_datos->>'minutosTolerancia')::integer NOT BETWEEN 1 AND 480
      OR (p_datos->>'minutosRecordatorio')::integer NOT IN (15,30,60)
      OR coalesce(jsonb_array_length(p_datos->'nombresAcompanantes'),0) NOT BETWEEN 1 AND 100
      OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_datos->'nombresAcompanantes') AS t(x)
        WHERE length(btrim(x)) NOT BETWEEN 2 AND 200)
    THEN RETURN jsonb_build_object('tipo','datos_invalidos'); END IF;
    IF coalesce(cardinality(v_contactos),0) NOT BETWEEN 1 AND 100
      OR cardinality(v_contactos)<>(SELECT count(DISTINCT x) FROM unnest(v_contactos) AS t(x)) THEN
      RETURN jsonb_build_object('tipo','contactos_invalidos');
    END IF;
    -- Bloquear contactos evita que desaparezcan entre validación y asociación.
    FOR v_contacto IN SELECT c.id FROM public.contactos_emergencia c
      WHERE c.senderista_id=p_senderista_id AND c.id=ANY(v_contactos) ORDER BY c.id FOR KEY SHARE LOOP
      NULL;
    END LOOP;
    IF (SELECT count(*) FROM public.contactos_emergencia WHERE senderista_id=p_senderista_id AND id=ANY(v_contactos))
      <>cardinality(v_contactos) THEN RETURN jsonb_build_object('tipo','contactos_invalidos'); END IF;
    IF EXISTS(SELECT 1 FROM public.expediciones WHERE senderista_id=p_senderista_id AND estado IN ('en_progreso','alerta')) THEN
      RETURN jsonb_build_object('tipo','expedicion_activa');
    END IF;
    v_ahora := clock_timestamp();
    IF v_inicio<=v_ahora THEN RETURN jsonb_build_object('tipo','fechas_invalidas'); END IF;
    INSERT INTO public.expediciones(senderista_id,lugar_inicio,lugar_fin,coordenadas_inicio,coordenadas_fin,
      hora_inicio,hora_retorno_estimada,minutos_tolerancia,minutos_recordatorio,estado)
    VALUES(p_senderista_id,p_datos->>'lugarInicio',p_datos->>'lugarFin',nullif(p_datos->>'coordenadasInicio',''),
      nullif(p_datos->>'coordenadasFin',''),v_inicio,v_retorno,(p_datos->>'minutosTolerancia')::integer,
      (p_datos->>'minutosRecordatorio')::integer,
      CASE WHEN v_inicio<=v_ahora+interval '1 minute' THEN 'en_progreso'::public.estado_expedicion_enum
        ELSE 'programada'::public.estado_expedicion_enum END) RETURNING * INTO v_plan;
    INSERT INTO public.vinculos_expedicion_contacto(expedicion_id,contacto_id)
      SELECT v_plan.id,x FROM unnest(v_contactos) AS t(x);
    INSERT INTO public.acompanantes_expedicion(expedicion_id,nombre_acompanante)
      SELECT v_plan.id,x FROM jsonb_array_elements_text(p_datos->'nombresAcompanantes') AS t(x);
    INSERT INTO public.creaciones_plan_offline(senderista_id,borrador_id,datos,expedicion_id)
      VALUES(p_senderista_id,p_borrador_id,p_datos,v_plan.id);
  END IF;
  RETURN jsonb_build_object('tipo',CASE WHEN v_repetido THEN 'repetido' ELSE 'creado' END,
    'expedicion',jsonb_build_object('id',v_plan.id,'lugarInicio',v_plan.lugar_inicio,'lugarFin',v_plan.lugar_fin,
      'horaInicio',v_plan.hora_inicio,'horaRetornoEstimada',v_plan.hora_retorno_estimada,
      'minutosTolerancia',v_plan.minutos_tolerancia,'estado',v_plan.estado,'version',v_plan.version,'creadoEn',v_plan.creado_en));
END;
$$;
REVOKE ALL ON FUNCTION public.treksafe_crear_plan_borrador(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.treksafe_crear_plan_borrador(uuid,uuid,jsonb) TO service_role;

DO $$ BEGIN
  IF to_regclass('public.treksafe_migraciones') IS NOT NULL THEN
    INSERT INTO public.treksafe_migraciones(version,nombre,hu) VALUES('019','hu49_creacion_plan_idempotente','HU-49')
      ON CONFLICT(version) DO NOTHING;
  END IF;
END $$;
COMMIT;

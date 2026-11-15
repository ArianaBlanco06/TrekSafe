-- DEP-05: señales entre API y worker. Una aplicación; no activa procesos ni envíos.
BEGIN;
CREATE TABLE public.estado_worker (
  instancia_id text PRIMARY KEY CHECK (instancia_id ~ '^[A-Za-z0-9_.:-]{1,120}$'),
  iniciado_en timestamptz NOT NULL,
  heartbeat_en timestamptz NOT NULL,
  parado_en timestamptz,
  plazos_en timestamptz,
  plazos_resultado text CHECK (plazos_resultado IN ('ok', 'error')),
  plazos_error text CHECK (plazos_error ~ '^[A-Z][A-Z0-9_]{0,79}$'),
  outbox_en timestamptz,
  outbox_resultado text CHECK (outbox_resultado IN ('ok', 'error')),
  outbox_error text CHECK (outbox_error ~ '^[A-Z][A-Z0-9_]{0,79}$')
);
ALTER TABLE public.estado_worker ENABLE ROW LEVEL SECURITY;
CREATE POLICY treksafe_deny_anon_authenticated ON public.estado_worker
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
REVOKE ALL ON public.estado_worker FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.estado_worker TO service_role;

CREATE FUNCTION public.treksafe_registrar_estado_worker(
  p_instancia_id text, p_evento text, p_resultado text DEFAULT NULL,
  p_codigo_error text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE t timestamptz := clock_timestamp();
BEGIN
  IF p_instancia_id IS NULL OR p_instancia_id !~ '^[A-Za-z0-9_.:-]{1,120}$'
    OR p_evento IS NULL OR p_evento NOT IN ('inicio','plazos','outbox','parada') THEN
    RAISE EXCEPTION 'DATOS_ESTADO_WORKER_INVALIDOS';
  END IF;
  IF p_evento IN ('plazos','outbox') AND
    (p_resultado IS NULL OR p_resultado NOT IN ('ok','error') OR
     (p_codigo_error IS NOT NULL AND p_codigo_error !~ '^[A-Z][A-Z0-9_]{0,79}$')) THEN
    RAISE EXCEPTION 'DATOS_ESTADO_WORKER_INVALIDOS';
  END IF;
  IF p_evento = 'inicio' THEN
    -- El identificador es nuevo por arranque; no reiniciar señales de otra ejecución.
    INSERT INTO public.estado_worker(instancia_id,iniciado_en,heartbeat_en)
      VALUES (p_instancia_id,t,t);
  ELSIF p_evento = 'parada' THEN
    UPDATE public.estado_worker SET parado_en=t,heartbeat_en=t
      WHERE instancia_id=p_instancia_id AND parado_en IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'INSTANCIA_WORKER_INACTIVA'; END IF;
  ELSIF p_evento = 'plazos' THEN
    UPDATE public.estado_worker SET heartbeat_en=t,plazos_en=t,
      plazos_resultado=p_resultado,plazos_error=CASE WHEN p_resultado='error' THEN p_codigo_error END
      WHERE instancia_id=p_instancia_id AND parado_en IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'INSTANCIA_WORKER_INACTIVA'; END IF;
  ELSE
    UPDATE public.estado_worker SET heartbeat_en=t,outbox_en=t,
      outbox_resultado=p_resultado,outbox_error=CASE WHEN p_resultado='error' THEN p_codigo_error END
      WHERE instancia_id=p_instancia_id AND parado_en IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'INSTANCIA_WORKER_INACTIVA'; END IF;
  END IF;
END $$;

CREATE FUNCTION public.treksafe_consultar_disponibilidad_worker(
  p_max_heartbeat_ms bigint, p_max_pendientes_ms bigint
) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE t timestamptz := statement_timestamp();
BEGIN
  IF p_max_heartbeat_ms IS NULL OR p_max_pendientes_ms IS NULL OR
    p_max_heartbeat_ms NOT BETWEEN 1000 AND 86400000 OR
    p_max_pendientes_ms NOT BETWEEN 1000 AND 86400000 THEN
    RAISE EXCEPTION 'UMBRALES_WORKER_INVALIDOS';
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.estado_worker w WHERE w.parado_en IS NULL
      AND w.plazos_resultado='ok' AND w.outbox_resultado='ok'
      AND w.heartbeat_en >= t - p_max_heartbeat_ms * interval '1 millisecond'
      AND w.plazos_en >= t - p_max_heartbeat_ms * interval '1 millisecond'
      AND w.outbox_en >= t - p_max_heartbeat_ms * interval '1 millisecond'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.outbox_notificaciones o
    WHERE o.estado IN ('fallido','incierto') OR
      (o.estado='pendiente' AND
       o.proximo_intento_en < t - p_max_pendientes_ms * interval '1 millisecond')
  ) AND NOT EXISTS (
    -- También detecta el resultado duradero sinDestinatarios de 024 y el legado
    -- aún sin conciliar; un ciclo posterior vacío no debe esconder esa condición.
    SELECT 1 FROM public.expediciones e WHERE e.estado='alerta' AND NOT EXISTS (
      SELECT 1 FROM public.outbox_notificaciones o
      WHERE o.clave_evento IN ('ALERTA_CONTACTO:' || e.id, 'ALERTA_RESCATE:' || e.id)
    )
  );
END $$;
REVOKE ALL ON FUNCTION public.treksafe_registrar_estado_worker(text,text,text,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.treksafe_consultar_disponibilidad_worker(bigint,bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.treksafe_registrar_estado_worker(text,text,text,text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.treksafe_consultar_disponibilidad_worker(bigint,bigint)
  TO service_role;
INSERT INTO public.treksafe_migraciones(version,nombre,hu)
  VALUES ('032','dep110_estado_worker','DEP-05');
NOTIFY pgrst, 'reload schema';
COMMIT;

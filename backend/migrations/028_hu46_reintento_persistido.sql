-- HU-46. Esqueleto generado con Supabase CLI migration new. Requiere 017 y 026.
BEGIN;
CREATE TABLE public.solicitudes_reintento_outbox (
  actor_id uuid NOT NULL REFERENCES public.perfiles_rescatista(usuario_id) ON DELETE CASCADE,
  clave text NOT NULL CHECK(length(btrim(clave)) BETWEEN 1 AND 150),
  incidente_id uuid NOT NULL REFERENCES public.incidentes(id) ON DELETE CASCADE,
  mensaje_id uuid NOT NULL REFERENCES public.outbox_notificaciones(id) ON DELETE CASCADE,
  respuesta jsonb NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(actor_id,clave)
);
CREATE INDEX idx_reintentos_incidente ON public.solicitudes_reintento_outbox(incidente_id);
CREATE INDEX idx_reintentos_mensaje ON public.solicitudes_reintento_outbox(mensaje_id);
ALTER TABLE public.solicitudes_reintento_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.solicitudes_reintento_outbox FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.solicitudes_reintento_outbox TO service_role;

CREATE FUNCTION public.treksafe_despachos_autorizados(p_actor uuid,p_expedicion uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE i public.incidentes%ROWTYPE; r jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=p_actor AND rol='rescatista') THEN RAISE EXCEPTION 'PROHIBIDO'; END IF;
  SELECT * INTO i FROM public.incidentes WHERE expedicion_id=p_expedicion AND estado<>'cerrado' FOR SHARE;
  IF NOT FOUND OR i.responsable_id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'NO_ES_RESPONSABLE'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY o.creado_en,o.id),'[]'::jsonb) INTO r
    FROM public.outbox_notificaciones o WHERE o.metadata->>'expedicionId'=p_expedicion::text;
  RETURN r;
END $$;

CREATE FUNCTION public.treksafe_reintentar_despacho(p_actor uuid,p_expedicion uuid,p_mensaje uuid,p_clave text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE i public.incidentes%ROWTYPE; m public.outbox_notificaciones%ROWTYPE;
  previa public.solicitudes_reintento_outbox%ROWTYPE; r jsonb; t timestamptz;
BEGIN
  IF p_clave IS NULL OR length(btrim(p_clave)) NOT BETWEEN 1 AND 150 THEN RAISE EXCEPTION 'CLAVE_INVALIDA'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=p_actor AND rol='rescatista') THEN RAISE EXCEPTION 'PROHIBIDO'; END IF;
  -- Serializa la misma clave entre procesos sin bloquear perfiles ni invertir el orden del relevo.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text||':'||p_clave,0));
  SELECT * INTO i FROM public.incidentes WHERE expedicion_id=p_expedicion AND estado<>'cerrado' FOR SHARE;
  IF NOT FOUND OR i.responsable_id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'NO_ES_RESPONSABLE'; END IF;
  SELECT * INTO previa FROM public.solicitudes_reintento_outbox WHERE actor_id=p_actor AND clave=p_clave;
  IF FOUND THEN
    IF previa.incidente_id<>i.id OR previa.mensaje_id<>p_mensaje THEN RAISE EXCEPTION 'CLAVE_REUTILIZADA'; END IF;
    RETURN previa.respuesta;
  END IF;
  SELECT * INTO m FROM public.outbox_notificaciones WHERE id=p_mensaje FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_ENCONTRADO'; END IF;
  IF m.metadata->>'expedicionId' IS DISTINCT FROM p_expedicion::text THEN RAISE EXCEPTION 'DESPACHO_AJENO'; END IF;
  IF m.estado='enviado' THEN RAISE EXCEPTION 'AVISO_YA_ENVIADO'; END IF;
  IF m.estado='incierto' THEN RAISE EXCEPTION 'ESTADO_INCIERTO_REQUIERE_REVISION'; END IF;
  IF m.estado<>'fallido' THEN RAISE EXCEPTION 'DESPACHO_NO_FALLIDO'; END IF;
  t:=clock_timestamp();
  IF m.bloqueado_hasta>t OR EXISTS(SELECT 1 FROM public.intentos_outbox WHERE notificacion_id=p_mensaje AND finalizado_en IS NULL) THEN RAISE EXCEPTION 'ESTADO_INCIERTO_REQUIERE_REVISION'; END IF;
  UPDATE public.outbox_notificaciones SET estado='pendiente',proximo_intento_en=t,intento_manual_autorizado=true,
    bloqueado_por=NULL,bloqueado_hasta=NULL,actualizado_en=t WHERE id=p_mensaje;
  r:=jsonb_build_object('id',p_mensaje,'estadoAnterior','fallido','nuevoEstado','pendiente','mensaje','Aviso reencolado para un intento manual.');
  INSERT INTO public.solicitudes_reintento_outbox(actor_id,clave,incidente_id,mensaje_id,respuesta) VALUES(p_actor,p_clave,i.id,p_mensaje,r);
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.treksafe_despachos_autorizados(uuid,uuid),public.treksafe_reintentar_despacho(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.treksafe_despachos_autorizados(uuid,uuid),public.treksafe_reintentar_despacho(uuid,uuid,uuid,text) TO service_role;
INSERT INTO public.treksafe_migraciones(version,nombre,hu) VALUES('028','hu46_reintento_persistido','HU-46');
NOTIFY pgrst,'reload schema';
COMMIT;

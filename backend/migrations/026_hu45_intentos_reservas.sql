-- HU-45 / revisión PO. Esqueleto generado con Supabase CLI migration new.
-- Requiere 015. Aplicar una vez, por Ariana, después de validar en base desechable.
BEGIN;
ALTER TABLE public.outbox_notificaciones
  ADD COLUMN intentos_automaticos integer NOT NULL DEFAULT 0 CHECK (intentos_automaticos BETWEEN 0 AND 3),
  ADD COLUMN intento_manual_autorizado boolean NOT NULL DEFAULT false;
UPDATE public.outbox_notificaciones SET intentos_automaticos=least(intentos,3);
CREATE TABLE public.intentos_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notificacion_id uuid NOT NULL REFERENCES public.outbox_notificaciones(id) ON DELETE CASCADE,
  reserva_id uuid NOT NULL UNIQUE,
  numero integer NOT NULL CHECK(numero>0),
  es_manual boolean NOT NULL,
  iniciado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
  finalizado_en timestamptz,
  resultado text NOT NULL CHECK(resultado IN ('iniciado','enviado','simulado','fallido','incierto')),
  modo_envio text,
  error_codigo text,
  UNIQUE(notificacion_id,numero)
);
ALTER TABLE public.intentos_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.intentos_outbox FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.intentos_outbox TO service_role;
CREATE INDEX idx_intentos_outbox_pendientes ON public.intentos_outbox(notificacion_id) WHERE finalizado_en IS NULL;

CREATE FUNCTION public.treksafe_reservar_outbox(p_id uuid,p_reserva uuid,p_duracion_ms integer)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v public.outbox_notificaciones%ROWTYPE; t timestamptz;
BEGIN
  IF p_reserva IS NULL OR p_duracion_ms NOT BETWEEN 1000 AND 900000 THEN RAISE EXCEPTION 'DATOS_INVALIDOS'; END IF;
  SELECT * INTO v FROM public.outbox_notificaciones WHERE id=p_id FOR UPDATE;
  t:=clock_timestamp();
  IF NOT FOUND OR v.estado<>'pendiente' OR v.proximo_intento_en>t THEN RETURN false; END IF;
  IF v.bloqueado_hasta>t THEN RETURN false; END IF;
  -- Si se llegó a iniciar el transporte, un reinicio no demuestra rechazo del proveedor.
  IF EXISTS(SELECT 1 FROM public.intentos_outbox WHERE notificacion_id=p_id AND finalizado_en IS NULL) THEN
    UPDATE public.intentos_outbox SET finalizado_en=t,resultado='incierto',error_codigo='RESERVA_VENCIDA_TRAS_INICIO'
      WHERE notificacion_id=p_id AND finalizado_en IS NULL;
    UPDATE public.outbox_notificaciones SET estado='incierto',ultimo_error='RESERVA_VENCIDA_TRAS_INICIO',
      bloqueado_hasta=NULL,bloqueado_por=NULL,actualizado_en=t WHERE id=p_id;
    RETURN false;
  END IF;
  IF NOT v.intento_manual_autorizado AND v.intentos_automaticos>=least(v.max_intentos,3) THEN
    UPDATE public.outbox_notificaciones SET estado='fallido',bloqueado_hasta=NULL,bloqueado_por=NULL,actualizado_en=t WHERE id=p_id;
    RETURN false;
  END IF;
  UPDATE public.outbox_notificaciones SET bloqueado_por=p_reserva::text,
    bloqueado_hasta=t+make_interval(secs=>p_duracion_ms/1000.0),actualizado_en=t WHERE id=p_id;
  RETURN true;
END $$;

CREATE FUNCTION public.treksafe_iniciar_intento_outbox(p_id uuid,p_reserva uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v public.outbox_notificaciones%ROWTYPE; t timestamptz; manual boolean;
BEGIN
  SELECT * INTO v FROM public.outbox_notificaciones WHERE id=p_id FOR UPDATE;
  t:=clock_timestamp();
  IF NOT FOUND OR v.estado<>'pendiente' OR v.bloqueado_por IS DISTINCT FROM p_reserva::text OR v.bloqueado_hasta<=t THEN RETURN NULL; END IF;
  IF EXISTS(SELECT 1 FROM public.intentos_outbox WHERE reserva_id=p_reserva) THEN RETURN NULL; END IF;
  manual:=v.intento_manual_autorizado;
  IF NOT manual AND v.intentos_automaticos>=least(v.max_intentos,3) THEN RETURN NULL; END IF;
  UPDATE public.outbox_notificaciones SET intentos=intentos+1,
    intentos_automaticos=intentos_automaticos+CASE WHEN manual THEN 0 ELSE 1 END,
    intento_manual_autorizado=false,actualizado_en=t WHERE id=p_id RETURNING * INTO v;
  INSERT INTO public.intentos_outbox(notificacion_id,reserva_id,numero,es_manual,resultado)
    VALUES(p_id,p_reserva,v.intentos,manual,'iniciado');
  RETURN to_jsonb(v);
END $$;

CREATE FUNCTION public.treksafe_finalizar_intento_outbox(p_id uuid,p_reserva uuid,p_estado text,p_modo text)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v public.outbox_notificaciones%ROWTYPE; a public.intentos_outbox%ROWTYPE;
  t timestamptz; salida text; estado_final text;
BEGIN
  IF p_estado NOT IN ('enviado','fallido','incierto') OR p_modo NOT IN ('smtp','brevo-api','dev-log') THEN RAISE EXCEPTION 'DATOS_INVALIDOS'; END IF;
  SELECT * INTO v FROM public.outbox_notificaciones WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR v.estado<>'pendiente' OR v.bloqueado_por IS DISTINCT FROM p_reserva::text THEN RETURN 'reserva_perdida'; END IF;
  SELECT * INTO a FROM public.intentos_outbox WHERE notificacion_id=p_id AND reserva_id=p_reserva AND finalizado_en IS NULL;
  IF NOT FOUND THEN RETURN 'reserva_perdida'; END IF;
  t:=clock_timestamp();
  estado_final:=p_estado; salida:=p_estado;
  IF p_estado='fallido' AND NOT a.es_manual AND v.intentos_automaticos<least(v.max_intentos,3) THEN
    estado_final:='pendiente'; salida:='reintentado';
  END IF;
  UPDATE public.intentos_outbox SET finalizado_en=t,
    resultado=CASE WHEN p_estado='enviado' AND p_modo='dev-log' THEN 'simulado' ELSE p_estado END,
    modo_envio=p_modo,error_codigo=CASE WHEN p_estado='enviado' THEN NULL WHEN p_estado='incierto' THEN 'RESULTADO_INCIERTO' ELSE 'RECHAZO_CONFIRMADO' END
    WHERE id=a.id;
  UPDATE public.outbox_notificaciones SET estado=estado_final,modo_envio=p_modo,
    enviado_en=CASE WHEN p_estado='enviado' THEN t ELSE NULL END,
    ultimo_error=CASE WHEN p_estado='enviado' THEN NULL WHEN p_estado='incierto' THEN 'RESULTADO_INCIERTO' ELSE 'RECHAZO_CONFIRMADO' END,
    proximo_intento_en=CASE WHEN salida='reintentado' THEN t+CASE WHEN v.intentos_automaticos=1 THEN interval '1 minute' ELSE interval '5 minutes' END ELSE proximo_intento_en END,
    bloqueado_hasta=NULL,bloqueado_por=NULL,actualizado_en=t WHERE id=p_id;
  RETURN salida;
END $$;
REVOKE ALL ON FUNCTION public.treksafe_reservar_outbox(uuid,uuid,integer),public.treksafe_iniciar_intento_outbox(uuid,uuid),public.treksafe_finalizar_intento_outbox(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.treksafe_reservar_outbox(uuid,uuid,integer),public.treksafe_iniciar_intento_outbox(uuid,uuid),public.treksafe_finalizar_intento_outbox(uuid,uuid,text,text) TO service_role;
INSERT INTO public.treksafe_migraciones(version,nombre,hu) VALUES('026','hu45_intentos_reservas','HU-45');
NOTIFY pgrst,'reload schema';
COMMIT;

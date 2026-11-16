-- HU-44. Esqueleto generado con Supabase CLI migration new. Requiere 015, 017 y 026.
BEGIN;
CREATE TABLE public.retornos_confirmados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expedicion_id uuid NOT NULL UNIQUE REFERENCES public.expediciones(id) ON DELETE CASCADE,
  confirmado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
  era_alerta boolean NOT NULL
);
ALTER TABLE public.retornos_confirmados ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.retornos_confirmados FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.retornos_confirmados TO service_role;
CREATE FUNCTION public.treksafe_confirmar_retorno_con_outbox(p_expedicion_id uuid,p_senderista_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE e public.expediciones%ROWTYPE; evento uuid; t timestamptz; atendida boolean;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.usuarios u JOIN public.perfiles_senderista p ON p.usuario_id=u.id WHERE u.id=p_senderista_id AND u.rol='senderista') THEN RAISE EXCEPTION 'PROHIBIDO'; END IF;
  SELECT * INTO e FROM public.expediciones WHERE id=p_expedicion_id AND senderista_id=p_senderista_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_ENCONTRADO'; END IF;
  IF e.estado='completada' AND EXISTS(SELECT 1 FROM public.retornos_confirmados WHERE expedicion_id=e.id) THEN RETURN to_jsonb(e); END IF;
  IF e.estado NOT IN ('en_progreso','alerta') THEN RAISE EXCEPTION 'EXPEDICION_NO_ACTIVA'; END IF;
  t:=clock_timestamp();
  atendida:=EXISTS(SELECT 1 FROM public.incidentes WHERE expedicion_id=e.id);
  INSERT INTO public.retornos_confirmados(expedicion_id,confirmado_en,era_alerta) VALUES(e.id,t,e.estado='alerta') RETURNING id INTO evento;
  UPDATE public.expediciones SET estado='completada',actualizado_en=t WHERE id=e.id;
  WITH destinatarios AS (
    SELECT c.correo_electronico correo FROM public.vinculos_expedicion_contacto v
      JOIN public.contactos_emergencia c ON c.id=v.contacto_id WHERE v.expedicion_id=e.id
    UNION
    SELECT u.correo_electronico FROM public.usuarios u JOIN public.perfiles_rescatista p ON p.usuario_id=u.id
      WHERE atendida AND (
        u.id=(SELECT i.responsable_id FROM public.incidentes i WHERE i.expedicion_id=e.id ORDER BY i.abierto_en DESC,i.id DESC LIMIT 1)
        OR lower(btrim(u.correo_electronico)) IN (
          SELECT o.destinatario_normalizado FROM public.outbox_notificaciones o
            WHERE o.metadata->>'expedicionId'=e.id::text AND o.estado='enviado' AND o.modo_envio IN ('smtp','brevo-api')
              AND (o.tipo_evento IN ('ALERTA_RESCATE','alerta_rescate') OR o.metadata->>'tipoDespacho'='alerta_rescate')
          UNION SELECT lower(btrim(d.clave_destinatario)) FROM public.despachos_correo d WHERE d.expedicion_id=e.id AND d.tipo_despacho='alerta_rescate'
        )
      )
  )
  INSERT INTO public.outbox_notificaciones(clave_evento,canal,tipo_evento,destinatario,asunto,cuerpo,metadata)
    SELECT 'RETORNO_SEGURO:'||e.id,'correo','RETORNO_CONFIRMADO',lower(btrim(correo)),
      'TrekSafe: retorno confirmado',
      format('Ruta: %s - %s. Retorno confirmado: %s (America/Lima).',e.lugar_inicio,e.lugar_fin,to_char(t AT TIME ZONE 'America/Lima','YYYY-MM-DD HH24:MI:SS')),
      jsonb_build_object('expedicionId',e.id,'eventoId',evento,'confirmadoEn',t)
    FROM destinatarios WHERE correo IS NOT NULL GROUP BY lower(btrim(correo))
    ON CONFLICT(clave_evento,destinatario_normalizado,canal) DO NOTHING;
  SELECT * INTO e FROM public.expediciones WHERE id=e.id;
  RETURN to_jsonb(e);
END $$;
REVOKE ALL ON FUNCTION public.treksafe_confirmar_retorno_con_outbox(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.treksafe_confirmar_retorno_con_outbox(uuid,uuid) TO service_role;
INSERT INTO public.treksafe_migraciones(version,nombre,hu) VALUES('027','hu44_retorno_atomico','HU-44');
NOTIFY pgrst,'reload schema';
COMMIT;

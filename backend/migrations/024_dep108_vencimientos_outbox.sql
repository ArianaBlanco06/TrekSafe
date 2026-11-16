-- DEP-04: productor transaccional futuro de DEP-02. No reemplaza el cron legado.
-- Requiere 015 y 022; usa versiones compartidas de 002. No registra datos médicos.
BEGIN;
CREATE FUNCTION public.treksafe_evaluar_vencimientos_con_outbox(p_limite INTEGER DEFAULT 100)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
    v_exp public.expediciones%ROWTYPE;
    v_ids UUID[] := ARRAY[]::uuid[];
    v_sin_destinatarios UUID[] := ARRAY[]::uuid[];
    v_pendientes INTEGER := 0;
    v_insertados INTEGER;
BEGIN
    IF p_limite IS NULL OR p_limite NOT BETWEEN 1 AND 500 THEN
        RAISE EXCEPTION 'LIMITE_INVALIDO';
    END IF;
    FOR v_exp IN
        SELECT e.* FROM public.expediciones e
        WHERE e.estado = 'en_progreso'
          AND e.hora_retorno_estimada + make_interval(mins => e.minutos_tolerancia) < clock_timestamp()
        ORDER BY e.hora_retorno_estimada, e.id
        LIMIT p_limite FOR UPDATE OF e SKIP LOCKED
    LOOP
        -- La fila está bloqueada; ampliación/cancelación/retorno usan la misma fila.
        IF v_exp.estado <> 'en_progreso'
            OR v_exp.hora_retorno_estimada + make_interval(mins => v_exp.minutos_tolerancia) >= clock_timestamp() THEN
            CONTINUE;
        END IF;
        IF v_exp.version = 2147483647 THEN RAISE EXCEPTION 'VERSION_PLAN_AGOTADA'; END IF;
        UPDATE public.expediciones SET estado = 'alerta', version = version + 1,
            actualizado_en = clock_timestamp() WHERE id = v_exp.id;

        INSERT INTO public.outbox_notificaciones (
            clave_evento, tipo_evento, destinatario, asunto, cuerpo, metadata
        )
        SELECT 'ALERTA_CONTACTO:' || v_exp.id, 'ALERTA_CONTACTO', lower(btrim(c.correo_electronico)),
            'TrekSafe: expedición con retorno vencido',
            'Se requiere revisar la expedición ' || v_exp.id || ' en TrekSafe.',
            jsonb_build_object('expedicionId', v_exp.id, 'tipoDespacho', 'alerta_contacto')
        FROM public.vinculos_expedicion_contacto vc
        JOIN public.contactos_emergencia c ON c.id = vc.contacto_id
        WHERE vc.expedicion_id = v_exp.id AND c.senderista_id = v_exp.senderista_id
        ON CONFLICT (clave_evento, destinatario_normalizado, canal) DO NOTHING;
        GET DIAGNOSTICS v_insertados = ROW_COUNT;
        v_pendientes := v_pendientes + v_insertados;

        INSERT INTO public.outbox_notificaciones (
            clave_evento, tipo_evento, destinatario, asunto, cuerpo, metadata
        )
        SELECT 'ALERTA_RESCATE:' || v_exp.id, 'ALERTA_RESCATE', lower(btrim(u.correo_electronico)),
            'TrekSafe: alerta para revisión',
            'Se requiere revisar la expedición ' || v_exp.id || ' en TrekSafe con acceso autorizado.',
            jsonb_build_object('expedicionId', v_exp.id, 'tipoDespacho', 'alerta_rescate')
        FROM public.perfiles_rescatista pr JOIN public.usuarios u ON u.id = pr.usuario_id
        WHERE u.rol = 'rescatista'
        ON CONFLICT (clave_evento, destinatario_normalizado, canal) DO NOTHING;
        GET DIAGNOSTICS v_insertados = ROW_COUNT;
        v_pendientes := v_pendientes + v_insertados;
        IF NOT EXISTS (SELECT 1 FROM public.outbox_notificaciones
            WHERE clave_evento IN ('ALERTA_CONTACTO:' || v_exp.id, 'ALERTA_RESCATE:' || v_exp.id)) THEN
            v_sin_destinatarios := array_append(v_sin_destinatarios, v_exp.id);
        END IF;
        v_ids := array_append(v_ids, v_exp.id);
    END LOOP;
    RETURN jsonb_build_object('expediciones', to_jsonb(v_ids), 'enAlerta', cardinality(v_ids),
        'pendientes', v_pendientes, 'sinDestinatarios', to_jsonb(v_sin_destinatarios));
END;
$$;
REVOKE ALL ON FUNCTION public.treksafe_evaluar_vencimientos_con_outbox(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.treksafe_evaluar_vencimientos_con_outbox(INTEGER) TO service_role;
INSERT INTO public.treksafe_migraciones(version, nombre, hu)
VALUES ('024', 'dep108_vencimientos_outbox', 'DEP-04');
NOTIFY pgrst, 'reload schema';
COMMIT;

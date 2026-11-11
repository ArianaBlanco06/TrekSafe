-- Solo proyecto DEV ibn...; ejecutar por la conexión seleccionada explícitamente.
-- No correo ni cron. Todas las filas ficticias se revierten en la misma sesión.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL ROLE service_role;
DO $qa$
DECLARE
    v_actor UUID := gen_random_uuid();
    v_otro UUID := gen_random_uuid();
    v_rescatista UUID := gen_random_uuid();
    v_contacto UUID := gen_random_uuid();
    v_operacion UUID := gen_random_uuid();
    v_coord UUID := gen_random_uuid();
    v_resultado JSONB;
    v_repetido JSONB;
    v_plan UUID;
    v_alerta UUID;
    v_datos JSONB;
    v_antes INTEGER;
    v_despues INTEGER;
    v_error BOOLEAN;
    v_credencial TEXT := 'QA108-' || gen_random_uuid()::text;
BEGIN
    IF EXISTS (SELECT 1 FROM public.usuarios WHERE correo_electronico LIKE 'qa-dep108-20261111-%') THEN
        RAISE EXCEPTION 'Prefijo de pruebas ocupado: inspeccionar sin borrar datos';
    END IF;
    INSERT INTO public.usuarios(id, correo_electronico, hash_contrasena, rol) VALUES
        (v_actor, 'qa-dep108-20261111-' || v_actor || '@example.invalid', 'ficticio-no-utilizable-para-login', 'senderista'),
        (v_otro, 'qa-dep108-20261111-' || v_otro || '@example.invalid', 'ficticio-no-utilizable-para-login', 'senderista'),
        (v_rescatista, 'qa-dep108-20261111-' || v_rescatista || '@example.invalid', 'ficticio-no-utilizable-para-login', 'rescatista');
    INSERT INTO public.perfiles_senderista(usuario_id, nombre_completo, telefono, id_documento) VALUES
        (v_actor, 'QA DEP108 Senderista Ficticio', '000000001', 'QA' || left(v_actor::text, 18)),
        (v_otro, 'QA DEP108 Otro Ficticio', '000000002', 'QA' || left(v_otro::text, 18));
    INSERT INTO public.registros_institucionales_rescatista(institucion, numero_credencial, nombre_completo, fecha_nacimiento)
        VALUES ('AGMP', v_credencial, 'QA DEP108 Rescatista Ficticio', '1990-01-01');
    INSERT INTO public.perfiles_rescatista(usuario_id, numero_credencial, nombre_completo, fecha_nacimiento)
        VALUES (v_rescatista, v_credencial, 'QA DEP108 Rescatista Ficticio', '1990-01-01');
    INSERT INTO public.contactos_emergencia(id, senderista_id, nombre_completo, parentesco, telefono, correo_electronico)
        VALUES (v_contacto, v_actor, 'QA Contacto Ficticio', 'Prueba', '000000003',
            'qa-dep108-contacto-' || v_actor || '@example.invalid');
    v_datos := jsonb_build_object('lugarInicio', 'QA Inicio', 'lugarFin', 'QA Destino',
        'horaInicio', clock_timestamp() + interval '12 hours',
        'horaRetornoEstimada', clock_timestamp() + interval '15 hours',
        'minutosTolerancia', 30, 'minutosRecordatorio', 30,
        'idsContactos', jsonb_build_array(v_contacto), 'nombresAcompanantes', jsonb_build_array('QA Acompanante'));

    v_resultado := public.treksafe_crear_expedicion(v_actor, v_datos);
    v_plan := (v_resultado->>'id')::uuid;
    IF v_resultado->>'estado' <> 'programada'
        OR (SELECT count(*) FROM public.vinculos_expedicion_contacto WHERE expedicion_id=v_plan) <> 1
        OR (SELECT count(*) FROM public.acompanantes_expedicion WHERE expedicion_id=v_plan) <> 1 THEN
        RAISE EXCEPTION 'Creacion incompleta o estado inesperado';
    END IF;

    SELECT count(*) INTO v_antes FROM public.expediciones WHERE senderista_id=v_otro;
    v_error := false;
    BEGIN
        PERFORM public.treksafe_crear_expedicion(v_otro, v_datos);
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM <> 'CONTACTOS_INVALIDOS' THEN RAISE; END IF;
        v_error := true;
    END;
    SELECT count(*) INTO v_despues FROM public.expediciones WHERE senderista_id=v_otro;
    IF NOT v_error OR v_antes <> v_despues THEN RAISE EXCEPTION 'Propiedad o atomicidad de contacto'; END IF;

    v_resultado := public.treksafe_cancelar_expedicion(v_plan, v_actor, 'QA cancelacion', v_operacion);
    v_repetido := public.treksafe_cancelar_expedicion(v_plan, v_actor, 'QA cancelacion', v_operacion);
    IF v_resultado <> v_repetido OR v_resultado->>'estado' <> 'cancelada'
        OR (SELECT count(*) FROM public.eventos_plan WHERE operacion_id=v_operacion) <> 1
        OR (SELECT count(*) FROM public.avisos_usuario a JOIN public.eventos_plan e ON a.evento_id=e.id
            WHERE e.operacion_id=v_operacion AND a.clave_evento=e.id::text) <> 1 THEN
        RAISE EXCEPTION 'Cancelacion/evento/aviso no atomico o repetido';
    END IF;

    v_resultado := public.treksafe_crear_expedicion(v_actor, v_datos);
    v_alerta := (v_resultado->>'id')::uuid;
    UPDATE public.expediciones SET hora_inicio='1969-01-01', hora_retorno_estimada='1970-01-01', estado='en_progreso'
        WHERE id=v_alerta;
    -- Evita que el productor global siquiera examine datos ajenos a esta prueba.
    IF (SELECT id FROM public.expediciones WHERE estado='en_progreso'
        AND hora_retorno_estimada + make_interval(mins=>minutos_tolerancia) < clock_timestamp()
        ORDER BY hora_retorno_estimada,id LIMIT 1) IS DISTINCT FROM v_alerta THEN
        RAISE EXCEPTION 'La prueba no puede aislar el candidato de vencimiento; abortar';
    END IF;
    v_resultado := public.treksafe_evaluar_vencimientos_con_outbox(1);
    IF v_resultado->>'enAlerta' <> '1'
        OR (SELECT estado FROM public.expediciones WHERE id=v_alerta) <> 'alerta'
        OR NOT EXISTS (SELECT 1 FROM public.outbox_notificaciones
            WHERE metadata->>'expedicionId'=v_alerta::text AND destinatario LIKE 'qa-dep108-contacto-%'
              AND estado='pendiente' AND clave_evento='ALERTA_CONTACTO:'||v_alerta::text)
        OR EXISTS (SELECT 1 FROM public.outbox_notificaciones
            WHERE metadata->>'expedicionId'=v_alerta::text AND metadata ? 'fichaMedica') THEN
        RAISE EXCEPTION 'Vencimiento o pendientes transaccionales incorrectos';
    END IF;
    SELECT count(*) INTO v_antes FROM public.outbox_notificaciones WHERE metadata->>'expedicionId'=v_alerta::text;
    -- La segunda evaluación podría encontrar otras expediciones de DEV. No llamarla:
    -- deduplicación se verifica sobre la clave exacta de la fila ficticia.
    INSERT INTO public.outbox_notificaciones(clave_evento,tipo_evento,destinatario,asunto,cuerpo)
        SELECT clave_evento,tipo_evento,upper(destinatario),asunto,cuerpo
        FROM public.outbox_notificaciones
        WHERE metadata->>'expedicionId'=v_alerta::text AND tipo_evento='ALERTA_CONTACTO'
        ON CONFLICT (clave_evento,destinatario_normalizado,canal) DO NOTHING;
    GET DIAGNOSTICS v_despues = ROW_COUNT;
    IF v_despues <> 0 OR (SELECT count(*) FROM public.outbox_notificaciones
        WHERE clave_evento='ALERTA_CONTACTO:'||v_alerta::text) <> 1 THEN
        RAISE EXCEPTION 'Duplicado por destinatario normalizado';
    END IF;
    SELECT count(*) INTO v_despues FROM public.outbox_notificaciones WHERE metadata->>'expedicionId'=v_alerta::text;
    IF v_antes<>v_despues THEN RAISE EXCEPTION 'Duplicado por destinatario normalizado'; END IF;

    v_resultado := public.treksafe_asumir_coordinacion(v_alerta,v_rescatista,v_coord);
    v_repetido := public.treksafe_asumir_coordinacion(v_alerta,v_rescatista,v_coord);
    IF v_resultado->>'id' IS DISTINCT FROM v_repetido->>'id'
        OR v_resultado->'responsable'->>'id' <> v_rescatista::text
        OR (SELECT count(*) FROM public.incidentes WHERE operacion_id=v_coord) <> 1 THEN
        RAISE EXCEPTION 'Coordinacion HU39 incompatible';
    END IF;
END;
$qa$;
RESET ROLE;
ROLLBACK;
SELECT 'Pruebas DEV aprobadas; transaccion revertida, sin correo ni cron' AS resultado,
    (SELECT count(*) FROM public.usuarios WHERE correo_electronico LIKE 'qa-dep108-20261111-%') AS usuarios_ficticios_restantes;

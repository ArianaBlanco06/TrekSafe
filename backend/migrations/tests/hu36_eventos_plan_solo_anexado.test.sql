-- Solo PostgreSQL local desechable; todos los datos de prueba se revierten.
-- Requiere: init_schema.sql y las migraciones 002 a 007 y 010 aplicadas.
BEGIN;

CREATE TEMP TABLE hu36_ids (clave TEXT PRIMARY KEY, valor UUID NOT NULL) ON COMMIT DROP;
GRANT SELECT ON hu36_ids TO service_role;

-- 1) Esquema, funciones, triggers y permisos.
DO $$
DECLARE
    v_funcion REGPROCEDURE;
    v_rol TEXT;
    v_privilegio TEXT;
    v_trigger TEXT;
BEGIN
    FOREACH v_trigger IN ARRAY ARRAY[
        'trg_eventos_plan_antes_de_insertar', 'trg_eventos_plan_solo_anexado',
        'trg_eventos_plan_sin_borrado', 'trg_eventos_plan_sin_truncate'
    ] LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_trigger
            WHERE tgrelid = 'public.eventos_plan'::REGCLASS AND tgname = v_trigger AND tgenabled <> 'D') THEN
            RAISE EXCEPTION 'Falta el trigger %', v_trigger;
        END IF;
    END LOOP;

    FOREACH v_funcion IN ARRAY ARRAY[
        'public.treksafe_sanear_cambios_evento_plan(jsonb)'::REGPROCEDURE,
        'public.treksafe_eventos_plan_antes_de_insertar()'::REGPROCEDURE,
        'public.treksafe_eventos_plan_solo_anexado()'::REGPROCEDURE
    ] LOOP
        IF (SELECT prosecdef FROM pg_proc WHERE oid = v_funcion) THEN
            RAISE EXCEPTION 'La función debe ser SECURITY INVOKER: %', v_funcion;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_proc p, unnest(p.proconfig) c
            WHERE p.oid = v_funcion AND c = 'search_path=""') THEN
            RAISE EXCEPTION 'La función debe tener search_path vacio: %', v_funcion;
        END IF;
        FOREACH v_rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
            IF has_function_privilege(v_rol, v_funcion, 'EXECUTE') THEN
                RAISE EXCEPTION 'Función expuesta al cliente: % %', v_funcion, v_rol;
            END IF;
        END LOOP;
    END LOOP;
    IF NOT has_function_privilege('service_role', 'public.treksafe_sanear_cambios_evento_plan(jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role debe poder sanear al insertar';
    END IF;

    FOREACH v_privilegio IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] LOOP
        FOREACH v_rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
            IF has_table_privilege(v_rol, 'public.eventos_plan', v_privilegio) THEN
                RAISE EXCEPTION 'Permiso directo inesperado: % %', v_rol, v_privilegio;
            END IF;
        END LOOP;
    END LOOP;
    IF NOT has_table_privilege('service_role', 'public.eventos_plan', 'SELECT')
       OR NOT has_table_privilege('service_role', 'public.eventos_plan', 'INSERT') THEN
        RAISE EXCEPTION 'service_role debe conservar SELECT e INSERT';
    END IF;
    FOREACH v_privilegio IN ARRAY ARRAY['UPDATE', 'DELETE', 'TRUNCATE'] LOOP
        IF has_table_privilege('service_role', 'public.eventos_plan', v_privilegio) THEN
            RAISE EXCEPTION 'service_role no debe tener % de tabla', v_privilegio;
        END IF;
    END LOOP;
    IF NOT has_column_privilege('service_role', 'public.eventos_plan', 'cambios', 'UPDATE')
       OR NOT has_column_privilege('service_role', 'public.eventos_plan', 'motivo', 'UPDATE') THEN
        RAISE EXCEPTION 'service_role debe conservar UPDATE (cambios, motivo) para ARCO';
    END IF;
    IF has_column_privilege('service_role', 'public.eventos_plan', 'tipo', 'UPDATE')
       OR has_column_privilege('service_role', 'public.eventos_plan', 'ocurrido_en', 'UPDATE') THEN
        RAISE EXCEPTION 'service_role no debe actualizar columnas de auditoría';
    END IF;
END;
$$;

-- 2) Saneamiento puro.
DO $$
BEGIN
    IF public.treksafe_sanear_cambios_evento_plan(NULL) <> '{}'::jsonb
       OR public.treksafe_sanear_cambios_evento_plan('[]'::jsonb) <> '{}'::jsonb
       OR public.treksafe_sanear_cambios_evento_plan('"texto"'::jsonb) <> '{}'::jsonb THEN
        RAISE EXCEPTION 'Un valor que no es objeto debe sanearse a {}';
    END IF;
    IF public.treksafe_sanear_cambios_evento_plan(jsonb_build_object(
        'lugarFin', jsonb_build_object('antes', 'A', 'despues', 'B', 'contrasena', 'x'),
        'coordenadasInicio', jsonb_build_object('antes', NULL, 'despues', '-9.1, -77.6'),
        'fichaMedica', jsonb_build_object('antes', 'alergia', 'despues', 'otra'),
        'contrasena', jsonb_build_object('antes', 'a', 'despues', 'b'),
        'minutosTolerancia', 30,
        'estado', jsonb_build_object('otra', 1)
    )) <> jsonb_build_object(
        'lugarFin', jsonb_build_object('antes', 'A', 'despues', 'B'),
        'coordenadasInicio', jsonb_build_object('antes', NULL, 'despues', '-9.1, -77.6')
    ) THEN
        RAISE EXCEPTION 'La lista blanca no se aplicó como se esperaba';
    END IF;
END;
$$;

-- 3) Datos de prueba: cuenta, expedición y eventos (inserción saneada y reloj de la base).
DO $$
DECLARE
    v_actor UUID := gen_random_uuid();
    v_expedicion UUID := gen_random_uuid();
    v_evento UUID;
    v_fila public.eventos_plan%ROWTYPE;
BEGIN
    INSERT INTO hu36_ids VALUES ('actor', v_actor), ('expedicion', v_expedicion);
    INSERT INTO public.usuarios(id, correo_electronico, hash_contrasena, rol)
    VALUES (v_actor, v_actor::TEXT || '@example.invalid', 'fixture', 'senderista');
    INSERT INTO public.perfiles_senderista(usuario_id, nombre_completo, telefono, id_documento)
    VALUES (v_actor, 'Prueba esquema HU-36', '+51900000036', LEFT(v_actor::TEXT, 20));
    INSERT INTO public.expediciones(id, senderista_id, lugar_inicio, lugar_fin, hora_inicio, hora_retorno_estimada)
    VALUES (v_expedicion, v_actor, 'Inicio', 'Fin', NOW() + INTERVAL '1 day', NOW() + INTERVAL '2 days');

    INSERT INTO public.eventos_plan(expedicion_id, senderista_id, tipo, actor_id, ocurrido_en,
        version_resultante, cambios, motivo, operacion_id)
    VALUES (v_expedicion, v_actor, 'EDITADA', v_actor, '2000-01-01T00:00:00Z', 2,
        jsonb_build_object(
            'lugarFin', jsonb_build_object('antes', 'Fin', 'despues', 'Laguna 69'),
            'hashContrasena', jsonb_build_object('antes', 'x', 'despues', 'y')
        ), NULL, gen_random_uuid())
    RETURNING id INTO v_evento;
    INSERT INTO hu36_ids VALUES ('evento', v_evento);

    SELECT * INTO v_fila FROM public.eventos_plan WHERE id = v_evento;
    IF v_fila.cambios <> jsonb_build_object('lugarFin', jsonb_build_object('antes', 'Fin', 'despues', 'Laguna 69')) THEN
        RAISE EXCEPTION 'El trigger de inserción debe sanear cambios: %', v_fila.cambios;
    END IF;
    IF v_fila.ocurrido_en <> now() THEN
        RAISE EXCEPTION 'ocurrido_en debe fijarlo la base, no el cliente';
    END IF;

    -- La RPC de cancelación (HU-27) sigue registrando su evento sin cambios.
    PERFORM public.treksafe_cancelar_expedicion(v_expedicion, v_actor, 'Motivo de prueba', gen_random_uuid());
    IF NOT EXISTS (SELECT 1 FROM public.eventos_plan
        WHERE expedicion_id = v_expedicion AND tipo = 'CANCELADA'
          AND cambios = jsonb_build_object('estado', jsonb_build_object('antes', 'programada', 'despues', 'cancelada'))
          AND motivo = 'Motivo de prueba') THEN
        RAISE EXCEPTION 'La RPC de cancelación debe seguir registrando el evento';
    END IF;
END;
$$;

-- 4) Inmutabilidad para el propietario del esquema (los triggers aplican a todos).
DO $$
DECLARE
    v_evento UUID := (SELECT valor FROM hu36_ids WHERE clave = 'evento');
    v_bloqueado BOOLEAN;
    v_sentencia TEXT;
BEGIN
    FOREACH v_sentencia IN ARRAY ARRAY[
        format('UPDATE public.eventos_plan SET tipo = %L WHERE id = %L', 'CANCELADA', v_evento),
        format('UPDATE public.eventos_plan SET ocurrido_en = now() - interval %L WHERE id = %L', '1 day', v_evento),
        format('UPDATE public.eventos_plan SET cambios = %L::jsonb WHERE id = %L', '{"lugarFin":{"antes":"A","despues":"B"}}', v_evento),
        format('UPDATE public.eventos_plan SET cambios = %L::jsonb, motivo = %L WHERE id = %L', '{}', 'otro', v_evento),
        format('UPDATE public.eventos_plan SET cambios = %L::jsonb, motivo = NULL, version_resultante = 9 WHERE id = %L', '{}', v_evento),
        format('DELETE FROM public.eventos_plan WHERE id = %L', v_evento),
        'TRUNCATE public.eventos_plan'
    ] LOOP
        v_bloqueado := FALSE;
        BEGIN
            EXECUTE v_sentencia;
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM <> 'EVENTO_PLAN_INMUTABLE' THEN RAISE; END IF;
            v_bloqueado := TRUE;
        END;
        IF NOT v_bloqueado THEN
            RAISE EXCEPTION 'Debe rechazar: %', v_sentencia;
        END IF;
    END LOOP;
    IF (SELECT tipo FROM public.eventos_plan WHERE id = v_evento) <> 'EDITADA' THEN
        RAISE EXCEPTION 'El evento no debe cambiar';
    END IF;
END;
$$;

-- 5) Permisos reales de service_role: sin UPDATE de auditoría ni DELETE; ARCO permitido.
SET LOCAL ROLE service_role;
DO $$
DECLARE
    v_evento UUID := (SELECT valor FROM hu36_ids WHERE clave = 'evento');
    v_sentencia TEXT;
    v_bloqueado BOOLEAN;
BEGIN
    FOREACH v_sentencia IN ARRAY ARRAY[
        format('UPDATE public.eventos_plan SET tipo = %L WHERE id = %L', 'CANCELADA', v_evento),
        format('DELETE FROM public.eventos_plan WHERE id = %L', v_evento),
        'TRUNCATE public.eventos_plan'
    ] LOOP
        v_bloqueado := FALSE;
        BEGIN
            EXECUTE v_sentencia;
        EXCEPTION WHEN insufficient_privilege THEN
            v_bloqueado := TRUE;
        END;
        IF NOT v_bloqueado THEN
            RAISE EXCEPTION 'service_role no debe poder: %', v_sentencia;
        END IF;
    END LOOP;

    -- Anonimización ARCO igual que RepositorioUsuario.anonimizarHistorialRutas.
    UPDATE public.eventos_plan SET cambios = '{}'::jsonb, motivo = NULL
    WHERE expedicion_id = (SELECT valor FROM hu36_ids WHERE clave = 'expedicion');
    IF EXISTS (SELECT 1 FROM public.eventos_plan
        WHERE expedicion_id = (SELECT valor FROM hu36_ids WHERE clave = 'expedicion')
          AND (cambios <> '{}'::jsonb OR motivo IS NOT NULL)) THEN
        RAISE EXCEPTION 'La anonimización ARCO debe vaciar cambios y motivo';
    END IF;
    IF (SELECT count(*) FROM public.eventos_plan
        WHERE expedicion_id = (SELECT valor FROM hu36_ids WHERE clave = 'expedicion')) <> 2 THEN
        RAISE EXCEPTION 'La anonimización debe conservar los eventos';
    END IF;
END;
$$;
RESET ROLE;

-- 6) Regresión: un DELETE de un evento desde otro trigger (pg_trigger_depth() = 2)
--    sigue rechazado porque su expedición existe.
CREATE TEMP TABLE hu36_borrador_indirecto (evento UUID NOT NULL) ON COMMIT DROP;
CREATE FUNCTION pg_temp.hu36_borrar_evento() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM public.eventos_plan WHERE id = NEW.evento;
    RETURN NEW;
END;
$$;
CREATE TRIGGER hu36_borrar_evento AFTER INSERT ON hu36_borrador_indirecto
    FOR EACH ROW EXECUTE FUNCTION pg_temp.hu36_borrar_evento();
DO $$
DECLARE
    v_evento UUID := (SELECT valor FROM hu36_ids WHERE clave = 'evento');
    v_bloqueado BOOLEAN := FALSE;
BEGIN
    BEGIN
        INSERT INTO hu36_borrador_indirecto VALUES (v_evento);
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM <> 'EVENTO_PLAN_INMUTABLE' THEN RAISE; END IF;
        v_bloqueado := TRUE;
    END;
    IF NOT v_bloqueado OR NOT EXISTS (SELECT 1 FROM public.eventos_plan WHERE id = v_evento) THEN
        RAISE EXCEPTION 'Un DELETE indirecto desde otro trigger debe rechazarse';
    END IF;
END;
$$;

-- 7) La cascada desde expediciones y desde la cuenta sigue funcionando para service_role.
DO $$
DECLARE
    v_actor UUID := (SELECT valor FROM hu36_ids WHERE clave = 'actor');
    v_otra UUID := gen_random_uuid();
BEGIN
    INSERT INTO hu36_ids VALUES ('otra', v_otra);
    INSERT INTO public.expediciones(id, senderista_id, lugar_inicio, lugar_fin, hora_inicio, hora_retorno_estimada)
    VALUES (v_otra, v_actor, 'Inicio', 'Fin', NOW() + INTERVAL '1 day', NOW() + INTERVAL '2 days');
    INSERT INTO public.eventos_plan(expedicion_id, senderista_id, tipo, actor_id, version_resultante, cambios, operacion_id)
    VALUES (v_otra, v_actor, 'EDITADA', v_actor, 2, '{}'::jsonb, gen_random_uuid());
END;
$$;
-- Emula privilegios por defecto de Supabase (service_role tiene CRUD sobre estas tablas);
-- se revierte con el ROLLBACK final.
GRANT SELECT, DELETE ON public.expediciones, public.usuarios TO service_role;
SET LOCAL ROLE service_role;
DO $$
DECLARE
    v_actor UUID := (SELECT valor FROM hu36_ids WHERE clave = 'actor');
    v_expedicion UUID := (SELECT valor FROM hu36_ids WHERE clave = 'expedicion');
    v_otra UUID := (SELECT valor FROM hu36_ids WHERE clave = 'otra');
BEGIN
    DELETE FROM public.expediciones WHERE id = v_expedicion;
    IF EXISTS (SELECT 1 FROM public.eventos_plan WHERE expedicion_id = v_expedicion) THEN
        RAISE EXCEPTION 'Eliminar la expedición debe eliminar sus eventos por cascada';
    END IF;
    DELETE FROM public.usuarios WHERE id = v_actor;
    IF EXISTS (SELECT 1 FROM public.eventos_plan WHERE expedicion_id = v_otra) THEN
        RAISE EXCEPTION 'Eliminar la cuenta debe eliminar sus eventos por cascada';
    END IF;
    RAISE NOTICE 'HU-36: lista blanca, reloj, inmutabilidad, permisos, ARCO, borrado indirecto y cascadas comprobados';
END;
$$;
RESET ROLE;

ROLLBACK;

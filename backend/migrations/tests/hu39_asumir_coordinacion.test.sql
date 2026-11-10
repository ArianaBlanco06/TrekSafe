-- Solo PostgreSQL local desechable; todos los datos de prueba se revierten (ROLLBACK final).
-- Requiere: los roles anon, authenticated y service_role con los privilegios por defecto
-- de Supabase, el esquema base (usuarios, perfiles_senderista, perfiles_rescatista,
-- expediciones), las migraciones 000 a 016 y la 017 aplicadas. Se ejecuta con
-- backend/scripts/test-hu39-postgres.mjs, que prepara ese entorno. Cada caso imprime un
-- aviso "OK n: ..."; el primero que falla aborta el archivo con su mensaje.
-- La carrera real entre dos sesiones se prueba en el script .mjs, no aquí.
BEGIN;

-- Ayudante de pruebas: ejecuta la RPC como service_role y devuelve el código del error
-- (o 'OK') y el DETAIL. Vive en un esquema que se revierte con la transacción.
CREATE SCHEMA hu39_prueba;
GRANT USAGE ON SCHEMA hu39_prueba TO service_role;

CREATE FUNCTION hu39_prueba.asumir(p_exp UUID, p_resc UUID, p_op UUID)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
    v_detalle TEXT;
    v_codigo  TEXT;
    v_res     JSONB;
BEGIN
    BEGIN
        v_res := public.treksafe_asumir_coordinacion(p_exp, p_resc, p_op);
        RETURN jsonb_build_object('codigo', 'OK', 'resultado', v_res);
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_detalle = PG_EXCEPTION_DETAIL;
        v_codigo := SQLERRM;
        RETURN jsonb_build_object('codigo', v_codigo, 'detalle', v_detalle);
    END;
END;
$$;
GRANT EXECUTE ON FUNCTION hu39_prueba.asumir(UUID, UUID, UUID) TO service_role;

-- Datos de prueba (superusuario).
INSERT INTO public.usuarios (id, correo_electronico, hash_contrasena, rol) VALUES
    ('a0000000-0000-4000-8000-000000000001', 'resc1@example.invalid', 'fixture', 'rescatista'),
    ('a0000000-0000-4000-8000-000000000002', 'resc2@example.invalid', 'fixture', 'rescatista'),
    ('b0000000-0000-4000-8000-000000000001', 'send1@example.invalid', 'fixture', 'senderista');
INSERT INTO public.perfiles_senderista (usuario_id, nombre_completo, telefono, id_documento)
    VALUES ('b0000000-0000-4000-8000-000000000001', 'Senderista Ficticio', '999999999', '00000001');
INSERT INTO public.registros_institucionales_rescatista
    (institucion, numero_credencial, nombre_completo, fecha_nacimiento) VALUES
    ('AGMP', 'CRED-1', 'Rescatista Uno', '1990-01-01'),
    ('AGMP', 'CRED-2', 'Rescatista Dos', '1991-02-02');
INSERT INTO public.perfiles_rescatista (usuario_id, numero_credencial, nombre_completo, fecha_nacimiento) VALUES
    ('a0000000-0000-4000-8000-000000000001', 'CRED-1', 'Rescatista Uno', '1990-01-01'),
    ('a0000000-0000-4000-8000-000000000002', 'CRED-2', 'Rescatista Dos', '1991-02-02');

INSERT INTO public.expediciones
    (id, senderista_id, lugar_inicio, lugar_fin, hora_inicio, hora_retorno_estimada, estado)
SELECT id, 'b0000000-0000-4000-8000-000000000001', 'Inicio', 'Destino',
       now() - interval '5 hours', now() - interval '2 hours', estado::public.estado_expedicion_enum
FROM (VALUES
    ('e0000000-0000-4000-8000-000000000001'::uuid, 'alerta'),
    ('e0000000-0000-4000-8000-000000000002'::uuid, 'alerta'),
    ('e0000000-0000-4000-8000-000000000003'::uuid, 'alerta'),
    ('e0000000-0000-4000-8000-000000000011'::uuid, 'en_progreso'),
    ('e0000000-0000-4000-8000-000000000012'::uuid, 'programada'),
    ('e0000000-0000-4000-8000-000000000013'::uuid, 'completada'),
    ('e0000000-0000-4000-8000-000000000014'::uuid, 'cancelada')
) AS t (id, estado);

-- 1) Esquema, permisos y funciones (superusuario).
DO $$
DECLARE
    v_funcion REGPROCEDURE;
    v_rol TEXT;
    v_columnas TEXT;
BEGIN
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.incidentes'::REGCLASS) THEN
        RAISE EXCEPTION 'incidentes debe tener RLS activo';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
        AND tablename = 'incidentes' AND policyname = 'treksafe_deny_anon_authenticated') THEN
        RAISE EXCEPTION 'Falta la política treksafe_deny_anon_authenticated';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
        AND indexname = 'uq_incidentes_expedicion_no_cerrado'
        AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%WHERE%') THEN
        RAISE EXCEPTION 'Falta el índice único parcial uq_incidentes_expedicion_no_cerrado';
    END IF;

    FOREACH v_funcion IN ARRAY ARRAY[
        'public.treksafe_asumir_coordinacion(uuid,uuid,uuid)'::REGPROCEDURE,
        'public.treksafe_resultado_coordinacion(public.incidentes,boolean)'::REGPROCEDURE
    ] LOOP
        IF (SELECT prosecdef FROM pg_proc WHERE oid = v_funcion) THEN
            RAISE EXCEPTION 'La función debe ser SECURITY INVOKER: %', v_funcion;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_proc p, unnest(p.proconfig) c
            WHERE p.oid = v_funcion AND c = 'search_path=""') THEN
            RAISE EXCEPTION 'La función debe tener search_path vacío: %', v_funcion;
        END IF;
        FOREACH v_rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
            IF has_function_privilege(v_rol, v_funcion, 'EXECUTE') THEN
                RAISE EXCEPTION 'Función expuesta al cliente: % %', v_funcion, v_rol;
            END IF;
        END LOOP;
        -- PUBLIC (grantee 0). Si proacl es NULL rige el permiso por defecto (EXECUTE a
        -- PUBLIC), por eso se usa acldefault y no el texto de proacl.
        IF EXISTS (
            SELECT 1 FROM pg_proc p,
                 aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
            WHERE p.oid = v_funcion AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
        ) THEN
            RAISE EXCEPTION 'PUBLIC no debe ejecutar %', v_funcion;
        END IF;
        IF NOT has_function_privilege('service_role', v_funcion, 'EXECUTE') THEN
            RAISE EXCEPTION 'service_role debe poder ejecutar %', v_funcion;
        END IF;
    END LOOP;

    -- Sin datos médicos ni de otra índole: la tabla tiene exactamente estas columnas.
    SELECT string_agg(column_name, ',' ORDER BY column_name) INTO v_columnas
    FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'incidentes';
    IF v_columnas <> 'abierto_en,asumido_en,cerrado_en,estado,expedicion_id,id,operacion_id,responsable_id,version' THEN
        RAISE EXCEPTION 'Columnas inesperadas en incidentes: %', v_columnas;
    END IF;
    RAISE NOTICE 'OK 1: RLS, política, índice único parcial, funciones SECURITY INVOKER con search_path vacío, sin columnas médicas';
END $$;

-- 2) Privilegios por rol sobre la tabla y la RPC.
DO $$
DECLARE
    v_rol TEXT;
    v_n INTEGER;
BEGIN
    FOREACH v_rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        EXECUTE format('SET LOCAL ROLE %I', v_rol);
        BEGIN
            PERFORM count(*) FROM public.incidentes;
            RESET ROLE;
            RAISE EXCEPTION '% pudo leer incidentes', v_rol;
        EXCEPTION WHEN insufficient_privilege THEN
            RESET ROLE;
        END;
        EXECUTE format('SET LOCAL ROLE %I', v_rol);
        BEGIN
            PERFORM public.treksafe_asumir_coordinacion(
                'e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', gen_random_uuid());
            RESET ROLE;
            RAISE EXCEPTION '% pudo ejecutar la RPC', v_rol;
        EXCEPTION WHEN insufficient_privilege THEN
            RESET ROLE;
        END;
        EXECUTE format('SET LOCAL ROLE %I', v_rol);
        BEGIN
            INSERT INTO public.incidentes (expedicion_id, responsable_id, operacion_id)
            VALUES ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', gen_random_uuid());
            RESET ROLE;
            RAISE EXCEPTION '% pudo escribir en incidentes', v_rol;
        EXCEPTION WHEN insufficient_privilege THEN
            RESET ROLE;
        END;
    END LOOP;

    SET LOCAL ROLE service_role;
    SELECT count(*) INTO v_n FROM public.incidentes;
    RESET ROLE;
    IF v_n <> 0 THEN RAISE EXCEPTION 'incidentes debería estar vacía'; END IF;
    RAISE NOTICE 'OK 2: anon y authenticated no leen, escriben ni ejecutan; service_role lee';
END $$;

-- De aquí en adelante todo corre como service_role, igual que el backend.
SET LOCAL ROLE service_role;

-- 3) CA-01: un rescatista validado asume una alerta abierta sin responsable.
DO $$
DECLARE
    r JSONB;
BEGIN
    r := hu39_prueba.asumir('e0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001');
    IF r->>'codigo' <> 'OK' THEN RAISE EXCEPTION 'Esperaba OK y llegó %', r; END IF;
    r := r->'resultado';
    IF r->>'estado' <> 'abierto' OR (r->>'version')::INT <> 1
       OR r->>'expedicionId' <> 'e0000000-0000-4000-8000-000000000001'
       OR r->'responsable'->>'id' <> 'a0000000-0000-4000-8000-000000000001'
       OR r->'responsable'->>'nombreCompleto' <> 'Rescatista Uno'
       OR (r->>'repetido')::BOOLEAN IS NOT FALSE
       OR r->>'asumidoEn' IS NULL OR r->>'id' IS NULL THEN
        RAISE EXCEPTION 'Resultado inesperado: %', r;
    END IF;
    RAISE NOTICE 'OK 3: asume la alerta y devuelve id, estado abierto, versión 1, responsable y asumidoEn';
END $$;

-- 4) Repetición del mismo comando y del mismo actor con otra operación.
DO $$
DECLARE
    a JSONB; b JSONB; c JSONB;
BEGIN
    a := hu39_prueba.asumir('e0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001');
    IF a->>'codigo' <> 'OK' OR (a->'resultado'->>'repetido')::BOOLEAN IS NOT TRUE THEN
        RAISE EXCEPTION 'La repetición del mismo operacion_id debió ser OK repetido: %', a;
    END IF;
    c := hu39_prueba.asumir('e0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002');
    IF c->>'codigo' <> 'OK' OR (c->'resultado'->>'repetido')::BOOLEAN IS NOT TRUE
       OR c->'resultado'->>'id' <> a->'resultado'->>'id' THEN
        RAISE EXCEPTION 'El mismo actor con otra operación debió recibir el mismo incidente: %', c;
    END IF;
    SELECT to_jsonb(count(*)) INTO b FROM public.incidentes
        WHERE expedicion_id = 'e0000000-0000-4000-8000-000000000001';
    IF b <> '1'::JSONB THEN RAISE EXCEPTION 'Debe haber un solo incidente, hay %', b; END IF;
    IF EXISTS (SELECT 1 FROM public.incidentes WHERE operacion_id = 'c0000000-0000-4000-8000-000000000002') THEN
        RAISE EXCEPTION 'La repetición no debe registrar otra operación';
    END IF;
    RAISE NOTICE 'OK 4: repetición idempotente, mismo incidente, sin duplicar';
END $$;

-- 5) CA-02: otro rescatista recibe el conflicto con el responsable vigente.
DO $$
DECLARE
    r JSONB; d JSONB;
BEGIN
    r := hu39_prueba.asumir('e0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000003');
    IF r->>'codigo' <> 'COORDINACION_YA_ASUMIDA' THEN RAISE EXCEPTION 'Esperaba conflicto y llegó %', r; END IF;
    d := (r->>'detalle')::JSONB;
    IF d->>'id' <> 'a0000000-0000-4000-8000-000000000001' OR d->>'nombreCompleto' <> 'Rescatista Uno' THEN
        RAISE EXCEPTION 'DETAIL sin el responsable vigente: %', r;
    END IF;
    IF EXISTS (SELECT 1 FROM public.incidentes WHERE operacion_id = 'c0000000-0000-4000-8000-000000000003') THEN
        RAISE EXCEPTION 'El conflicto no debe escribir nada';
    END IF;
    RAISE NOTICE 'OK 5: conflicto COORDINACION_YA_ASUMIDA con id y nombre del responsable vigente';
END $$;

-- 6) Actor que no es rescatista.
DO $$
DECLARE r JSONB;
BEGIN
    r := hu39_prueba.asumir('e0000000-0000-4000-8000-000000000002',
        'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000004');
    IF r->>'codigo' <> 'NO_ES_RESCATISTA' THEN RAISE EXCEPTION 'Esperaba NO_ES_RESCATISTA y llegó %', r; END IF;
    r := hu39_prueba.asumir('e0000000-0000-4000-8000-000000000002',
        'f0000000-0000-4000-8000-000000000000', 'c0000000-0000-4000-8000-000000000004');
    IF r->>'codigo' <> 'NO_ES_RESCATISTA' THEN RAISE EXCEPTION 'Un UUID desconocido tampoco es rescatista: %', r; END IF;
    RAISE NOTICE 'OK 6: un senderista o un UUID desconocido reciben NO_ES_RESCATISTA';
END $$;

-- 7) Expedición inexistente o fuera de alerta.
DO $$
DECLARE r JSONB; v_id UUID;
BEGIN
    r := hu39_prueba.asumir('f0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000005');
    IF r->>'codigo' <> 'ALERTA_NO_ENCONTRADA' THEN RAISE EXCEPTION 'Inexistente: %', r; END IF;

    FOREACH v_id IN ARRAY ARRAY[
        'e0000000-0000-4000-8000-000000000011'::uuid, 'e0000000-0000-4000-8000-000000000012'::uuid,
        'e0000000-0000-4000-8000-000000000013'::uuid, 'e0000000-0000-4000-8000-000000000014'::uuid
    ] LOOP
        r := hu39_prueba.asumir(v_id, 'a0000000-0000-4000-8000-000000000001', gen_random_uuid());
        IF r->>'codigo' <> 'ALERTA_NO_ENCONTRADA' THEN RAISE EXCEPTION 'Fuera de alerta %: %', v_id, r; END IF;
        IF EXISTS (SELECT 1 FROM public.incidentes WHERE expedicion_id = v_id) THEN
            RAISE EXCEPTION 'No debe crear incidente fuera de alerta: %', v_id;
        END IF;
    END LOOP;
    RAISE NOTICE 'OK 7: inexistente, en_progreso, programada, completada y cancelada dan ALERTA_NO_ENCONTRADA';
END $$;

-- 8) Operación ajena: otro rescatista u otra expedición no revelan nada.
DO $$
DECLARE r JSONB;
BEGIN
    -- c...0001 pertenece al rescatista 1 sobre la expedición ...001.
    r := hu39_prueba.asumir('e0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001');
    IF r->>'codigo' <> 'ALERTA_NO_ENCONTRADA' OR COALESCE(r->>'detalle', '') <> '' THEN
        RAISE EXCEPTION 'Operación de otro rescatista: %', r;
    END IF;
    r := hu39_prueba.asumir('e0000000-0000-4000-8000-000000000002',
        'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001');
    IF r->>'codigo' <> 'ALERTA_NO_ENCONTRADA' THEN RAISE EXCEPTION 'Operación de otra expedición: %', r; END IF;
    IF EXISTS (SELECT 1 FROM public.incidentes WHERE expedicion_id = 'e0000000-0000-4000-8000-000000000002') THEN
        RAISE EXCEPTION 'No debe crear incidente con una operación ajena';
    END IF;
    RAISE NOTICE 'OK 8: operacion_id de otro rescatista o de otra expedición responde ALERTA_NO_ENCONTRADA sin revelar nada';
END $$;

-- 9) Operación usada en otro tipo de operación (eventos del plan) y datos nulos.
RESET ROLE;
INSERT INTO public.eventos_plan
    (expedicion_id, senderista_id, tipo, actor_id, version_resultante, cambios, operacion_id)
VALUES ('e0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001',
        'EDITADA', 'b0000000-0000-4000-8000-000000000001', 2, '{}'::jsonb, 'd0000000-0000-4000-8000-000000000001');
SET LOCAL ROLE service_role;
DO $$
DECLARE r JSONB;
BEGIN
    r := hu39_prueba.asumir('e0000000-0000-4000-8000-000000000002',
        'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001');
    IF r->>'codigo' <> 'DATOS_INVALIDOS' THEN RAISE EXCEPTION 'Operación de eventos_plan: %', r; END IF;
    r := hu39_prueba.asumir(NULL, 'a0000000-0000-4000-8000-000000000001', gen_random_uuid());
    IF r->>'codigo' <> 'DATOS_INVALIDOS' THEN RAISE EXCEPTION 'Expedición nula: %', r; END IF;
    r := hu39_prueba.asumir('e0000000-0000-4000-8000-000000000002', NULL, gen_random_uuid());
    IF r->>'codigo' <> 'DATOS_INVALIDOS' THEN RAISE EXCEPTION 'Rescatista nulo: %', r; END IF;
    r := hu39_prueba.asumir('e0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', NULL);
    IF r->>'codigo' <> 'DATOS_INVALIDOS' THEN RAISE EXCEPTION 'Operación nula: %', r; END IF;
    RAISE NOTICE 'OK 9: operación usada en eventos_plan y parámetros nulos dan DATOS_INVALIDOS';
END $$;

-- 10) El índice único parcial y las restricciones de la tabla (superusuario).
RESET ROLE;
DO $$
DECLARE
    v_inc UUID;
    v_ok BOOLEAN;
BEGIN
    -- Un segundo incidente no cerrado para la misma expedición viola el índice.
    BEGIN
        INSERT INTO public.incidentes (expedicion_id, responsable_id, operacion_id)
        VALUES ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', gen_random_uuid());
        RAISE EXCEPTION 'El índice único no impidió un segundo incidente no cerrado';
    EXCEPTION WHEN unique_violation THEN
        v_ok := TRUE;
    END;
    -- También con estado localizado.
    BEGIN
        INSERT INTO public.incidentes (expedicion_id, responsable_id, operacion_id, estado)
        VALUES ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', gen_random_uuid(), 'localizado');
        RAISE EXCEPTION 'El índice único no cubre localizado';
    EXCEPTION WHEN unique_violation THEN
        v_ok := TRUE;
    END;
    -- operacion_id único.
    BEGIN
        INSERT INTO public.incidentes (expedicion_id, responsable_id, operacion_id)
        VALUES ('e0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000002',
                'c0000000-0000-4000-8000-000000000001');
        RAISE EXCEPTION 'operacion_id debe ser único';
    EXCEPTION WHEN unique_violation THEN
        v_ok := TRUE;
    END;
    -- Estado inválido, versión 0 y cierre incoherente.
    BEGIN
        INSERT INTO public.incidentes (expedicion_id, responsable_id, operacion_id, estado)
        VALUES ('e0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000002', gen_random_uuid(), 'otro');
        RAISE EXCEPTION 'Estado inválido aceptado';
    EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
    BEGIN
        INSERT INTO public.incidentes (expedicion_id, responsable_id, operacion_id, version)
        VALUES ('e0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000002', gen_random_uuid(), 0);
        RAISE EXCEPTION 'Versión 0 aceptada';
    EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
    BEGIN
        INSERT INTO public.incidentes (expedicion_id, responsable_id, operacion_id, estado)
        VALUES ('e0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000002', gen_random_uuid(), 'cerrado');
        RAISE EXCEPTION 'Cerrado sin cerrado_en aceptado';
    EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
    -- Responsable que no es rescatista.
    BEGIN
        INSERT INTO public.incidentes (expedicion_id, responsable_id, operacion_id)
        VALUES ('e0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', gen_random_uuid());
        RAISE EXCEPTION 'Un senderista no puede ser responsable';
    EXCEPTION WHEN foreign_key_violation THEN v_ok := TRUE; END;

    -- Tras cerrar el incidente, la expedición vuelve a aceptar uno nuevo.
    UPDATE public.incidentes SET estado = 'cerrado', cerrado_en = now()
        WHERE expedicion_id = 'e0000000-0000-4000-8000-000000000001' RETURNING id INTO v_inc;
    INSERT INTO public.incidentes (expedicion_id, responsable_id, operacion_id)
        VALUES ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', gen_random_uuid());
    IF (SELECT count(*) FROM public.incidentes WHERE expedicion_id = 'e0000000-0000-4000-8000-000000000001') <> 2 THEN
        RAISE EXCEPTION 'Un incidente cerrado debe permitir uno nuevo';
    END IF;
    RAISE NOTICE 'OK 10: índice único parcial, operacion_id único, CHECK de estado, versión y cierre, FK del responsable';
END $$;

-- 11) Borrados: la expedición arrastra sus incidentes; el rescatista con incidentes no se borra.
DO $$
BEGIN
    BEGIN
        DELETE FROM public.perfiles_rescatista WHERE usuario_id = 'a0000000-0000-4000-8000-000000000002';
        RAISE EXCEPTION 'RESTRICT no impidió borrar al responsable';
    -- Solo restrict_violation (23001): con NO ACTION saldría 23503 y la prueba fallaría.
    EXCEPTION WHEN restrict_violation THEN NULL;
    END;
    DELETE FROM public.expediciones WHERE id = 'e0000000-0000-4000-8000-000000000001';
    IF EXISTS (SELECT 1 FROM public.incidentes WHERE expedicion_id = 'e0000000-0000-4000-8000-000000000001') THEN
        RAISE EXCEPTION 'ON DELETE CASCADE no eliminó los incidentes';
    END IF;
    RAISE NOTICE 'OK 11: borrar la expedición elimina sus incidentes; borrar un responsable queda restringido';
END $$;

-- 12) Registro de la migración.
DO $$
BEGIN
    IF to_regclass('public.treksafe_migraciones') IS NULL THEN
        RAISE EXCEPTION 'Falta treksafe_migraciones (aplicar 000 antes)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.treksafe_migraciones
        WHERE version = '017' AND nombre = 'hu39_asumir_coordinacion' AND hu = 'HU-39') THEN
        RAISE EXCEPTION '017 no quedó registrada';
    END IF;
    RAISE NOTICE 'OK 12: la 017 quedó registrada en treksafe_migraciones';
END $$;

ROLLBACK;

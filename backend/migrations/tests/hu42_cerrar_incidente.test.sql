-- Solo PostgreSQL local desechable; todos los datos de prueba se revierten (ROLLBACK final).
-- Requiere: los roles anon, authenticated y service_role con los privilegios por defecto
-- de Supabase, el esquema base, las migraciones 000 a 019 (más 015 y 022 a 024) y la 025
-- aplicadas. Se ejecuta con backend/scripts/test-hu42-postgres.mjs, que prepara ese
-- entorno. Cada caso imprime un aviso "OK n: ..."; el primero que falla aborta el archivo
-- con su mensaje. La carrera real entre sesiones se prueba en el script .mjs, no aquí.
-- Un senderista distinto por expedición: DEP-04 (022) permite una sola expedición
-- bloqueante por senderista.
BEGIN;

CREATE SCHEMA hu42_prueba;
GRANT USAGE ON SCHEMA hu42_prueba TO service_role;

CREATE FUNCTION hu42_prueba.inc(n INTEGER) RETURNS UUID LANGUAGE sql IMMUTABLE AS $$
    SELECT ('f2000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
CREATE FUNCTION hu42_prueba.op(n INTEGER) RETURNS UUID LANGUAGE sql IMMUTABLE AS $$
    SELECT ('c2000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
CREATE FUNCTION hu42_prueba.resc(n INTEGER) RETURNS UUID LANGUAGE sql IMMUTABLE AS $$
    SELECT ('a2000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
CREATE FUNCTION hu42_prueba.exp(n INTEGER) RETURNS UUID LANGUAGE sql IMMUTABLE AS $$
    SELECT ('e2000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
GRANT EXECUTE ON FUNCTION hu42_prueba.inc(INTEGER), hu42_prueba.op(INTEGER),
    hu42_prueba.resc(INTEGER), hu42_prueba.exp(INTEGER) TO service_role;

-- Ayudantes: ejecutan las RPC y devuelven el código del error (o 'OK'), el DETAIL y el resultado.
CREATE FUNCTION hu42_prueba.cerrar(p_inc UUID, p_resc UUID, p_resultado TEXT, p_resumen TEXT, p_cmd UUID)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
    v_detalle TEXT;
    v_res     JSONB;
BEGIN
    BEGIN
        v_res := public.treksafe_cerrar_incidente(p_inc, p_resc, p_resultado, p_resumen, p_cmd);
        RETURN jsonb_build_object('codigo', 'OK', 'resultado', v_res);
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_detalle = PG_EXCEPTION_DETAIL;
        RETURN jsonb_build_object('codigo', SQLERRM, 'detalle', v_detalle);
    END;
END;
$$;
GRANT EXECUTE ON FUNCTION hu42_prueba.cerrar(UUID, UUID, TEXT, TEXT, UUID) TO service_role;

CREATE FUNCTION hu42_prueba.localizar(p_inc UUID, p_resc UUID, p_op UUID)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
    v_detalle TEXT;
    v_res     JSONB;
BEGIN
    BEGIN
        v_res := public.treksafe_marcar_incidente_localizado(p_inc, p_resc, p_op);
        RETURN jsonb_build_object('codigo', 'OK', 'resultado', v_res);
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_detalle = PG_EXCEPTION_DETAIL;
        RETURN jsonb_build_object('codigo', SQLERRM, 'detalle', v_detalle);
    END;
END;
$$;
GRANT EXECUTE ON FUNCTION hu42_prueba.localizar(UUID, UUID, UUID) TO service_role;

CREATE FUNCTION hu42_prueba.agregar(p_inc UUID, p_autor UUID, p_texto TEXT, p_op UUID)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
    v_res JSONB;
BEGIN
    BEGIN
        v_res := public.treksafe_agregar_entrada_bitacora(p_inc, p_autor, p_texto, NULL, p_op);
        RETURN jsonb_build_object('codigo', 'OK', 'resultado', v_res);
    EXCEPTION WHEN OTHERS THEN
        RETURN jsonb_build_object('codigo', SQLERRM);
    END;
END;
$$;
GRANT EXECUTE ON FUNCTION hu42_prueba.agregar(UUID, UUID, TEXT, UUID) TO service_role;

-- Datos de prueba (superusuario).
INSERT INTO public.usuarios (id, correo_electronico, hash_contrasena, rol) VALUES
    (hu42_prueba.resc(1), 'h42r1@example.invalid', 'fixture', 'rescatista'),
    (hu42_prueba.resc(2), 'h42r2@example.invalid', 'fixture', 'rescatista'),
    (hu42_prueba.resc(3), 'h42r3@example.invalid', 'fixture', 'rescatista');
INSERT INTO public.usuarios (id, correo_electronico, hash_contrasena, rol)
SELECT ('b2000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'h42s' || n || '@example.invalid', 'fixture', 'senderista'
FROM generate_series(1, 14) AS n;
INSERT INTO public.perfiles_senderista (usuario_id, nombre_completo, telefono, id_documento)
SELECT ('b2000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'Senderista Ficticio ' || n, '999999999', 'H42' || lpad(n::text, 5, '0')
FROM generate_series(1, 14) AS n;
INSERT INTO public.registros_institucionales_rescatista
    (institucion, numero_credencial, nombre_completo, fecha_nacimiento) VALUES
    ('AGMP', 'H42-CRED-1', 'Rescatista Uno', '1990-01-01'),
    ('AGMP', 'H42-CRED-2', 'Rescatista Dos', '1991-02-02'),
    ('AGMP', 'H42-CRED-3', 'Rescatista Tres', '1992-03-03');
INSERT INTO public.perfiles_rescatista (usuario_id, numero_credencial, nombre_completo, fecha_nacimiento) VALUES
    (hu42_prueba.resc(1), 'H42-CRED-1', 'Rescatista Uno', '1990-01-01'),
    (hu42_prueba.resc(2), 'H42-CRED-2', 'Rescatista Dos', '1991-02-02'),
    (hu42_prueba.resc(3), 'H42-CRED-3', 'Rescatista Tres', '1992-03-03');

-- Expediciones 1 a 14 en alerta, salvo la 10 (completada: el senderista ya confirmó su retorno).
INSERT INTO public.expediciones
    (id, senderista_id, lugar_inicio, lugar_fin, hora_inicio, hora_retorno_estimada, estado)
SELECT hu42_prueba.exp(n),
       ('b2000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'Inicio', 'Destino',
       now() - interval '5 hours', now() - interval '2 hours',
       CASE WHEN n = 10 THEN 'completada' ELSE 'alerta' END::public.estado_expedicion_enum
FROM generate_series(1, 14) AS n;

-- Incidentes 1 a 14 abiertos, uno por expedición, todos con R1 como responsable vigente.
INSERT INTO public.incidentes (id, expedicion_id, responsable_id, operacion_id)
SELECT hu42_prueba.inc(n), hu42_prueba.exp(n), hu42_prueba.resc(1),
       ('c3000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
FROM generate_series(1, 14) AS n;

-- 1) Estructura, funciones y columnas.
DO $$
DECLARE
    v_funcion REGPROCEDURE;
    v_rol TEXT;
    v_columnas TEXT;
    v_trigger TEXT;
    v_tipo CHAR;
    v_def TEXT;
BEGIN
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.informes_cierre_incidente'::REGCLASS) THEN
        RAISE EXCEPTION 'informes_cierre_incidente debe tener RLS activo';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
        AND tablename = 'informes_cierre_incidente' AND policyname = 'treksafe_deny_anon_authenticated') THEN
        RAISE EXCEPTION 'Falta la política treksafe_deny_anon_authenticated';
    END IF;
    FOREACH v_trigger IN ARRAY ARRAY['uq_informes_cierre_incidente', 'uq_informes_cierre_comando'] LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = v_trigger AND contype = 'u') THEN
            RAISE EXCEPTION 'Falta la restricción única %', v_trigger;
        END IF;
    END LOOP;
    SELECT pg_get_constraintdef(oid) INTO v_def FROM pg_constraint WHERE conname = 'chk_informes_cierre_resultado';
    IF v_def IS NULL OR v_def NOT LIKE '%localizado_sin_asistencia%' OR v_def NOT LIKE '%asistido_en_terreno%'
       OR v_def NOT LIKE '%evacuado%' OR v_def NOT LIKE '%falsa_alarma%' THEN
        RAISE EXCEPTION 'CHECK de resultado inesperado: %', v_def;
    END IF;
    SELECT pg_get_constraintdef(oid) INTO v_def FROM pg_constraint WHERE conname = 'chk_informes_cierre_resumen';
    IF v_def IS NULL OR v_def NOT LIKE '%2000%' THEN
        RAISE EXCEPTION 'CHECK de resumen inesperado: %', v_def;
    END IF;

    SELECT string_agg(column_name, ',' ORDER BY column_name) INTO v_columnas
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'informes_cierre_incidente';
    IF v_columnas <> 'cerrado_en,cerrado_por,comando_id,entrada_bitacora_id,id,incidente_id,resultado,resumen' THEN
        RAISE EXCEPTION 'Columnas inesperadas en informes_cierre_incidente: %', v_columnas;
    END IF;

    FOREACH v_trigger IN ARRAY ARRAY[
        'trg_informes_cierre_antes_de_insertar', 'trg_informes_cierre_solo_anexado',
        'trg_informes_cierre_sin_borrado', 'trg_informes_cierre_sin_truncate'
    ] LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = v_trigger AND NOT tgisinternal
            AND tgrelid = 'public.informes_cierre_incidente'::REGCLASS) THEN
            RAISE EXCEPTION 'Falta el trigger %', v_trigger;
        END IF;
    END LOOP;

    SELECT confdeltype INTO v_tipo FROM pg_constraint WHERE conname = 'fk_informes_cierre_incidente';
    IF v_tipo IS DISTINCT FROM 'c' THEN RAISE EXCEPTION 'El FK al incidente debe ser ON DELETE CASCADE (%)', v_tipo; END IF;
    SELECT confdeltype INTO v_tipo FROM pg_constraint WHERE conname = 'fk_informes_cierre_autor';
    IF v_tipo IS DISTINCT FROM 'r' THEN RAISE EXCEPTION 'El FK al autor debe ser ON DELETE RESTRICT (%)', v_tipo; END IF;
    -- Sin FK hacia la bitácora: impediría el TRUNCATE antes de su trigger (regresión de HU-41).
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE confrelid = 'public.entradas_bitacora_incidente'::REGCLASS
                                         AND conrelid <> confrelid) THEN
        RAISE EXCEPTION 'Ninguna otra tabla debe tener un FK hacia entradas_bitacora_incidente';
    END IF;

    FOREACH v_funcion IN ARRAY ARRAY[
        'public.treksafe_cerrar_incidente(uuid,uuid,text,text,uuid)'::REGPROCEDURE,
        'public.treksafe_marcar_incidente_localizado(uuid,uuid,uuid)'::REGPROCEDURE,
        'public.treksafe_leer_ultimo_cierre_incidente(uuid)'::REGPROCEDURE,
        'public.treksafe_cierre_incidente_repetido(uuid,uuid,uuid,text,text)'::REGPROCEDURE,
        'public.treksafe_resultado_cierre_incidente(public.informes_cierre_incidente,boolean)'::REGPROCEDURE,
        'public.treksafe_informes_cierre_antes_de_insertar()'::REGPROCEDURE,
        'public.treksafe_informes_cierre_solo_anexado()'::REGPROCEDURE
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
        IF EXISTS (
            SELECT 1 FROM pg_proc p,
                 aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
            WHERE p.oid = v_funcion AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
        ) THEN
            RAISE EXCEPTION 'PUBLIC no debe ejecutar %', v_funcion;
        END IF;
    END LOOP;

    FOREACH v_funcion IN ARRAY ARRAY[
        'public.treksafe_cerrar_incidente(uuid,uuid,text,text,uuid)'::REGPROCEDURE,
        'public.treksafe_marcar_incidente_localizado(uuid,uuid,uuid)'::REGPROCEDURE,
        'public.treksafe_leer_ultimo_cierre_incidente(uuid)'::REGPROCEDURE,
        'public.treksafe_cierre_incidente_repetido(uuid,uuid,uuid,text,text)'::REGPROCEDURE,
        'public.treksafe_resultado_cierre_incidente(public.informes_cierre_incidente,boolean)'::REGPROCEDURE
    ] LOOP
        IF NOT has_function_privilege('service_role', v_funcion, 'EXECUTE') THEN
            RAISE EXCEPTION 'service_role debe poder ejecutar %', v_funcion;
        END IF;
    END LOOP;
    RAISE NOTICE 'OK 1: RLS, política, uniques, CHECK de resultado y resumen, FK (cascada y restrict, ninguno hacia la bitácora), 4 triggers, columnas sin datos médicos, funciones SECURITY INVOKER con search_path vacío y sin EXECUTE para PUBLIC, anon ni authenticated';
END $$;

-- 2) Privilegios por rol.
DO $$
DECLARE
    v_rol TEXT;
    v_n INTEGER;
BEGIN
    FOREACH v_rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        EXECUTE format('SET LOCAL ROLE %I', v_rol);
        BEGIN
            PERFORM count(*) FROM public.informes_cierre_incidente;
            RESET ROLE;
            RAISE EXCEPTION '% pudo leer los informes', v_rol;
        EXCEPTION WHEN insufficient_privilege THEN
            RESET ROLE;
        END;
        EXECUTE format('SET LOCAL ROLE %I', v_rol);
        BEGIN
            INSERT INTO public.informes_cierre_incidente
                (incidente_id, comando_id, resultado, resumen, cerrado_por, entrada_bitacora_id)
            VALUES (hu42_prueba.inc(1), gen_random_uuid(), 'evacuado', 'x', hu42_prueba.resc(1), gen_random_uuid());
            RESET ROLE;
            RAISE EXCEPTION '% pudo escribir informes', v_rol;
        EXCEPTION WHEN insufficient_privilege THEN
            RESET ROLE;
        END;
        EXECUTE format('SET LOCAL ROLE %I', v_rol);
        BEGIN
            PERFORM public.treksafe_cerrar_incidente(
                hu42_prueba.inc(1), hu42_prueba.resc(1), 'evacuado', 'x', gen_random_uuid());
            RESET ROLE;
            RAISE EXCEPTION '% pudo ejecutar el cierre', v_rol;
        EXCEPTION WHEN insufficient_privilege THEN
            RESET ROLE;
        END;
        EXECUTE format('SET LOCAL ROLE %I', v_rol);
        BEGIN
            PERFORM public.treksafe_marcar_incidente_localizado(
                hu42_prueba.inc(1), hu42_prueba.resc(1), gen_random_uuid());
            RESET ROLE;
            RAISE EXCEPTION '% pudo ejecutar marcar localizado', v_rol;
        EXCEPTION WHEN insufficient_privilege THEN
            RESET ROLE;
        END;
        EXECUTE format('SET LOCAL ROLE %I', v_rol);
        BEGIN
            PERFORM public.treksafe_leer_ultimo_cierre_incidente(hu42_prueba.exp(1));
            RESET ROLE;
            RAISE EXCEPTION '% pudo leer el último cierre', v_rol;
        EXCEPTION WHEN insufficient_privilege THEN
            RESET ROLE;
        END;
    END LOOP;

    IF NOT has_table_privilege('service_role', 'public.informes_cierre_incidente', 'SELECT')
       OR NOT has_table_privilege('service_role', 'public.informes_cierre_incidente', 'INSERT') THEN
        RAISE EXCEPTION 'service_role debe tener SELECT e INSERT sobre los informes';
    END IF;
    IF has_table_privilege('service_role', 'public.informes_cierre_incidente', 'UPDATE')
       OR has_table_privilege('service_role', 'public.informes_cierre_incidente', 'DELETE')
       OR has_table_privilege('service_role', 'public.informes_cierre_incidente', 'TRUNCATE') THEN
        RAISE EXCEPTION 'service_role no debe tener UPDATE, DELETE ni TRUNCATE sobre los informes';
    END IF;
    IF NOT has_column_privilege('service_role', 'public.incidentes', 'estado', 'UPDATE')
       OR NOT has_column_privilege('service_role', 'public.incidentes', 'cerrado_en', 'UPDATE')
       OR NOT has_column_privilege('service_role', 'public.incidentes', 'version', 'UPDATE') THEN
        RAISE EXCEPTION 'service_role necesita UPDATE (estado, cerrado_en, version) sobre incidentes';
    END IF;

    SET LOCAL ROLE service_role;
    SELECT count(*) INTO v_n FROM public.informes_cierre_incidente;
    RESET ROLE;
    IF v_n <> 0 THEN RAISE EXCEPTION 'No debería haber informes todavía'; END IF;
    RAISE NOTICE 'OK 2: anon y authenticated no leen, escriben ni ejecutan; service_role solo SELECT e INSERT en informes y UPDATE (estado, cerrado_en, version) en incidentes';
END $$;

-- De aquí en adelante todo corre como service_role, igual que el backend.
SET LOCAL ROLE service_role;

-- 3) CA-1: marcar la persona localizada (abierto -> localizado).
DO $$
DECLARE
    r JSONB;
    v_texto TEXT;
    v_n INTEGER;
BEGIN
    r := hu42_prueba.localizar(hu42_prueba.inc(1), hu42_prueba.resc(1), hu42_prueba.op(1));
    IF r->>'codigo' <> 'OK' THEN RAISE EXCEPTION 'Esperaba OK y llegó %', r; END IF;
    IF r->'resultado'->>'estado' <> 'localizado' OR (r->'resultado'->>'version')::INTEGER <> 2
       OR (r->'resultado'->>'repetido')::BOOLEAN IS NOT FALSE THEN
        RAISE EXCEPTION 'Resultado inesperado: %', r;
    END IF;
    SELECT texto INTO v_texto FROM public.entradas_bitacora_incidente
     WHERE incidente_id = hu42_prueba.inc(1) AND operacion_id = hu42_prueba.op(1) AND tipo = 'nota';
    IF v_texto IS DISTINCT FROM 'Persona localizada. El incidente pasa a estado localizado.' THEN
        RAISE EXCEPTION 'La nota de localizado no quedó en la bitácora: %', v_texto;
    END IF;

    -- Mismo operacionId: repetido sin escribir.
    r := hu42_prueba.localizar(hu42_prueba.inc(1), hu42_prueba.resc(1), hu42_prueba.op(1));
    IF r->>'codigo' <> 'OK' OR (r->'resultado'->>'repetido')::BOOLEAN IS NOT TRUE
       OR (r->'resultado'->>'version')::INTEGER <> 2 THEN
        RAISE EXCEPTION 'Reintento: %', r;
    END IF;
    -- Otra operación sobre un incidente ya localizado: repetido, sin escribir.
    r := hu42_prueba.localizar(hu42_prueba.inc(1), hu42_prueba.resc(1), hu42_prueba.op(2));
    IF r->>'codigo' <> 'OK' OR (r->'resultado'->>'repetido')::BOOLEAN IS NOT TRUE THEN
        RAISE EXCEPTION 'Ya localizado: %', r;
    END IF;
    SELECT count(*) INTO v_n FROM public.entradas_bitacora_incidente WHERE incidente_id = hu42_prueba.inc(1);
    IF v_n <> 1 THEN RAISE EXCEPTION 'Debe haber una sola nota, hay %', v_n; END IF;

    -- No responsable: 403 con el vigente en DETAIL y sin escribir.
    r := hu42_prueba.localizar(hu42_prueba.inc(2), hu42_prueba.resc(2), hu42_prueba.op(3));
    IF r->>'codigo' <> 'NO_ES_RESPONSABLE' OR (r->>'detalle')::JSONB->>'id' <> hu42_prueba.resc(1)::text THEN
        RAISE EXCEPTION 'No responsable: %', r;
    END IF;
    r := hu42_prueba.localizar(hu42_prueba.inc(99), hu42_prueba.resc(1), hu42_prueba.op(4));
    IF r->>'codigo' <> 'INCIDENTE_NO_ENCONTRADO' THEN RAISE EXCEPTION 'Inexistente: %', r; END IF;
    -- Un UUID usado por otra operación (incidentes.operacion_id): OPERACION_YA_REGISTRADA.
    r := hu42_prueba.localizar(hu42_prueba.inc(2), hu42_prueba.resc(1), 'c3000000-0000-4000-8000-000000000005');
    IF r->>'codigo' <> 'OPERACION_YA_REGISTRADA' THEN RAISE EXCEPTION 'Operación ajena: %', r; END IF;
    IF (SELECT estado FROM public.incidentes WHERE id = hu42_prueba.inc(2)) <> 'abierto' THEN
        RAISE EXCEPTION 'Un rechazo no debe cambiar el estado';
    END IF;
    r := hu42_prueba.localizar(NULL, hu42_prueba.resc(1), hu42_prueba.op(5));
    IF r->>'codigo' <> 'DATOS_INVALIDOS' THEN RAISE EXCEPTION 'Datos nulos: %', r; END IF;
    RAISE NOTICE 'OK 3: marcar localizado (solo el responsable, una nota fija, version+1, repetición sin escribir, ya localizado, no responsable con el vigente, inexistente, UUID ajeno y datos nulos)';
END $$;

-- 4) CA-1, CA-2 y CA-3: cierre feliz de un incidente localizado.
DO $$
DECLARE
    r JSONB;
    v_inc public.incidentes%ROWTYPE;
    v_inf public.informes_cierre_incidente%ROWTYPE;
    v_ent public.entradas_bitacora_incidente%ROWTYPE;
BEGIN
    r := hu42_prueba.cerrar(hu42_prueba.inc(1), hu42_prueba.resc(1), 'evacuado', '  Evacuada en camilla al refugio  ', hu42_prueba.op(10));
    IF r->>'codigo' <> 'OK' THEN RAISE EXCEPTION 'Esperaba OK y llegó %', r; END IF;
    r := r->'resultado';
    IF r->>'id' IS NULL
       OR r->>'incidenteId' <> hu42_prueba.inc(1)::text
       OR r->>'expedicionId' <> hu42_prueba.exp(1)::text
       OR r->>'resultado' <> 'evacuado'
       OR r->>'resumen' <> 'Evacuada en camilla al refugio'
       OR r->'cerradoPor'->>'id' <> hu42_prueba.resc(1)::text
       OR r->'cerradoPor'->>'nombreCompleto' <> 'Rescatista Uno'
       OR r->>'cerradoEn' IS NULL
       OR r->>'estadoExpedicion' <> 'alerta'
       OR (r->>'repetido')::BOOLEAN IS NOT FALSE THEN
        RAISE EXCEPTION 'Resultado inesperado: %', r;
    END IF;

    SELECT * INTO v_inc FROM public.incidentes WHERE id = hu42_prueba.inc(1);
    SELECT * INTO v_inf FROM public.informes_cierre_incidente WHERE incidente_id = hu42_prueba.inc(1);
    SELECT * INTO v_ent FROM public.entradas_bitacora_incidente WHERE incidente_id = hu42_prueba.inc(1) AND tipo = 'cierre';
    IF v_inc.estado <> 'cerrado' OR v_inc.cerrado_en IS DISTINCT FROM v_inf.cerrado_en OR v_inc.version <> 3 THEN
        RAISE EXCEPTION 'Incidente tras el cierre: estado %, cerrado_en %, informe %, version %',
            v_inc.estado, v_inc.cerrado_en, v_inf.cerrado_en, v_inc.version;
    END IF;
    IF v_ent.texto <> 'Evacuada en camilla al refugio' OR v_ent.operacion_id <> hu42_prueba.op(10)
       OR v_ent.autor_id <> hu42_prueba.resc(1) OR v_inf.entrada_bitacora_id <> v_ent.id
       OR v_inf.comando_id <> hu42_prueba.op(10) THEN
        RAISE EXCEPTION 'La entrada de cierre no coincide con el informe';
    END IF;
    RAISE NOTICE 'OK 4: el cierre devuelve el informe; cerrado_en del informe = el del incidente, version+1, entrada cierre con el resumen y operacion_id = comando';
END $$;

-- 5) Validaciones de datos: no escriben nada (y el límite de 2000 caracteres se acepta).
DO $$
DECLARE
    r JSONB;
    v_antes INTEGER;
    v_entradas_antes INTEGER;
BEGIN
    r := hu42_prueba.localizar(hu42_prueba.inc(3), hu42_prueba.resc(1), hu42_prueba.op(20));
    IF r->>'codigo' <> 'OK' THEN RAISE EXCEPTION 'Preparación: %', r; END IF;
    SELECT count(*) INTO v_antes FROM public.informes_cierre_incidente;
    SELECT count(*) INTO v_entradas_antes FROM public.entradas_bitacora_incidente;

    r := hu42_prueba.cerrar(hu42_prueba.inc(3), hu42_prueba.resc(1), 'fallecido', 'Resumen', hu42_prueba.op(21));
    IF r->>'codigo' <> 'DATOS_INVALIDOS' THEN RAISE EXCEPTION 'Resultado fuera del catálogo: %', r; END IF;
    r := hu42_prueba.cerrar(hu42_prueba.inc(3), hu42_prueba.resc(1), 'evacuado', '', hu42_prueba.op(22));
    IF r->>'codigo' <> 'DATOS_INVALIDOS' THEN RAISE EXCEPTION 'Resumen vacío: %', r; END IF;
    r := hu42_prueba.cerrar(hu42_prueba.inc(3), hu42_prueba.resc(1), 'evacuado', E'  \t\r\n  ', hu42_prueba.op(23));
    IF r->>'codigo' <> 'DATOS_INVALIDOS' THEN RAISE EXCEPTION 'Resumen en blanco: %', r; END IF;
    r := hu42_prueba.cerrar(hu42_prueba.inc(3), hu42_prueba.resc(1), 'evacuado', repeat('x', 2001), hu42_prueba.op(24));
    IF r->>'codigo' <> 'DATOS_INVALIDOS' THEN RAISE EXCEPTION 'Resumen de 2001: %', r; END IF;
    r := hu42_prueba.cerrar(hu42_prueba.inc(3), hu42_prueba.resc(1), NULL, 'Resumen', hu42_prueba.op(25));
    IF r->>'codigo' <> 'DATOS_INVALIDOS' THEN RAISE EXCEPTION 'Resultado nulo: %', r; END IF;
    r := hu42_prueba.cerrar(hu42_prueba.inc(3), hu42_prueba.resc(1), 'evacuado', NULL, hu42_prueba.op(26));
    IF r->>'codigo' <> 'DATOS_INVALIDOS' THEN RAISE EXCEPTION 'Resumen nulo: %', r; END IF;
    r := hu42_prueba.cerrar(hu42_prueba.inc(3), hu42_prueba.resc(1), 'evacuado', 'Resumen', NULL);
    IF r->>'codigo' <> 'DATOS_INVALIDOS' THEN RAISE EXCEPTION 'Comando nulo: %', r; END IF;

    IF (SELECT count(*) FROM public.informes_cierre_incidente) <> v_antes
       OR (SELECT count(*) FROM public.entradas_bitacora_incidente) <> v_entradas_antes
       OR (SELECT estado FROM public.incidentes WHERE id = hu42_prueba.inc(3)) <> 'localizado' THEN
        RAISE EXCEPTION 'Una validación de datos escribió algo';
    END IF;

    r := hu42_prueba.cerrar(hu42_prueba.inc(3), hu42_prueba.resc(1), 'falsa_alarma', repeat('y', 2000), hu42_prueba.op(27));
    IF r->>'codigo' <> 'OK' OR char_length(r->'resultado'->>'resumen') <> 2000 THEN
        RAISE EXCEPTION 'El resumen de exactamente 2000 caracteres debe aceptarse: %', left(r::text, 200);
    END IF;
    RAISE NOTICE 'OK 5: resultado fuera del catálogo, resumen vacío, en blanco o de 2001 y datos nulos dan DATOS_INVALIDOS sin escribir; 2000 caracteres se acepta';
END $$;

-- 6) CA-1: no responsable, incidente abierto, inexistente y relevo (sin escribir).
DO $$
DECLARE
    r JSONB;
    v_antes INTEGER;
BEGIN
    SELECT count(*) INTO v_antes FROM public.informes_cierre_incidente;

    -- Abierto: INCIDENTE_NO_LOCALIZADO.
    r := hu42_prueba.cerrar(hu42_prueba.inc(4), hu42_prueba.resc(1), 'evacuado', 'Aún no localizado', hu42_prueba.op(30));
    IF r->>'codigo' <> 'INCIDENTE_NO_LOCALIZADO' THEN RAISE EXCEPTION 'Abierto: %', r; END IF;
    -- Otro rescatista (no responsable) sobre un incidente abierto: la autorización va primero.
    r := hu42_prueba.cerrar(hu42_prueba.inc(4), hu42_prueba.resc(2), 'evacuado', 'No me toca', hu42_prueba.op(31));
    IF r->>'codigo' <> 'NO_ES_RESPONSABLE' OR (r->>'detalle')::JSONB->>'id' <> hu42_prueba.resc(1)::text
       OR (r->>'detalle')::JSONB->>'nombreCompleto' <> 'Rescatista Uno' THEN
        RAISE EXCEPTION 'No responsable: %', r;
    END IF;
    r := hu42_prueba.cerrar(hu42_prueba.inc(99), hu42_prueba.resc(1), 'evacuado', 'Nada', hu42_prueba.op(32));
    IF r->>'codigo' <> 'INCIDENTE_NO_ENCONTRADO' THEN RAISE EXCEPTION 'Inexistente: %', r; END IF;

    -- Relevo (HU-40, simulado como superusuario): A recibe 403 y B cierra.
    r := hu42_prueba.localizar(hu42_prueba.inc(4), hu42_prueba.resc(1), hu42_prueba.op(33));
    IF r->>'codigo' <> 'OK' THEN RAISE EXCEPTION 'Preparación: %', r; END IF;
    RESET ROLE;
    UPDATE public.incidentes SET responsable_id = hu42_prueba.resc(2), version = version + 1 WHERE id = hu42_prueba.inc(4);
    SET LOCAL ROLE service_role;
    r := hu42_prueba.cerrar(hu42_prueba.inc(4), hu42_prueba.resc(1), 'evacuado', 'Ya no soy responsable', hu42_prueba.op(34));
    IF r->>'codigo' <> 'NO_ES_RESPONSABLE' OR (r->>'detalle')::JSONB->>'id' <> hu42_prueba.resc(2)::text THEN
        RAISE EXCEPTION 'Tras el relevo, A: %', r;
    END IF;
    IF (SELECT count(*) FROM public.informes_cierre_incidente) <> v_antes THEN
        RAISE EXCEPTION 'Un rechazo escribió un informe';
    END IF;
    r := hu42_prueba.cerrar(hu42_prueba.inc(4), hu42_prueba.resc(2), 'asistido_en_terreno', 'Cierra el nuevo responsable', hu42_prueba.op(35));
    IF r->>'codigo' <> 'OK' OR r->'resultado'->'cerradoPor'->>'id' <> hu42_prueba.resc(2)::text THEN
        RAISE EXCEPTION 'Tras el relevo, B: %', r;
    END IF;
    RAISE NOTICE 'OK 6: abierto da INCIDENTE_NO_LOCALIZADO; no responsable, 403 con el vigente; inexistente; tras un relevo A recibe NO_ES_RESPONSABLE y B cierra; los rechazos no escriben';
END $$;

-- 7) CA-2: idempotencia.
DO $$
DECLARE
    r JSONB;
    r2 JSONB;
    v_n INTEGER;
BEGIN
    r := hu42_prueba.localizar(hu42_prueba.inc(5), hu42_prueba.resc(1), hu42_prueba.op(40));
    IF r->>'codigo' <> 'OK' THEN RAISE EXCEPTION 'Preparación: %', r; END IF;
    r := hu42_prueba.cerrar(hu42_prueba.inc(5), hu42_prueba.resc(1), 'localizado_sin_asistencia', 'Sin novedad', hu42_prueba.op(41));
    IF r->>'codigo' <> 'OK' OR (r->'resultado'->>'repetido')::BOOLEAN IS NOT FALSE THEN RAISE EXCEPTION 'Primer cierre: %', r; END IF;

    -- Mismo comando y mismos datos: el mismo informe, repetido = true.
    r2 := hu42_prueba.cerrar(hu42_prueba.inc(5), hu42_prueba.resc(1), 'localizado_sin_asistencia', 'Sin novedad', hu42_prueba.op(41));
    IF r2->>'codigo' <> 'OK' OR (r2->'resultado'->>'repetido')::BOOLEAN IS NOT TRUE
       OR r2->'resultado'->>'id' <> r->'resultado'->>'id' THEN
        RAISE EXCEPTION 'Repetición: %', r2;
    END IF;
    -- Mismo comando con otro resumen o resultado: OPERACION_YA_REGISTRADA.
    r2 := hu42_prueba.cerrar(hu42_prueba.inc(5), hu42_prueba.resc(1), 'localizado_sin_asistencia', 'Otro resumen', hu42_prueba.op(41));
    IF r2->>'codigo' <> 'OPERACION_YA_REGISTRADA' THEN RAISE EXCEPTION 'Mismo comando, otro resumen: %', r2; END IF;
    r2 := hu42_prueba.cerrar(hu42_prueba.inc(5), hu42_prueba.resc(1), 'evacuado', 'Sin novedad', hu42_prueba.op(41));
    IF r2->>'codigo' <> 'OPERACION_YA_REGISTRADA' THEN RAISE EXCEPTION 'Mismo comando, otro resultado: %', r2; END IF;
    -- Otro comando sobre el incidente cerrado: INCIDENTE_CERRADO.
    r2 := hu42_prueba.cerrar(hu42_prueba.inc(5), hu42_prueba.resc(1), 'localizado_sin_asistencia', 'Sin novedad', hu42_prueba.op(42));
    IF r2->>'codigo' <> 'INCIDENTE_CERRADO' THEN RAISE EXCEPTION 'Otro comando: %', r2; END IF;

    -- El reintento sobrevive a un relevo posterior: devuelve el informe original.
    RESET ROLE;
    UPDATE public.incidentes SET responsable_id = hu42_prueba.resc(2), version = version + 1 WHERE id = hu42_prueba.inc(5);
    SET LOCAL ROLE service_role;
    r2 := hu42_prueba.cerrar(hu42_prueba.inc(5), hu42_prueba.resc(1), 'localizado_sin_asistencia', 'Sin novedad', hu42_prueba.op(41));
    IF r2->>'codigo' <> 'OK' OR r2->'resultado'->>'id' <> r->'resultado'->>'id' THEN
        RAISE EXCEPTION 'Reintento tras relevo: %', r2;
    END IF;

    -- El comando ya se usó como operacionId de una nota: OPERACION_YA_REGISTRADA, sin cerrar.
    r := hu42_prueba.localizar(hu42_prueba.inc(6), hu42_prueba.resc(1), hu42_prueba.op(43));
    r := hu42_prueba.agregar(hu42_prueba.inc(6), hu42_prueba.resc(1), 'Una nota', hu42_prueba.op(44));
    IF r->>'codigo' <> 'OK' THEN RAISE EXCEPTION 'Nota: %', r; END IF;
    r := hu42_prueba.cerrar(hu42_prueba.inc(6), hu42_prueba.resc(1), 'evacuado', 'Una nota', hu42_prueba.op(44));
    IF r->>'codigo' <> 'OPERACION_YA_REGISTRADA' THEN RAISE EXCEPTION 'Comando de una nota: %', r; END IF;
    -- El comando ya se usó como operacion_id de un incidente (HU-39): OPERACION_YA_REGISTRADA.
    r := hu42_prueba.cerrar(hu42_prueba.inc(6), hu42_prueba.resc(1), 'evacuado', 'Otro', 'c3000000-0000-4000-8000-000000000007');
    IF r->>'codigo' <> 'OPERACION_YA_REGISTRADA' THEN RAISE EXCEPTION 'Comando de un incidente: %', r; END IF;
    -- El comando ya se usó como operación de "localizado": OPERACION_YA_REGISTRADA.
    r := hu42_prueba.cerrar(hu42_prueba.inc(6), hu42_prueba.resc(1), 'evacuado', 'Otro', hu42_prueba.op(43));
    IF r->>'codigo' <> 'OPERACION_YA_REGISTRADA' THEN RAISE EXCEPTION 'Comando de localizado: %', r; END IF;
    -- Y a la inversa: marcar localizado con el comando de un cierre.
    r := hu42_prueba.localizar(hu42_prueba.inc(6), hu42_prueba.resc(1), hu42_prueba.op(41));
    IF r->>'codigo' <> 'OPERACION_YA_REGISTRADA' THEN RAISE EXCEPTION 'Localizado con un comando de cierre: %', r; END IF;

    SELECT count(*) INTO v_n FROM public.informes_cierre_incidente WHERE incidente_id IN (hu42_prueba.inc(5), hu42_prueba.inc(6));
    IF v_n <> 1 THEN RAISE EXCEPTION 'Debe haber un solo informe entre los dos incidentes, hay %', v_n; END IF;
    IF (SELECT estado FROM public.incidentes WHERE id = hu42_prueba.inc(6)) <> 'localizado' THEN
        RAISE EXCEPTION 'El incidente 6 no debió cerrarse';
    END IF;
    RAISE NOTICE 'OK 7: mismo comando = mismo informe (repetido); otros datos = OPERACION_YA_REGISTRADA; otro comando sobre cerrado = INCIDENTE_CERRADO; sobrevive al relevo; comandos usados en una nota, un incidente o localizado se rechazan';
END $$;

-- 8) CA-2: la bitácora se conserva y el incidente cerrado es de solo lectura.
DO $$
DECLARE
    r JSONB;
    v_antes JSONB;
    v_despues JSONB;
    v_n INTEGER;
    v_ultimo TEXT;
BEGIN
    r := hu42_prueba.localizar(hu42_prueba.inc(7), hu42_prueba.resc(1), hu42_prueba.op(50));
    r := hu42_prueba.agregar(hu42_prueba.inc(7), hu42_prueba.resc(1), 'Primera observación', hu42_prueba.op(51));
    r := hu42_prueba.agregar(hu42_prueba.inc(7), hu42_prueba.resc(1), 'Segunda observación', hu42_prueba.op(52));
    SELECT jsonb_agg(jsonb_build_object('id', id, 'texto', texto, 'tipo', tipo, 'registrada_en', registrada_en, 'secuencia', secuencia)
                     ORDER BY registrada_en, secuencia)
      INTO v_antes FROM public.entradas_bitacora_incidente WHERE incidente_id = hu42_prueba.inc(7);
    IF jsonb_array_length(v_antes) <> 3 THEN RAISE EXCEPTION 'Preparación: %', v_antes; END IF;

    r := hu42_prueba.cerrar(hu42_prueba.inc(7), hu42_prueba.resc(1), 'asistido_en_terreno', 'Cierre con bitácora', hu42_prueba.op(53));
    IF r->>'codigo' <> 'OK' THEN RAISE EXCEPTION 'Cierre: %', r; END IF;

    SELECT jsonb_agg(jsonb_build_object('id', id, 'texto', texto, 'tipo', tipo, 'registrada_en', registrada_en, 'secuencia', secuencia)
                     ORDER BY registrada_en, secuencia)
      INTO v_despues FROM public.entradas_bitacora_incidente WHERE incidente_id = hu42_prueba.inc(7);
    IF jsonb_array_length(v_despues) <> 4 THEN RAISE EXCEPTION 'Debe haber 3 + 1 entradas: %', v_despues; END IF;
    IF (v_despues - 3) IS DISTINCT FROM v_antes THEN
        RAISE EXCEPTION 'Las entradas previas cambiaron';
    END IF;
    IF v_despues->3->>'tipo' <> 'cierre' OR v_despues->3->>'texto' <> 'Cierre con bitácora' THEN
        RAISE EXCEPTION 'La entrada de cierre debe ir al final: %', v_despues->3;
    END IF;
    SELECT count(*) INTO v_n FROM public.entradas_bitacora_incidente WHERE incidente_id = hu42_prueba.inc(7) AND tipo = 'cierre';
    IF v_n <> 1 THEN RAISE EXCEPTION 'Debe haber un solo cierre'; END IF;

    r := hu42_prueba.agregar(hu42_prueba.inc(7), hu42_prueba.resc(1), 'Tarde', hu42_prueba.op(54));
    IF r->>'codigo' <> 'INCIDENTE_CERRADO' THEN RAISE EXCEPTION 'La RPC de HU-41 tras el cierre: %', r; END IF;
    r := hu42_prueba.localizar(hu42_prueba.inc(7), hu42_prueba.resc(1), hu42_prueba.op(55));
    IF r->>'codigo' <> 'INCIDENTE_CERRADO' THEN RAISE EXCEPTION 'Localizar tras el cierre: %', r; END IF;
    RAISE NOTICE 'OK 8: tras el cierre la bitácora conserva ids, textos y horas, el cierre va al final y es único; la RPC de HU-41 y localizar dan INCIDENTE_CERRADO';
END $$;

-- 9) CA-2: el cierre afecta a todo el incidente.
DO $$
DECLARE
    v_inc public.incidentes%ROWTYPE;
    v_json JSONB;
BEGIN
    SELECT * INTO v_inc FROM public.incidentes WHERE id = hu42_prueba.inc(7);
    IF v_inc.estado <> 'cerrado' OR v_inc.cerrado_en IS NULL THEN
        RAISE EXCEPTION 'El incidente debe estar cerrado con cerrado_en';
    END IF;
    IF EXISTS (SELECT 1 FROM public.incidentes WHERE expedicion_id = v_inc.expedicion_id AND estado <> 'cerrado') THEN
        RAISE EXCEPTION 'No debe quedar un incidente no cerrado en la expedición';
    END IF;
    -- La lectura por expedición devuelve el informe; sin cierres devuelve NULL.
    v_json := public.treksafe_leer_ultimo_cierre_incidente(v_inc.expedicion_id);
    IF v_json->>'incidenteId' <> hu42_prueba.inc(7)::text OR v_json->>'resultado' <> 'asistido_en_terreno' THEN
        RAISE EXCEPTION 'Último cierre inesperado: %', v_json;
    END IF;
    IF public.treksafe_leer_ultimo_cierre_incidente(hu42_prueba.exp(8)) IS NOT NULL THEN
        RAISE EXCEPTION 'Una expedición sin cierres debe dar NULL';
    END IF;
    BEGIN
        PERFORM public.treksafe_leer_ultimo_cierre_incidente(NULL);
        RAISE EXCEPTION 'Se aceptó una expedición nula';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM <> 'DATOS_INVALIDOS' THEN RAISE; END IF;
    END;
    -- chk_incidentes_cierre: no hay cerrado sin cerrado_en (superusuario).
    RESET ROLE;
    BEGIN
        UPDATE public.incidentes SET estado = 'cerrado' WHERE id = hu42_prueba.inc(8);
        RAISE EXCEPTION 'chk_incidentes_cierre no impidió cerrar sin cerrado_en';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    RAISE NOTICE 'OK 9: el incidente queda cerrado con cerrado_en, sin otro incidente abierto en la expedición; el último cierre se lee por expedición (NULL si no hay)';
END $$;
SET LOCAL ROLE service_role;

-- 10) CA-3: el cierre operativo no toca expediciones ni genera eventos, avisos ni outbox.
DO $$
DECLARE
    r JSONB;
    v_n INTEGER;
    v_antes JSONB;
    v_despues JSONB;
    v_eventos INTEGER;
    v_avisos INTEGER;
    v_outbox INTEGER;
BEGIN
    FOREACH v_n IN ARRAY ARRAY[9, 10] LOOP
        SELECT to_jsonb(e) INTO v_antes FROM public.expediciones e WHERE id = hu42_prueba.exp(v_n);
        SELECT count(*) INTO v_eventos FROM public.eventos_plan;
        SELECT count(*) INTO v_avisos FROM public.avisos_usuario;
        SELECT count(*) INTO v_outbox FROM public.outbox_notificaciones;

        r := hu42_prueba.localizar(hu42_prueba.inc(v_n), hu42_prueba.resc(1), hu42_prueba.op(60 + v_n));
        IF r->>'codigo' <> 'OK' THEN RAISE EXCEPTION 'Localizar %: %', v_n, r; END IF;
        r := hu42_prueba.cerrar(hu42_prueba.inc(v_n), hu42_prueba.resc(1), 'evacuado', 'Cierre operativo', hu42_prueba.op(80 + v_n));
        IF r->>'codigo' <> 'OK' THEN RAISE EXCEPTION 'Cierre %: %', v_n, r; END IF;

        SELECT to_jsonb(e) INTO v_despues FROM public.expediciones e WHERE id = hu42_prueba.exp(v_n);
        IF v_despues IS DISTINCT FROM v_antes THEN
            RAISE EXCEPTION 'La expedición % cambió: % -> %', v_n, v_antes, v_despues;
        END IF;
        IF r->'resultado'->>'estadoExpedicion' <> (v_antes->>'estado') THEN
            RAISE EXCEPTION 'El informe debe reflejar el estado real de la expedición';
        END IF;
        IF (SELECT count(*) FROM public.eventos_plan) <> v_eventos
           OR (SELECT count(*) FROM public.avisos_usuario) <> v_avisos
           OR (SELECT count(*) FROM public.outbox_notificaciones) <> v_outbox THEN
            RAISE EXCEPTION 'El cierre generó eventos, avisos u outbox';
        END IF;
    END LOOP;
    IF (SELECT estado FROM public.expediciones WHERE id = hu42_prueba.exp(9)) <> 'alerta'
       OR (SELECT estado FROM public.expediciones WHERE id = hu42_prueba.exp(10)) <> 'completada' THEN
        RAISE EXCEPTION 'Los estados de expedición no deben cambiar';
    END IF;
    RAISE NOTICE 'OK 10: con la expedición en alerta y en completada, expediciones (estado, version, actualizado_en y toda la fila) queda idéntica y no hay eventos, avisos ni outbox nuevos';
END $$;

-- 11) Informe inmutable y cascada del ARCO.
DO $$
DECLARE
    v_resumen TEXT;
BEGIN
    BEGIN
        UPDATE public.informes_cierre_incidente SET resumen = 'cambiado';
        RAISE EXCEPTION 'service_role pudo actualizar';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    RESET ROLE;
    BEGIN
        UPDATE public.informes_cierre_incidente SET resumen = 'cambiado';
        RAISE EXCEPTION 'El UPDATE no fue rechazado';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM <> 'INFORME_CIERRE_INMUTABLE' THEN RAISE; END IF;
    END;
    BEGIN
        DELETE FROM public.informes_cierre_incidente;
        RAISE EXCEPTION 'El DELETE directo no fue rechazado';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM <> 'INFORME_CIERRE_INMUTABLE' THEN RAISE; END IF;
    END;
    BEGIN
        TRUNCATE public.informes_cierre_incidente;
        RAISE EXCEPTION 'El TRUNCATE no fue rechazado';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM <> 'INFORME_CIERRE_INMUTABLE' THEN RAISE; END IF;
    END;
    SELECT resumen INTO v_resumen FROM public.informes_cierre_incidente WHERE comando_id = hu42_prueba.op(53);
    IF v_resumen <> 'Cierre con bitácora' THEN RAISE EXCEPTION 'El informe cambió: %', v_resumen; END IF;

    -- Cascada: borrar la expedición arrastra incidente, entradas e informe.
    DELETE FROM public.expediciones WHERE id = hu42_prueba.exp(7);
    IF EXISTS (SELECT 1 FROM public.incidentes WHERE id = hu42_prueba.inc(7))
       OR EXISTS (SELECT 1 FROM public.entradas_bitacora_incidente WHERE incidente_id = hu42_prueba.inc(7))
       OR EXISTS (SELECT 1 FROM public.informes_cierre_incidente WHERE incidente_id = hu42_prueba.inc(7)) THEN
        RAISE EXCEPTION 'La cascada no eliminó el incidente, sus entradas y su informe';
    END IF;
    -- RESTRICT del autor: no se borra el perfil de quien cerró.
    BEGIN
        DELETE FROM public.perfiles_rescatista WHERE usuario_id = hu42_prueba.resc(1);
        RAISE EXCEPTION 'RESTRICT no impidió borrar al autor del informe';
    EXCEPTION WHEN restrict_violation OR foreign_key_violation THEN NULL;
    END;
    RAISE NOTICE 'OK 11: UPDATE, DELETE directo y TRUNCATE del informe dan INFORME_CIERRE_INMUTABLE; service_role no puede actualizar; la cascada del ARCO arrastra incidente, entradas e informe; el autor queda restringido';
END $$;
SET LOCAL ROLE service_role;

-- 12) Privilegio mínimo: simula la 021 (REVOKE de tabla + GRANT de columnas) y comprueba el cierre.
DO $$
DECLARE
    r JSONB;
BEGIN
    RESET ROLE;
    REVOKE UPDATE ON public.incidentes FROM service_role;
    GRANT UPDATE (responsable_id, version, asumido_en) ON public.incidentes TO service_role;
    -- Con solo lo de la 021, el cierre no puede escribir el estado.
    SET LOCAL ROLE service_role;
    r := hu42_prueba.localizar(hu42_prueba.inc(11), hu42_prueba.resc(1), hu42_prueba.op(100));
    IF r->>'codigo' NOT LIKE 'permission denied%' THEN
        RAISE EXCEPTION 'Sin UPDATE (estado) debía fallar con permission denied: %', r;
    END IF;
    RESET ROLE;
    -- La 025 después de la 021: GRANT aditivo (recuperación documentada).
    GRANT UPDATE (estado, cerrado_en, version) ON public.incidentes TO service_role;
    SET LOCAL ROLE service_role;
    r := hu42_prueba.localizar(hu42_prueba.inc(11), hu42_prueba.resc(1), hu42_prueba.op(101));
    IF r->>'codigo' <> 'OK' THEN RAISE EXCEPTION 'Localizar con privilegio mínimo: %', r; END IF;
    r := hu42_prueba.cerrar(hu42_prueba.inc(11), hu42_prueba.resc(1), 'evacuado', 'Con privilegio mínimo', hu42_prueba.op(102));
    IF r->>'codigo' <> 'OK' THEN RAISE EXCEPTION 'Cerrar con privilegio mínimo: %', r; END IF;
    RAISE NOTICE 'OK 12: con REVOKE de tabla y GRANT (responsable_id, version, asumido_en) el cierre falla con permission denied; con GRANT (estado, cerrado_en, version) funciona';
END $$;

-- 13) Registro de la migración.
DO $$
BEGIN
    RESET ROLE;
    IF to_regclass('public.treksafe_migraciones') IS NULL THEN
        RAISE EXCEPTION 'Falta treksafe_migraciones (aplicar 000 antes)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.treksafe_migraciones
        WHERE version = '025' AND nombre = 'hu42_cerrar_incidente' AND hu = 'HU-42') THEN
        RAISE EXCEPTION '025 no quedó registrada';
    END IF;
    RAISE NOTICE 'OK 13: la 025 quedó registrada en treksafe_migraciones';
END $$;

ROLLBACK;

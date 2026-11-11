-- Solo PostgreSQL local desechable; todos los datos de prueba se revierten (ROLLBACK final).
-- Requiere: los roles anon, authenticated y service_role con los privilegios por defecto
-- de Supabase, el esquema base (usuarios, perfiles_senderista, perfiles_rescatista,
-- expediciones), las migraciones 000 a 018 y la 019 aplicadas. Se ejecuta con
-- backend/scripts/test-hu41-postgres.mjs, que prepara ese entorno. Cada caso imprime un
-- aviso "OK n: ..."; el primero que falla aborta el archivo con su mensaje.
-- La carrera real entre dos sesiones se prueba en el script .mjs, no aquí.
BEGIN;

-- Ayudantes de pruebas: ejecutan las funciones como service_role y devuelven el código del
-- error (o 'OK') y el DETAIL. Viven en un esquema que se revierte con la transacción.
CREATE SCHEMA hu41_prueba;
GRANT USAGE ON SCHEMA hu41_prueba TO service_role;

CREATE FUNCTION hu41_prueba.inc(n INTEGER) RETURNS UUID LANGUAGE sql IMMUTABLE AS $$
    SELECT ('f1000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
CREATE FUNCTION hu41_prueba.op(n INTEGER) RETURNS UUID LANGUAGE sql IMMUTABLE AS $$
    SELECT ('c0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
CREATE FUNCTION hu41_prueba.resc(n INTEGER) RETURNS UUID LANGUAGE sql IMMUTABLE AS $$
    SELECT ('a0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
GRANT EXECUTE ON FUNCTION hu41_prueba.inc(INTEGER), hu41_prueba.op(INTEGER), hu41_prueba.resc(INTEGER)
    TO service_role;

CREATE FUNCTION hu41_prueba.agregar(p_inc UUID, p_autor UUID, p_texto TEXT, p_corrige UUID, p_op UUID)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
    v_detalle TEXT;
    v_res     JSONB;
BEGIN
    BEGIN
        v_res := public.treksafe_agregar_entrada_bitacora(p_inc, p_autor, p_texto, p_corrige, p_op);
        RETURN jsonb_build_object('codigo', 'OK', 'resultado', v_res);
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_detalle = PG_EXCEPTION_DETAIL;
        RETURN jsonb_build_object('codigo', SQLERRM, 'detalle', v_detalle);
    END;
END;
$$;
GRANT EXECUTE ON FUNCTION hu41_prueba.agregar(UUID, UUID, TEXT, UUID, UUID) TO service_role;

CREATE FUNCTION hu41_prueba.interna(p_inc UUID, p_autor UUID, p_tipo TEXT, p_texto TEXT, p_corrige UUID, p_op UUID)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
    v_detalle TEXT;
    v_res     JSONB;
BEGIN
    BEGIN
        v_res := public.treksafe_anexar_entrada_bitacora_interna(p_inc, p_autor, p_tipo, p_texto, p_corrige, p_op);
        RETURN jsonb_build_object('codigo', 'OK', 'resultado', v_res);
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_detalle = PG_EXCEPTION_DETAIL;
        RETURN jsonb_build_object('codigo', SQLERRM, 'detalle', v_detalle);
    END;
END;
$$;
GRANT EXECUTE ON FUNCTION hu41_prueba.interna(UUID, UUID, TEXT, TEXT, UUID, UUID) TO service_role;

-- Datos de prueba (superusuario).
INSERT INTO public.usuarios (id, correo_electronico, hash_contrasena, rol) VALUES
    (hu41_prueba.resc(1), 'resc1@example.invalid', 'fixture', 'rescatista'),
    (hu41_prueba.resc(2), 'resc2@example.invalid', 'fixture', 'rescatista'),
    (hu41_prueba.resc(3), 'resc3@example.invalid', 'fixture', 'rescatista'),
    ('b0000000-0000-4000-8000-000000000001', 'send1@example.invalid', 'fixture', 'senderista');
INSERT INTO public.perfiles_senderista (usuario_id, nombre_completo, telefono, id_documento)
    VALUES ('b0000000-0000-4000-8000-000000000001', 'Senderista Ficticio', '999999999', '00000001');
-- DEP-04 conserva una única expedición bloqueante por senderista. Cada incidente
-- usa su propio propietario sin cambiar los actores/responsables de los casos.
INSERT INTO public.usuarios (id, correo_electronico, hash_contrasena, rol)
SELECT ('b0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'send' || n || '@example.invalid', 'fixture', 'senderista'
FROM generate_series(2, 8) AS n;
INSERT INTO public.perfiles_senderista (usuario_id, nombre_completo, telefono, id_documento)
SELECT ('b0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'Senderista Ficticio ' || n, '999999999', lpad(n::text, 8, '0')
FROM generate_series(2, 8) AS n;
INSERT INTO public.registros_institucionales_rescatista
    (institucion, numero_credencial, nombre_completo, fecha_nacimiento) VALUES
    ('AGMP', 'CRED-1', 'Rescatista Uno', '1990-01-01'),
    ('AGMP', 'CRED-2', 'Rescatista Dos', '1991-02-02'),
    ('AGMP', 'CRED-3', 'Rescatista Tres', '1992-03-03');
INSERT INTO public.perfiles_rescatista (usuario_id, numero_credencial, nombre_completo, fecha_nacimiento) VALUES
    (hu41_prueba.resc(1), 'CRED-1', 'Rescatista Uno', '1990-01-01'),
    (hu41_prueba.resc(2), 'CRED-2', 'Rescatista Dos', '1991-02-02'),
    (hu41_prueba.resc(3), 'CRED-3', 'Rescatista Tres', '1992-03-03');

INSERT INTO public.expediciones
    (id, senderista_id, lugar_inicio, lugar_fin, hora_inicio, hora_retorno_estimada, estado)
SELECT ('e0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       ('b0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'Inicio', 'Destino',
       now() - interval '5 hours', now() - interval '2 hours', 'alerta'::public.estado_expedicion_enum
FROM generate_series(1, 8) AS n;

-- Incidentes 1 a 8, uno por expedición, todos con R1 como responsable vigente.
INSERT INTO public.incidentes (id, expedicion_id, responsable_id, operacion_id)
SELECT hu41_prueba.inc(n), ('e0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       hu41_prueba.resc(1), ('c1000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
FROM generate_series(1, 8) AS n;

-- 1) Estructura, funciones y columnas.
DO $$
DECLARE
    v_funcion REGPROCEDURE;
    v_rol TEXT;
    v_columnas TEXT;
    v_trigger TEXT;
    v_tipo CHAR;
BEGIN
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.entradas_bitacora_incidente'::REGCLASS) THEN
        RAISE EXCEPTION 'entradas_bitacora_incidente debe tener RLS activo';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
        AND tablename = 'entradas_bitacora_incidente' AND policyname = 'treksafe_deny_anon_authenticated') THEN
        RAISE EXCEPTION 'Falta la política treksafe_deny_anon_authenticated';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
        AND indexname = 'uq_entradas_bitacora_un_cierre'
        AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%WHERE%') THEN
        RAISE EXCEPTION 'Falta el índice único parcial uq_entradas_bitacora_un_cierre';
    END IF;

    SELECT string_agg(column_name, ',' ORDER BY column_name) INTO v_columnas
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'entradas_bitacora_incidente';
    IF v_columnas <> 'autor_id,corrige_entrada_id,id,incidente_id,operacion_id,registrada_en,secuencia,texto,tipo' THEN
        RAISE EXCEPTION 'Columnas inesperadas en entradas_bitacora_incidente: %', v_columnas;
    END IF;

    FOREACH v_trigger IN ARRAY ARRAY[
        'trg_entradas_bitacora_antes_de_insertar', 'trg_entradas_bitacora_solo_anexado',
        'trg_entradas_bitacora_sin_borrado', 'trg_entradas_bitacora_sin_truncate'
    ] LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = v_trigger AND NOT tgisinternal
            AND tgrelid = 'public.entradas_bitacora_incidente'::REGCLASS) THEN
            RAISE EXCEPTION 'Falta el trigger %', v_trigger;
        END IF;
    END LOOP;

    SELECT confdeltype INTO v_tipo FROM pg_constraint WHERE conname = 'fk_entradas_bitacora_incidente';
    IF v_tipo IS DISTINCT FROM 'c' THEN RAISE EXCEPTION 'El FK al incidente debe ser ON DELETE CASCADE (%)', v_tipo; END IF;
    SELECT confdeltype INTO v_tipo FROM pg_constraint WHERE conname = 'fk_entradas_bitacora_autor';
    IF v_tipo IS DISTINCT FROM 'r' THEN RAISE EXCEPTION 'El FK al autor debe ser ON DELETE RESTRICT (%)', v_tipo; END IF;

    FOREACH v_funcion IN ARRAY ARRAY[
        'public.treksafe_agregar_entrada_bitacora(uuid,uuid,text,uuid,uuid)'::REGPROCEDURE,
        'public.treksafe_anexar_entrada_bitacora_interna(uuid,uuid,text,text,uuid,uuid)'::REGPROCEDURE,
        'public.treksafe_entrada_bitacora_repetida(uuid,uuid,uuid,text,text,uuid)'::REGPROCEDURE,
        'public.treksafe_resultado_entrada_bitacora(public.entradas_bitacora_incidente,boolean)'::REGPROCEDURE,
        'public.treksafe_entradas_bitacora_antes_de_insertar()'::REGPROCEDURE,
        'public.treksafe_entradas_bitacora_solo_anexado()'::REGPROCEDURE
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
        -- PUBLIC (grantee 0). Si proacl es NULL rige el permiso por defecto (EXECUTE a PUBLIC).
        IF EXISTS (
            SELECT 1 FROM pg_proc p,
                 aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
            WHERE p.oid = v_funcion AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
        ) THEN
            RAISE EXCEPTION 'PUBLIC no debe ejecutar %', v_funcion;
        END IF;
    END LOOP;

    -- service_role ejecuta las cuatro funciones llamables (los triggers no lo necesitan).
    FOREACH v_funcion IN ARRAY ARRAY[
        'public.treksafe_agregar_entrada_bitacora(uuid,uuid,text,uuid,uuid)'::REGPROCEDURE,
        'public.treksafe_anexar_entrada_bitacora_interna(uuid,uuid,text,text,uuid,uuid)'::REGPROCEDURE,
        'public.treksafe_entrada_bitacora_repetida(uuid,uuid,uuid,text,text,uuid)'::REGPROCEDURE,
        'public.treksafe_resultado_entrada_bitacora(public.entradas_bitacora_incidente,boolean)'::REGPROCEDURE
    ] LOOP
        IF NOT has_function_privilege('service_role', v_funcion, 'EXECUTE') THEN
            RAISE EXCEPTION 'service_role debe poder ejecutar %', v_funcion;
        END IF;
    END LOOP;
    RAISE NOTICE 'OK 1: RLS, política, índice de cierre único, columnas sin datos médicos, 4 triggers, FK (cascada y restrict), funciones SECURITY INVOKER con search_path vacío y sin EXECUTE para PUBLIC, anon ni authenticated';
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
            PERFORM count(*) FROM public.entradas_bitacora_incidente;
            RESET ROLE;
            RAISE EXCEPTION '% pudo leer la bitácora', v_rol;
        EXCEPTION WHEN insufficient_privilege THEN
            RESET ROLE;
        END;
        EXECUTE format('SET LOCAL ROLE %I', v_rol);
        BEGIN
            INSERT INTO public.entradas_bitacora_incidente (incidente_id, autor_id, tipo, texto, operacion_id)
            VALUES (hu41_prueba.inc(1), hu41_prueba.resc(1), 'nota', 'x', gen_random_uuid());
            RESET ROLE;
            RAISE EXCEPTION '% pudo escribir en la bitácora', v_rol;
        EXCEPTION WHEN insufficient_privilege THEN
            RESET ROLE;
        END;
        EXECUTE format('SET LOCAL ROLE %I', v_rol);
        BEGIN
            PERFORM public.treksafe_agregar_entrada_bitacora(
                hu41_prueba.inc(1), hu41_prueba.resc(1), 'x', NULL, gen_random_uuid());
            RESET ROLE;
            RAISE EXCEPTION '% pudo ejecutar la RPC', v_rol;
        EXCEPTION WHEN insufficient_privilege THEN
            RESET ROLE;
        END;
        EXECUTE format('SET LOCAL ROLE %I', v_rol);
        BEGIN
            PERFORM public.treksafe_anexar_entrada_bitacora_interna(
                hu41_prueba.inc(1), hu41_prueba.resc(1), 'nota', 'x', NULL, gen_random_uuid());
            RESET ROLE;
            RAISE EXCEPTION '% pudo ejecutar la función interna', v_rol;
        EXCEPTION WHEN insufficient_privilege THEN
            RESET ROLE;
        END;
    END LOOP;

    IF NOT has_table_privilege('service_role', 'public.entradas_bitacora_incidente', 'SELECT')
       OR NOT has_table_privilege('service_role', 'public.entradas_bitacora_incidente', 'INSERT') THEN
        RAISE EXCEPTION 'service_role debe tener SELECT e INSERT';
    END IF;
    IF has_table_privilege('service_role', 'public.entradas_bitacora_incidente', 'UPDATE')
       OR has_table_privilege('service_role', 'public.entradas_bitacora_incidente', 'DELETE')
       OR has_table_privilege('service_role', 'public.entradas_bitacora_incidente', 'TRUNCATE') THEN
        RAISE EXCEPTION 'service_role no debe tener UPDATE, DELETE ni TRUNCATE sobre la bitácora';
    END IF;
    IF NOT has_column_privilege('service_role', 'public.incidentes', 'version', 'UPDATE') THEN
        RAISE EXCEPTION 'service_role necesita UPDATE (version) sobre incidentes para FOR SHARE';
    END IF;

    SET LOCAL ROLE service_role;
    SELECT count(*) INTO v_n FROM public.entradas_bitacora_incidente;
    RESET ROLE;
    IF v_n <> 0 THEN RAISE EXCEPTION 'La bitácora debería estar vacía'; END IF;
    RAISE NOTICE 'OK 2: anon y authenticated no leen, escriben ni ejecutan; service_role solo SELECT e INSERT y UPDATE (version) en incidentes';
END $$;

-- De aquí en adelante todo corre como service_role, igual que el backend.
SET LOCAL ROLE service_role;

-- 3) CA-01: el responsable vigente añade una nota.
DO $$
DECLARE
    r JSONB;
BEGIN
    r := hu41_prueba.agregar(hu41_prueba.inc(1), hu41_prueba.resc(1), '  Llegamos al punto de encuentro  ', NULL, hu41_prueba.op(1));
    IF r->>'codigo' <> 'OK' THEN RAISE EXCEPTION 'Esperaba OK y llegó %', r; END IF;
    r := r->'resultado';
    IF r->>'id' IS NULL
       OR r->>'incidenteId' <> hu41_prueba.inc(1)::text
       OR r->>'tipo' <> 'nota'
       OR r->>'texto' <> 'Llegamos al punto de encuentro'
       OR r->'autor'->>'id' <> hu41_prueba.resc(1)::text
       OR r->'autor'->>'nombreCompleto' <> 'Rescatista Uno'
       OR r->>'registradaEn' IS NULL
       OR r->'corrigeEntradaId' <> 'null'::jsonb
       OR (r->>'repetido')::BOOLEAN IS NOT FALSE THEN
        RAISE EXCEPTION 'Resultado inesperado: %', r;
    END IF;
    RAISE NOTICE 'OK 3: el responsable añade una nota; devuelve id, tipo, texto recortado, autor, hora y repetido=false';
END $$;

-- 4) CA-02: la hora la fija el servidor y la secuencia no se puede forzar.
DO $$
DECLARE
    v_hora TIMESTAMPTZ;
BEGIN
    INSERT INTO public.entradas_bitacora_incidente (incidente_id, autor_id, tipo, texto, operacion_id, registrada_en)
    VALUES (hu41_prueba.inc(1), hu41_prueba.resc(1), 'nota', 'Hora forzada por el cliente', hu41_prueba.op(2), '2000-01-01')
    RETURNING registrada_en INTO v_hora;
    IF v_hora < now() THEN RAISE EXCEPTION 'El trigger no fijó la hora del servidor: %', v_hora; END IF;
    BEGIN
        INSERT INTO public.entradas_bitacora_incidente (secuencia, incidente_id, autor_id, tipo, texto, operacion_id)
        VALUES (1, hu41_prueba.inc(1), hu41_prueba.resc(1), 'nota', 'Secuencia forzada', hu41_prueba.op(3));
        RAISE EXCEPTION 'Se aceptó una secuencia explícita';
    EXCEPTION WHEN generated_always THEN NULL;
    END;
    RAISE NOTICE 'OK 4: registrada_en la fija el servidor (ignora 2000-01-01) y secuencia es GENERATED ALWAYS';
END $$;

-- 5) Inmutabilidad: UPDATE, DELETE directo y TRUNCATE.
DO $$
DECLARE
    v_texto TEXT;
BEGIN
    BEGIN
        UPDATE public.entradas_bitacora_incidente SET texto = 'cambiado';
        RAISE EXCEPTION 'service_role pudo actualizar';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    RESET ROLE;
    BEGIN
        UPDATE public.entradas_bitacora_incidente SET texto = 'cambiado';
        RAISE EXCEPTION 'El UPDATE no fue rechazado';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM <> 'ENTRADA_BITACORA_INMUTABLE' THEN RAISE; END IF;
    END;
    BEGIN
        DELETE FROM public.entradas_bitacora_incidente;
        RAISE EXCEPTION 'El DELETE directo no fue rechazado';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM <> 'ENTRADA_BITACORA_INMUTABLE' THEN RAISE; END IF;
    END;
    BEGIN
        TRUNCATE public.entradas_bitacora_incidente;
        RAISE EXCEPTION 'El TRUNCATE no fue rechazado';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM <> 'ENTRADA_BITACORA_INMUTABLE' THEN RAISE; END IF;
    END;
    SELECT texto INTO v_texto FROM public.entradas_bitacora_incidente WHERE operacion_id = hu41_prueba.op(1);
    IF v_texto <> 'Llegamos al punto de encuentro' THEN RAISE EXCEPTION 'La entrada cambió: %', v_texto; END IF;
    RAISE NOTICE 'OK 5: UPDATE, DELETE directo y TRUNCATE dan ENTRADA_BITACORA_INMUTABLE; service_role no puede actualizar; la entrada sigue intacta';
END $$;
SET LOCAL ROLE service_role;

-- 6) CA-03: quien no es el responsable vigente no escribe.
DO $$
DECLARE
    r JSONB; d JSONB; v_antes INTEGER; v_despues INTEGER;
BEGIN
    SELECT count(*) INTO v_antes FROM public.entradas_bitacora_incidente;
    r := hu41_prueba.agregar(hu41_prueba.inc(1), hu41_prueba.resc(2), 'Intento de otro rescatista', NULL, hu41_prueba.op(10));
    IF r->>'codigo' <> 'NO_ES_RESPONSABLE' THEN RAISE EXCEPTION 'Esperaba NO_ES_RESPONSABLE y llegó %', r; END IF;
    d := (r->>'detalle')::JSONB;
    IF d->>'id' <> hu41_prueba.resc(1)::text OR d->>'nombreCompleto' <> 'Rescatista Uno' THEN
        RAISE EXCEPTION 'DETAIL sin el responsable vigente: %', r;
    END IF;
    r := hu41_prueba.agregar(hu41_prueba.inc(1), 'f0000000-0000-4000-8000-000000000000', 'UUID desconocido', NULL, hu41_prueba.op(11));
    IF r->>'codigo' <> 'NO_ES_RESPONSABLE' THEN RAISE EXCEPTION 'Un UUID desconocido tampoco es responsable: %', r; END IF;
    SELECT count(*) INTO v_despues FROM public.entradas_bitacora_incidente;
    IF v_antes <> v_despues THEN RAISE EXCEPTION 'El rechazo no debe escribir nada'; END IF;
    RAISE NOTICE 'OK 6: otro rescatista o un UUID desconocido reciben NO_ES_RESPONSABLE con el responsable vigente, sin escribir';
END $$;

-- 7) Estados: abierto y localizado escriben; cerrado no; inexistente.
RESET ROLE;
UPDATE public.incidentes SET estado = 'localizado', version = version + 1 WHERE id = hu41_prueba.inc(2);
UPDATE public.incidentes SET estado = 'cerrado', cerrado_en = now(), version = version + 1 WHERE id = hu41_prueba.inc(3);
SET LOCAL ROLE service_role;
DO $$
DECLARE
    r JSONB;
BEGIN
    r := hu41_prueba.agregar(hu41_prueba.inc(2), hu41_prueba.resc(1), 'Persona localizada', NULL, hu41_prueba.op(20));
    IF r->>'codigo' <> 'OK' THEN RAISE EXCEPTION 'Un incidente localizado debe admitir entradas: %', r; END IF;
    r := hu41_prueba.agregar(hu41_prueba.inc(3), hu41_prueba.resc(1), 'Ya cerrado', NULL, hu41_prueba.op(21));
    IF r->>'codigo' <> 'INCIDENTE_CERRADO' THEN RAISE EXCEPTION 'Esperaba INCIDENTE_CERRADO y llegó %', r; END IF;
    r := hu41_prueba.agregar(hu41_prueba.inc(3), hu41_prueba.resc(2), 'Cerrado y otro autor', NULL, hu41_prueba.op(22));
    IF r->>'codigo' <> 'INCIDENTE_CERRADO' THEN RAISE EXCEPTION 'Cerrado se evalúa antes que el responsable: %', r; END IF;
    r := hu41_prueba.agregar('f1000000-0000-4000-8000-0000000000ff', hu41_prueba.resc(1), 'No existe', NULL, hu41_prueba.op(23));
    IF r->>'codigo' <> 'INCIDENTE_NO_ENCONTRADO' THEN RAISE EXCEPTION 'Esperaba INCIDENTE_NO_ENCONTRADO y llegó %', r; END IF;
    IF EXISTS (SELECT 1 FROM public.entradas_bitacora_incidente
               WHERE operacion_id IN (hu41_prueba.op(21), hu41_prueba.op(22), hu41_prueba.op(23))) THEN
        RAISE EXCEPTION 'Los rechazos no deben escribir';
    END IF;
    RAISE NOTICE 'OK 7: localizado admite entradas; cerrado da INCIDENTE_CERRADO; inexistente da INCIDENTE_NO_ENCONTRADO';
END $$;

-- 8) Validación del texto y de los parámetros.
DO $$
DECLARE
    r JSONB; v_guardado TEXT;
BEGIN
    r := hu41_prueba.agregar(NULL, hu41_prueba.resc(1), 'x', NULL, hu41_prueba.op(30));
    IF r->>'codigo' <> 'DATOS_INVALIDOS' THEN RAISE EXCEPTION 'Incidente nulo: %', r; END IF;
    r := hu41_prueba.agregar(hu41_prueba.inc(4), NULL, 'x', NULL, hu41_prueba.op(30));
    IF r->>'codigo' <> 'DATOS_INVALIDOS' THEN RAISE EXCEPTION 'Autor nulo: %', r; END IF;
    r := hu41_prueba.agregar(hu41_prueba.inc(4), hu41_prueba.resc(1), NULL, NULL, hu41_prueba.op(30));
    IF r->>'codigo' <> 'DATOS_INVALIDOS' THEN RAISE EXCEPTION 'Texto nulo: %', r; END IF;
    r := hu41_prueba.agregar(hu41_prueba.inc(4), hu41_prueba.resc(1), 'x', NULL, NULL);
    IF r->>'codigo' <> 'DATOS_INVALIDOS' THEN RAISE EXCEPTION 'Operación nula: %', r; END IF;
    r := hu41_prueba.agregar(hu41_prueba.inc(4), hu41_prueba.resc(1), '   ', NULL, hu41_prueba.op(31));
    IF r->>'codigo' <> 'DATOS_INVALIDOS' THEN RAISE EXCEPTION 'Texto de espacios: %', r; END IF;
    r := hu41_prueba.agregar(hu41_prueba.inc(4), hu41_prueba.resc(1), E' \t\r\n ', NULL, hu41_prueba.op(31));
    IF r->>'codigo' <> 'DATOS_INVALIDOS' THEN RAISE EXCEPTION 'Texto de blancos: %', r; END IF;
    r := hu41_prueba.agregar(hu41_prueba.inc(4), hu41_prueba.resc(1), repeat('a', 2001), NULL, hu41_prueba.op(32));
    IF r->>'codigo' <> 'DATOS_INVALIDOS' THEN RAISE EXCEPTION '2001 caracteres: %', r; END IF;
    r := hu41_prueba.agregar(hu41_prueba.inc(4), hu41_prueba.resc(1), repeat('a', 2000), NULL, hu41_prueba.op(33));
    IF r->>'codigo' <> 'OK' THEN RAISE EXCEPTION '2000 caracteres deben pasar: %', r; END IF;
    r := hu41_prueba.agregar(hu41_prueba.inc(4), hu41_prueba.resc(1), E'\n  Texto con espacios  \n', NULL, hu41_prueba.op(34));
    SELECT texto INTO v_guardado FROM public.entradas_bitacora_incidente WHERE operacion_id = hu41_prueba.op(34);
    IF v_guardado <> 'Texto con espacios' THEN RAISE EXCEPTION 'El texto debe guardarse recortado: [%]', v_guardado; END IF;
    IF EXISTS (SELECT 1 FROM public.entradas_bitacora_incidente WHERE operacion_id IN (hu41_prueba.op(31), hu41_prueba.op(32))) THEN
        RAISE EXCEPTION 'Los rechazos no deben escribir';
    END IF;
    -- La función interna valida igual, y además el tipo.
    r := hu41_prueba.interna(hu41_prueba.inc(4), hu41_prueba.resc(1), 'relevo', 'x', NULL, hu41_prueba.op(35));
    IF r->>'codigo' <> 'DATOS_INVALIDOS' THEN RAISE EXCEPTION 'Tipo inválido: %', r; END IF;
    r := hu41_prueba.interna(hu41_prueba.inc(4), hu41_prueba.resc(1), 'correccion', 'x', NULL, hu41_prueba.op(35));
    IF r->>'codigo' <> 'DATOS_INVALIDOS' THEN RAISE EXCEPTION 'Corrección sin entrada a corregir: %', r; END IF;
    r := hu41_prueba.interna(hu41_prueba.inc(4), hu41_prueba.resc(1), 'nota', 'x', hu41_prueba.inc(4), hu41_prueba.op(35));
    IF r->>'codigo' <> 'DATOS_INVALIDOS' THEN RAISE EXCEPTION 'Nota con entrada a corregir: %', r; END IF;
    RAISE NOTICE 'OK 8: nulos, vacío, solo blancos y 2001 caracteres dan DATOS_INVALIDOS; 2000 pasa; el texto se guarda recortado; la interna valida el tipo';
END $$;

-- 9) Corrección como entrada nueva.
DO $$
DECLARE
    r JSONB; v_orig UUID; v_texto_antes TEXT; v_otra UUID;
BEGIN
    r := hu41_prueba.agregar(hu41_prueba.inc(5), hu41_prueba.resc(1), 'Version equivocada', NULL, hu41_prueba.op(40));
    v_orig := (r->'resultado'->>'id')::uuid;
    r := hu41_prueba.agregar(hu41_prueba.inc(5), hu41_prueba.resc(1), 'Version corregida', v_orig, hu41_prueba.op(41));
    IF r->>'codigo' <> 'OK' OR r->'resultado'->>'tipo' <> 'correccion'
       OR r->'resultado'->>'corrigeEntradaId' <> v_orig::text THEN
        RAISE EXCEPTION 'Corrección válida: %', r;
    END IF;
    SELECT texto INTO v_texto_antes FROM public.entradas_bitacora_incidente WHERE id = v_orig;
    IF v_texto_antes <> 'Version equivocada' THEN RAISE EXCEPTION 'La original no debe cambiar'; END IF;

    -- Entrada de otro incidente y entrada inexistente.
    v_otra := (SELECT id FROM public.entradas_bitacora_incidente WHERE operacion_id = hu41_prueba.op(1));
    r := hu41_prueba.agregar(hu41_prueba.inc(5), hu41_prueba.resc(1), 'Cruzada', v_otra, hu41_prueba.op(42));
    IF r->>'codigo' <> 'CORRECCION_INVALIDA' THEN RAISE EXCEPTION 'Corrección de otro incidente: %', r; END IF;
    r := hu41_prueba.agregar(hu41_prueba.inc(5), hu41_prueba.resc(1), 'Inexistente', gen_random_uuid(), hu41_prueba.op(43));
    IF r->>'codigo' <> 'CORRECCION_INVALIDA' THEN RAISE EXCEPTION 'Corrección inexistente: %', r; END IF;

    -- Restricciones de la tabla (INSERT directo).
    BEGIN
        INSERT INTO public.entradas_bitacora_incidente (incidente_id, autor_id, tipo, texto, operacion_id)
        VALUES (hu41_prueba.inc(5), hu41_prueba.resc(1), 'correccion', 'Sin entrada', gen_random_uuid());
        RAISE EXCEPTION 'Una corrección sin corrige_entrada_id fue aceptada';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO public.entradas_bitacora_incidente (incidente_id, autor_id, tipo, texto, corrige_entrada_id, operacion_id)
        VALUES (hu41_prueba.inc(5), hu41_prueba.resc(1), 'correccion', 'Cruzada', v_otra, gen_random_uuid());
        RAISE EXCEPTION 'Una corrección cruzada fue aceptada';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO public.entradas_bitacora_incidente (incidente_id, autor_id, tipo, texto, operacion_id)
        VALUES (hu41_prueba.inc(5), hu41_prueba.resc(1), 'nota', 'x', gen_random_uuid()),
               (hu41_prueba.inc(5), hu41_prueba.resc(1), 'otro', 'x', gen_random_uuid());
        RAISE EXCEPTION 'Un tipo inválido fue aceptado';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    RAISE NOTICE 'OK 9: la corrección es una entrada nueva y la original no cambia; CORRECCION_INVALIDA; CHECK y FK compuesta en INSERT directo';
END $$;

-- 10) Idempotencia.
RESET ROLE;
INSERT INTO public.eventos_plan
    (expedicion_id, senderista_id, tipo, actor_id, version_resultante, cambios, operacion_id)
VALUES ('e0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000001',
        'EDITADA', 'b0000000-0000-4000-8000-000000000001', 2, '{}'::jsonb, 'd0000000-0000-4000-8000-000000000001');
SET LOCAL ROLE service_role;
DO $$
DECLARE
    a JSONB; b JSONB;
BEGIN
    a := hu41_prueba.agregar(hu41_prueba.inc(6), hu41_prueba.resc(1), 'Primera vez', NULL, hu41_prueba.op(50));
    b := hu41_prueba.agregar(hu41_prueba.inc(6), hu41_prueba.resc(1), '  Primera vez  ', NULL, hu41_prueba.op(50));
    IF a->>'codigo' <> 'OK' OR b->>'codigo' <> 'OK'
       OR (a->'resultado'->>'repetido')::BOOLEAN IS NOT FALSE
       OR (b->'resultado'->>'repetido')::BOOLEAN IS NOT TRUE
       OR a->'resultado'->>'id' <> b->'resultado'->>'id'
       OR a->'resultado'->>'registradaEn' <> b->'resultado'->>'registradaEn' THEN
        RAISE EXCEPTION 'La repetición debe devolver la original: % / %', a, b;
    END IF;
    IF (SELECT count(*) FROM public.entradas_bitacora_incidente WHERE operacion_id = hu41_prueba.op(50)) <> 1 THEN
        RAISE EXCEPTION 'Debe haber una sola fila';
    END IF;
    a := hu41_prueba.agregar(hu41_prueba.inc(6), hu41_prueba.resc(1), 'Otro texto', NULL, hu41_prueba.op(50));
    IF a->>'codigo' <> 'OPERACION_YA_REGISTRADA' THEN RAISE EXCEPTION 'Otro texto: %', a; END IF;
    a := hu41_prueba.agregar(hu41_prueba.inc(7), hu41_prueba.resc(1), 'Primera vez', NULL, hu41_prueba.op(50));
    IF a->>'codigo' <> 'OPERACION_YA_REGISTRADA' THEN RAISE EXCEPTION 'Otro incidente: %', a; END IF;
    a := hu41_prueba.agregar(hu41_prueba.inc(6), hu41_prueba.resc(2), 'Primera vez', NULL, hu41_prueba.op(50));
    IF a->>'codigo' <> 'OPERACION_YA_REGISTRADA' OR COALESCE(a->>'detalle', '') <> '' THEN
        RAISE EXCEPTION 'Otro autor no debe revelar nada: %', a;
    END IF;
    -- UUID usado por un incidente y por un evento del plan.
    a := hu41_prueba.agregar(hu41_prueba.inc(6), hu41_prueba.resc(1), 'Con op de incidente', NULL, 'c1000000-0000-4000-8000-000000000001');
    IF a->>'codigo' <> 'OPERACION_YA_REGISTRADA' THEN RAISE EXCEPTION 'UUID de incidentes: %', a; END IF;
    a := hu41_prueba.agregar(hu41_prueba.inc(6), hu41_prueba.resc(1), 'Con op de evento', NULL, 'd0000000-0000-4000-8000-000000000001');
    IF a->>'codigo' <> 'OPERACION_YA_REGISTRADA' THEN RAISE EXCEPTION 'UUID de eventos_plan: %', a; END IF;
    RAISE NOTICE 'OK 10: idempotencia (misma entrada con repetido=true), otro contenido, actor o UUID de incidentes/eventos_plan dan OPERACION_YA_REGISTRADA';
END $$;

-- 11) El permiso se transfiere con el relevo; la autoría se conserva.
RESET ROLE;
UPDATE public.incidentes SET responsable_id = hu41_prueba.resc(2), version = version + 1 WHERE id = hu41_prueba.inc(1);
SET LOCAL ROLE service_role;
DO $$
DECLARE
    r JSONB; d JSONB;
BEGIN
    r := hu41_prueba.agregar(hu41_prueba.inc(1), hu41_prueba.resc(1), 'R1 tras el relevo', NULL, hu41_prueba.op(60));
    IF r->>'codigo' <> 'NO_ES_RESPONSABLE' THEN RAISE EXCEPTION 'R1 ya no es responsable: %', r; END IF;
    d := (r->>'detalle')::JSONB;
    IF d->>'id' <> hu41_prueba.resc(2)::text OR d->>'nombreCompleto' <> 'Rescatista Dos' THEN
        RAISE EXCEPTION 'DETAIL debe nombrar a R2: %', r;
    END IF;
    r := hu41_prueba.agregar(hu41_prueba.inc(1), hu41_prueba.resc(2), 'R2 tras el relevo', NULL, hu41_prueba.op(61));
    IF r->>'codigo' <> 'OK' THEN RAISE EXCEPTION 'R2 debe poder escribir: %', r; END IF;
    IF EXISTS (SELECT 1 FROM public.entradas_bitacora_incidente
               WHERE operacion_id IN (hu41_prueba.op(1), hu41_prueba.op(2)) AND autor_id <> hu41_prueba.resc(1)) THEN
        RAISE EXCEPTION 'Las entradas de R1 deben conservar su autoría';
    END IF;
    -- Repetición de una operación anterior al relevo.
    r := hu41_prueba.agregar(hu41_prueba.inc(1), hu41_prueba.resc(1), 'Llegamos al punto de encuentro', NULL, hu41_prueba.op(1));
    IF r->>'codigo' <> 'OK' OR (r->'resultado'->>'repetido')::BOOLEAN IS NOT TRUE THEN
        RAISE EXCEPTION 'El reintento anterior al relevo debe resolverse como repetido: %', r;
    END IF;
    RAISE NOTICE 'OK 11: tras el relevo R1 recibe NO_ES_RESPONSABLE (vigente R2), R2 escribe, la autoría se conserva y el reintento previo da repetido=true';
END $$;

-- 12) Orden cronológico estable.
DO $$
DECLARE
    n INTEGER; r JSONB; v_orden TEXT; v_distintas INTEGER;
BEGIN
    FOR n IN 1..5 LOOP
        r := hu41_prueba.agregar(hu41_prueba.inc(7), hu41_prueba.resc(1), 'orden ' || n, NULL, hu41_prueba.op(70 + n));
        IF r->>'codigo' <> 'OK' THEN RAISE EXCEPTION 'Entrada % rechazada: %', n, r; END IF;
    END LOOP;
    SELECT string_agg(texto, ',' ORDER BY registrada_en, secuencia), count(DISTINCT secuencia)
      INTO v_orden, v_distintas
    FROM public.entradas_bitacora_incidente WHERE incidente_id = hu41_prueba.inc(7);
    IF v_orden <> 'orden 1,orden 2,orden 3,orden 4,orden 5' OR v_distintas <> 5 THEN
        RAISE EXCEPTION 'Orden inesperado: % (% secuencias distintas)', v_orden, v_distintas;
    END IF;
    IF EXISTS (
        SELECT 1 FROM (
            SELECT registrada_en, lag(registrada_en) OVER (ORDER BY secuencia) AS anterior
            FROM public.entradas_bitacora_incidente WHERE incidente_id = hu41_prueba.inc(7)
        ) t WHERE anterior IS NOT NULL AND registrada_en < anterior
    ) THEN
        RAISE EXCEPTION 'registrada_en no debe decrecer con la secuencia';
    END IF;
    RAISE NOTICE 'OK 12: 5 entradas en la misma transacción salen en orden estricto por (registrada_en, secuencia), sin empates en secuencia';
END $$;

-- 13) Privilegio mínimo: basta UPDATE (version) para FOR SHARE; sin él la RPC falla.
RESET ROLE;
REVOKE UPDATE, DELETE ON public.incidentes FROM service_role;
GRANT UPDATE (version) ON public.incidentes TO service_role;
SET LOCAL ROLE service_role;
DO $$
DECLARE
    r JSONB;
BEGIN
    r := hu41_prueba.agregar(hu41_prueba.inc(8), hu41_prueba.resc(1), 'Solo con privilegio de columna', NULL, hu41_prueba.op(80));
    IF r->>'codigo' <> 'OK' THEN RAISE EXCEPTION 'Con UPDATE (version) la RPC debe funcionar: %', r; END IF;
END $$;
RESET ROLE;
REVOKE UPDATE (version) ON public.incidentes FROM service_role;
SET LOCAL ROLE service_role;
DO $$
DECLARE
    r JSONB;
BEGIN
    r := hu41_prueba.agregar(hu41_prueba.inc(8), hu41_prueba.resc(1), 'Sin ningún UPDATE', NULL, hu41_prueba.op(81));
    IF r->>'codigo' NOT ILIKE 'permission denied%' THEN
        RAISE EXCEPTION 'Sin UPDATE sobre incidentes, FOR SHARE debe dar permission denied: %', r;
    END IF;
    RAISE NOTICE 'OK 13: con UPDATE (version) la RPC funciona; sin ningún UPDATE sobre incidentes da insufficient_privilege (dependencia documentada)';
END $$;
-- Se restaura el estado de los privilegios por defecto para los casos siguientes.
RESET ROLE;
GRANT UPDATE, DELETE ON public.incidentes TO service_role;
GRANT UPDATE (version) ON public.incidentes TO service_role;
SET LOCAL ROLE service_role;

-- 14) Cierre de HU-42 simulado: la función interna anexa el cierre en la misma transacción.
RESET ROLE;
DO $$
DECLARE
    r JSONB; v_ultimo TEXT;
BEGIN
    PERFORM 1 FROM public.incidentes WHERE id = hu41_prueba.inc(4) FOR UPDATE;
    r := hu41_prueba.interna(hu41_prueba.inc(4), hu41_prueba.resc(1), 'cierre', 'Incidente cerrado sin novedad', NULL, hu41_prueba.op(90));
    IF r->>'codigo' <> 'OK' OR r->'resultado'->>'tipo' <> 'cierre' THEN RAISE EXCEPTION 'Cierre: %', r; END IF;
    UPDATE public.incidentes SET estado = 'cerrado', cerrado_en = now(), version = version + 1
        WHERE id = hu41_prueba.inc(4);
    SELECT tipo INTO v_ultimo FROM public.entradas_bitacora_incidente
        WHERE incidente_id = hu41_prueba.inc(4) ORDER BY registrada_en DESC, secuencia DESC LIMIT 1;
    IF v_ultimo <> 'cierre' THEN RAISE EXCEPTION 'El cierre debe ser la última entrada, es %', v_ultimo; END IF;
    -- Un segundo cierre del mismo incidente lo rechaza el índice único parcial.
    r := hu41_prueba.interna(hu41_prueba.inc(4), hu41_prueba.resc(1), 'cierre', 'Otro cierre', NULL, hu41_prueba.op(91));
    IF r->>'codigo' <> 'OPERACION_YA_REGISTRADA' THEN RAISE EXCEPTION 'Segundo cierre: %', r; END IF;
    -- El reintento del mismo cierre es idempotente.
    r := hu41_prueba.interna(hu41_prueba.inc(4), hu41_prueba.resc(1), 'cierre', 'Incidente cerrado sin novedad', NULL, hu41_prueba.op(90));
    IF r->>'codigo' <> 'OK' OR (r->'resultado'->>'repetido')::BOOLEAN IS NOT TRUE THEN
        RAISE EXCEPTION 'Reintento del cierre: %', r;
    END IF;
    -- La RPC pública ya no escribe en el incidente cerrado.
    r := hu41_prueba.agregar(hu41_prueba.inc(4), hu41_prueba.resc(1), 'Tarde', NULL, hu41_prueba.op(92));
    IF r->>'codigo' <> 'INCIDENTE_CERRADO' THEN RAISE EXCEPTION 'Tras el cierre: %', r; END IF;
    IF (SELECT count(*) FROM public.entradas_bitacora_incidente WHERE incidente_id = hu41_prueba.inc(4) AND tipo = 'cierre') <> 1 THEN
        RAISE EXCEPTION 'Debe haber un solo cierre';
    END IF;
    RAISE NOTICE 'OK 14: la interna anexa el cierre junto al UPDATE a cerrado, un segundo cierre da OPERACION_YA_REGISTRADA y la RPC pública da INCIDENTE_CERRADO';
END $$;

-- 15) Cascada del ARCO y RESTRICT del autor.
DO $$
DECLARE
    r JSONB;
BEGIN
    -- R3 es autor de una entrada (vía función interna) pero no responsable de ningún incidente.
    r := hu41_prueba.interna(hu41_prueba.inc(5), hu41_prueba.resc(3), 'nota', 'Nota de R3', NULL, hu41_prueba.op(95));
    IF r->>'codigo' <> 'OK' THEN RAISE EXCEPTION 'Nota de R3: %', r; END IF;
    BEGIN
        DELETE FROM public.perfiles_rescatista WHERE usuario_id = hu41_prueba.resc(3);
        RAISE EXCEPTION 'RESTRICT no impidió borrar al autor';
    -- RESTRICT o NO ACTION dan 23001 o 23503 según la versión; que sea RESTRICT lo comprueba
    -- el caso 1 (confdeltype = 'r'). Aquí se verifica que el borrado se impide.
    EXCEPTION WHEN restrict_violation OR foreign_key_violation THEN NULL;
    END;
    -- El incidente 5 tiene una corrección: borrar la expedición arrastra incidente y entradas.
    DELETE FROM public.expediciones WHERE id = 'e0000000-0000-4000-8000-000000000005';
    IF EXISTS (SELECT 1 FROM public.incidentes WHERE id = hu41_prueba.inc(5))
       OR EXISTS (SELECT 1 FROM public.entradas_bitacora_incidente WHERE incidente_id = hu41_prueba.inc(5)) THEN
        RAISE EXCEPTION 'La cascada no eliminó el incidente y sus entradas';
    END IF;
    RAISE NOTICE 'OK 15: borrar la expedición arrastra incidente y entradas (con una corrección); borrar el perfil del autor queda restringido';
END $$;

-- 16) Registro de la migración.
DO $$
BEGIN
    IF to_regclass('public.treksafe_migraciones') IS NULL THEN
        RAISE EXCEPTION 'Falta treksafe_migraciones (aplicar 000 antes)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.treksafe_migraciones
        WHERE version = '019' AND nombre = 'hu41_bitacora_incidente' AND hu = 'HU-41') THEN
        RAISE EXCEPTION '019 no quedó registrada';
    END IF;
    RAISE NOTICE 'OK 16: la 019 quedó registrada en treksafe_migraciones';
END $$;

ROLLBACK;

-- Solo PostgreSQL local desechable; todos los datos de prueba se revierten (ROLLBACK final).
-- Requiere: los roles anon, authenticated y service_role con los privilegios por defecto
-- de Supabase, el esquema base, las migraciones 000 a 018, la 019 de HU-41, la 022 a la 024 de DEP-04 y la 021 aplicadas.
-- Cubre proponer, aceptar, rechazar y cancelar el relevo (casos 1 a 23).
-- Se ejecuta con backend/scripts/test-hu40-postgres.mjs, que prepara ese entorno. Cada caso
-- imprime un aviso "OK n: ..."; el primero que falla aborta el archivo con su mensaje.
-- Las carreras reales entre sesiones se prueban en el script .mjs, no aquí.
BEGIN;

CREATE SCHEMA hu40_prueba;
GRANT USAGE ON SCHEMA hu40_prueba TO service_role;

-- Identificadores deterministas: usuarios, expediciones y operaciones.
CREATE FUNCTION hu40_prueba.u(n INT) RETURNS UUID LANGUAGE sql IMMUTABLE AS
$$ SELECT ('a0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
CREATE FUNCTION hu40_prueba.e(n INT) RETURNS UUID LANGUAGE sql IMMUTABLE AS
$$ SELECT ('e0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
CREATE FUNCTION hu40_prueba.op(n INT) RETURNS UUID LANGUAGE sql IMMUTABLE AS
$$ SELECT ('c0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
GRANT EXECUTE ON FUNCTION hu40_prueba.u(INT), hu40_prueba.e(INT), hu40_prueba.op(INT) TO service_role;

-- Ejecutan la RPC como el rol actual y devuelven {codigo, detalle, resultado}.
CREATE FUNCTION hu40_prueba.proponer(p_exp UUID, p_actor UUID, p_dest UUID, p_motivo TEXT,
                                     p_version INT, p_op UUID)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE v_detalle TEXT; v_res JSONB;
BEGIN
    BEGIN
        v_res := public.treksafe_proponer_relevo(p_exp, p_actor, p_dest, p_motivo, p_version, p_op);
        RETURN jsonb_build_object('codigo', 'OK', 'resultado', v_res);
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_detalle = PG_EXCEPTION_DETAIL;
        RETURN jsonb_build_object('codigo', SQLERRM, 'detalle', v_detalle);
    END;
END; $$;

CREATE FUNCTION hu40_prueba.aceptar(p_exp UUID, p_actor UUID, p_relevo UUID, p_op UUID)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE v_detalle TEXT; v_res JSONB;
BEGIN
    BEGIN
        v_res := public.treksafe_aceptar_relevo(p_exp, p_actor, p_relevo, p_op);
        RETURN jsonb_build_object('codigo', 'OK', 'resultado', v_res);
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_detalle = PG_EXCEPTION_DETAIL;
        RETURN jsonb_build_object('codigo', SQLERRM, 'detalle', v_detalle);
    END;
END; $$;

CREATE FUNCTION hu40_prueba.rechazar(p_exp UUID, p_actor UUID, p_relevo UUID, p_op UUID)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE v_detalle TEXT; v_res JSONB;
BEGIN
    BEGIN
        v_res := public.treksafe_rechazar_relevo(p_exp, p_actor, p_relevo, p_op);
        RETURN jsonb_build_object('codigo', 'OK', 'resultado', v_res);
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_detalle = PG_EXCEPTION_DETAIL;
        RETURN jsonb_build_object('codigo', SQLERRM, 'detalle', v_detalle);
    END;
END; $$;

CREATE FUNCTION hu40_prueba.cancelar(p_exp UUID, p_actor UUID, p_relevo UUID, p_op UUID)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE v_detalle TEXT; v_res JSONB;
BEGIN
    BEGIN
        v_res := public.treksafe_cancelar_relevo(p_exp, p_actor, p_relevo, p_op);
        RETURN jsonb_build_object('codigo', 'OK', 'resultado', v_res);
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_detalle = PG_EXCEPTION_DETAIL;
        RETURN jsonb_build_object('codigo', SQLERRM, 'detalle', v_detalle);
    END;
END; $$;

-- Comprueba el código y devuelve la respuesta completa.
CREATE FUNCTION hu40_prueba.espera(r JSONB, p_codigo TEXT) RETURNS JSONB LANGUAGE plpgsql AS $$
BEGIN
    IF r->>'codigo' IS DISTINCT FROM p_codigo THEN
        RAISE EXCEPTION 'Esperaba % y llegó %', p_codigo, r;
    END IF;
    RETURN r;
END; $$;

-- Id del relevo creado con una operación de propuesta.
CREATE FUNCTION hu40_prueba.relevo(p_op UUID) RETURNS UUID LANGUAGE sql STABLE AS
$$ SELECT id FROM public.relevos_coordinacion WHERE operacion_id = p_op $$;

GRANT EXECUTE ON FUNCTION
    hu40_prueba.proponer(UUID, UUID, UUID, TEXT, INT, UUID),
    hu40_prueba.aceptar(UUID, UUID, UUID, UUID),
    hu40_prueba.rechazar(UUID, UUID, UUID, UUID),
    hu40_prueba.cancelar(UUID, UUID, UUID, UUID),
    hu40_prueba.espera(JSONB, TEXT),
    hu40_prueba.relevo(UUID)
TO service_role;

-- Datos de prueba (superusuario). u(1)=A, u(2)=B, u(3)=C son rescatistas validados;
-- u(4) es un usuario rescatista sin perfil; senderista b0...01.
INSERT INTO public.usuarios (id, correo_electronico, hash_contrasena, rol) VALUES
    (hu40_prueba.u(1), 'resc1@example.invalid', 'fixture', 'rescatista'),
    (hu40_prueba.u(2), 'resc2@example.invalid', 'fixture', 'rescatista'),
    (hu40_prueba.u(3), 'resc3@example.invalid', 'fixture', 'rescatista'),
    (hu40_prueba.u(4), 'resc4@example.invalid', 'fixture', 'rescatista'),
    ('b0000000-0000-4000-8000-000000000001', 'send1@example.invalid', 'fixture', 'senderista');
INSERT INTO public.perfiles_senderista (usuario_id, nombre_completo, telefono, id_documento)
    VALUES ('b0000000-0000-4000-8000-000000000001', 'Senderista Ficticio', '999999999', '00000001');
INSERT INTO public.registros_institucionales_rescatista
    (institucion, numero_credencial, nombre_completo, fecha_nacimiento) VALUES
    ('AGMP', 'CRED-1', 'Rescatista Uno', '1990-01-01'),
    ('AGMP', 'CRED-2', 'Rescatista Dos', '1991-02-02'),
    ('AGMP', 'CRED-3', 'Rescatista Tres', '1992-03-03');
INSERT INTO public.perfiles_rescatista (usuario_id, numero_credencial, nombre_completo, fecha_nacimiento) VALUES
    (hu40_prueba.u(1), 'CRED-1', 'Rescatista Uno', '1990-01-01'),
    (hu40_prueba.u(2), 'CRED-2', 'Rescatista Dos', '1991-02-02'),
    (hu40_prueba.u(3), 'CRED-3', 'Rescatista Tres', '1992-03-03');

-- Un propietario por expedición: compatible con DEP-04 (022), que impide dos planes
-- bloqueantes de un mismo senderista. No cambia los actores del relevo.
INSERT INTO public.usuarios (id, correo_electronico, hash_contrasena, rol)
SELECT ('b0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'send' || n || '@example.invalid', 'fixture', 'senderista'
FROM generate_series(2, 8) AS n;
INSERT INTO public.perfiles_senderista (usuario_id, nombre_completo, telefono, id_documento)
SELECT ('b0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'Senderista Ficticio', '999999999', lpad(n::text, 8, '0')
FROM generate_series(2, 8) AS n;

INSERT INTO public.expediciones
    (id, senderista_id, lugar_inicio, lugar_fin, hora_inicio, hora_retorno_estimada, estado)
SELECT hu40_prueba.e(n), ('b0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'Inicio', 'Destino',
       now() - interval '5 hours', now() - interval '2 hours', 'alerta'::public.estado_expedicion_enum
FROM generate_series(1, 8) AS n;

-- Incidentes (contrato de HU-39), insertados directamente:
--   e1: responsable A · e2: sin incidente · e3: cerrado · e4: responsable B
--   e5: A (se cierra tras proponer) · e6: A (versión que cambia) · e7: A (cascada)
--   e8: A (rechazar y cancelar)
INSERT INTO public.incidentes (expedicion_id, responsable_id, estado, cerrado_en, operacion_id) VALUES
    (hu40_prueba.e(1), hu40_prueba.u(1), 'abierto', NULL, hu40_prueba.op(901)),
    (hu40_prueba.e(3), hu40_prueba.u(1), 'cerrado', now(), hu40_prueba.op(903)),
    (hu40_prueba.e(4), hu40_prueba.u(2), 'abierto', NULL, hu40_prueba.op(904)),
    (hu40_prueba.e(5), hu40_prueba.u(1), 'abierto', NULL, hu40_prueba.op(905)),
    (hu40_prueba.e(6), hu40_prueba.u(1), 'abierto', NULL, hu40_prueba.op(906)),
    (hu40_prueba.e(7), hu40_prueba.u(1), 'abierto', NULL, hu40_prueba.op(907)),
    (hu40_prueba.e(8), hu40_prueba.u(1), 'abierto', NULL, hu40_prueba.op(908));

-- 1) Esquema, permisos y funciones (superusuario).
DO $$
DECLARE
    v_tabla TEXT;
    v_funcion REGPROCEDURE;
    v_rol TEXT;
    v_columnas TEXT;
    v_col TEXT;
BEGIN
    FOREACH v_tabla IN ARRAY ARRAY['relevos_coordinacion', 'transferencias_coordinacion'] LOOP
        IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || v_tabla)::REGCLASS) THEN
            RAISE EXCEPTION '% debe tener RLS activo', v_tabla;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
            AND tablename = v_tabla AND policyname = 'treksafe_deny_anon_authenticated') THEN
            RAISE EXCEPTION 'Falta la política de denegación en %', v_tabla;
        END IF;
        FOREACH v_rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
            IF has_any_column_privilege(v_rol, 'public.' || v_tabla, 'SELECT, INSERT, UPDATE, REFERENCES') THEN
                RAISE EXCEPTION '% tiene privilegios sobre %', v_rol, v_tabla;
            END IF;
        END LOOP;
        IF has_table_privilege('service_role', 'public.' || v_tabla, 'DELETE')
           OR has_table_privilege('service_role', 'public.' || v_tabla, 'TRUNCATE') THEN
            RAISE EXCEPTION 'service_role no debe poder borrar en %', v_tabla;
        END IF;
    END LOOP;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
        AND indexname = 'uq_relevo_pendiente_por_incidente'
        AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%pendiente%') THEN
        RAISE EXCEPTION 'Falta el índice único parcial uq_relevo_pendiente_por_incidente';
    END IF;

    -- Permisos de service_role sobre incidentes: UPDATE solo de tres columnas.
    IF has_table_privilege('service_role', 'public.incidentes', 'UPDATE') THEN
        RAISE EXCEPTION 'service_role no debe tener UPDATE de tabla completa sobre incidentes';
    END IF;
    IF has_table_privilege('service_role', 'public.incidentes', 'DELETE')
       OR has_table_privilege('service_role', 'public.incidentes', 'TRUNCATE') THEN
        RAISE EXCEPTION 'service_role no debe poder borrar incidentes';
    END IF;
    FOREACH v_col IN ARRAY ARRAY['responsable_id', 'version', 'asumido_en'] LOOP
        IF NOT has_column_privilege('service_role', 'public.incidentes', v_col, 'UPDATE') THEN
            RAISE EXCEPTION 'service_role debe poder actualizar incidentes.%', v_col;
        END IF;
    END LOOP;
    FOREACH v_col IN ARRAY ARRAY['id', 'expedicion_id', 'estado', 'abierto_en', 'cerrado_en', 'operacion_id'] LOOP
        IF has_column_privilege('service_role', 'public.incidentes', v_col, 'UPDATE') THEN
            RAISE EXCEPTION 'service_role no debe poder actualizar incidentes.%', v_col;
        END IF;
    END LOOP;
    -- Relevos: UPDATE solo de las cuatro columnas de la resolución.
    FOREACH v_col IN ARRAY ARRAY['estado', 'resuelto_en', 'resuelto_por_id', 'operacion_resolucion_id'] LOOP
        IF NOT has_column_privilege('service_role', 'public.relevos_coordinacion', v_col, 'UPDATE') THEN
            RAISE EXCEPTION 'service_role debe poder actualizar relevos_coordinacion.%', v_col;
        END IF;
    END LOOP;
    FOREACH v_col IN ARRAY ARRAY['id', 'incidente_id', 'responsable_anterior_id', 'destinatario_id', 'motivo',
                                 'solicitado_en', 'version_incidente', 'operacion_id'] LOOP
        IF has_column_privilege('service_role', 'public.relevos_coordinacion', v_col, 'UPDATE') THEN
            RAISE EXCEPTION 'service_role no debe poder actualizar relevos_coordinacion.%', v_col;
        END IF;
    END LOOP;
    IF NOT has_table_privilege('service_role', 'public.incidentes', 'SELECT')
       OR NOT has_table_privilege('service_role', 'public.incidentes', 'INSERT') THEN
        RAISE EXCEPTION 'service_role conserva SELECT e INSERT sobre incidentes (HU-39)';
    END IF;
    FOREACH v_rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF has_any_column_privilege(v_rol, 'public.incidentes', 'SELECT, INSERT, UPDATE, REFERENCES') THEN
            RAISE EXCEPTION '% tiene privilegios sobre incidentes', v_rol;
        END IF;
    END LOOP;

    FOREACH v_funcion IN ARRAY ARRAY[
        'public.treksafe_proponer_relevo(uuid,uuid,uuid,text,integer,uuid)'::REGPROCEDURE,
        'public.treksafe_aceptar_relevo(uuid,uuid,uuid,uuid)'::REGPROCEDURE,
        'public.treksafe_rechazar_relevo(uuid,uuid,uuid,uuid)'::REGPROCEDURE,
        'public.treksafe_cancelar_relevo(uuid,uuid,uuid,uuid)'::REGPROCEDURE,
        'public.treksafe_resolver_relevo(uuid,uuid,uuid,uuid,text)'::REGPROCEDURE,
        'public.treksafe_resultado_relevo(public.incidentes,public.relevos_coordinacion,boolean)'::REGPROCEDURE,
        'public.treksafe_relevo_publico(public.relevos_coordinacion)'::REGPROCEDURE,
        'public.treksafe_transferencias_solo_anexado()'::REGPROCEDURE
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
    IF NOT has_function_privilege('service_role',
        'public.treksafe_proponer_relevo(uuid,uuid,uuid,text,integer,uuid)'::REGPROCEDURE, 'EXECUTE')
       OR NOT has_function_privilege('service_role',
        'public.treksafe_aceptar_relevo(uuid,uuid,uuid,uuid)'::REGPROCEDURE, 'EXECUTE')
       OR NOT has_function_privilege('service_role',
        'public.treksafe_rechazar_relevo(uuid,uuid,uuid,uuid)'::REGPROCEDURE, 'EXECUTE')
       OR NOT has_function_privilege('service_role',
        'public.treksafe_cancelar_relevo(uuid,uuid,uuid,uuid)'::REGPROCEDURE, 'EXECUTE')
       OR NOT has_function_privilege('service_role',
        'public.treksafe_resolver_relevo(uuid,uuid,uuid,uuid,text)'::REGPROCEDURE, 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role debe poder ejecutar las cuatro RPC y la función común';
    END IF;

    -- Sin datos médicos ni de otra índole: las tablas tienen exactamente estas columnas.
    SELECT string_agg(column_name, ',' ORDER BY column_name COLLATE "C") INTO v_columnas
    FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'relevos_coordinacion';
    IF v_columnas <> 'destinatario_id,estado,id,incidente_id,motivo,operacion_id,operacion_resolucion_id,responsable_anterior_id,resuelto_en,resuelto_por_id,solicitado_en,version_incidente' THEN
        RAISE EXCEPTION 'Columnas inesperadas en relevos_coordinacion: %', v_columnas;
    END IF;
    SELECT string_agg(column_name, ',' ORDER BY column_name COLLATE "C") INTO v_columnas
    FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'transferencias_coordinacion';
    IF v_columnas <> 'id,incidente_id,motivo,ocurrido_en,relevo_id,responsable_anterior_id,responsable_nuevo_id,version_anterior,version_nueva' THEN
        RAISE EXCEPTION 'Columnas inesperadas en transferencias_coordinacion: %', v_columnas;
    END IF;
    SELECT string_agg(column_name, ',' ORDER BY column_name COLLATE "C") INTO v_columnas
    FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'incidentes';
    IF v_columnas <> 'abierto_en,asumido_en,cerrado_en,estado,expedicion_id,id,operacion_id,responsable_id,version' THEN
        RAISE EXCEPTION 'incidentes no debe cambiar de columnas: %', v_columnas;
    END IF;
    RAISE NOTICE 'OK 1: RLS, índice único parcial, UPDATE por columna en incidentes y relevos, funciones SECURITY INVOKER con search_path vacío, sin columnas médicas';
END $$;

-- 2) anon y authenticated no leen, escriben ni ejecutan nada de HU-40.
DO $$
DECLARE
    v_rol TEXT;
BEGIN
    FOREACH v_rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        EXECUTE format('SET LOCAL ROLE %I', v_rol);
        BEGIN
            PERFORM count(*) FROM public.relevos_coordinacion;
            RESET ROLE;
            RAISE EXCEPTION '% pudo leer relevos_coordinacion', v_rol;
        EXCEPTION WHEN insufficient_privilege THEN RESET ROLE; END;
        EXECUTE format('SET LOCAL ROLE %I', v_rol);
        BEGIN
            PERFORM count(*) FROM public.transferencias_coordinacion;
            RESET ROLE;
            RAISE EXCEPTION '% pudo leer transferencias_coordinacion', v_rol;
        EXCEPTION WHEN insufficient_privilege THEN RESET ROLE; END;
        EXECUTE format('SET LOCAL ROLE %I', v_rol);
        BEGIN
            UPDATE public.incidentes SET responsable_id = hu40_prueba.u(2);
            RESET ROLE;
            RAISE EXCEPTION '% pudo cambiar el responsable', v_rol;
        EXCEPTION WHEN insufficient_privilege THEN RESET ROLE; END;
        EXECUTE format('SET LOCAL ROLE %I', v_rol);
        BEGIN
            PERFORM public.treksafe_proponer_relevo(hu40_prueba.e(1), hu40_prueba.u(1),
                hu40_prueba.u(2), 'x', 1, gen_random_uuid());
            RESET ROLE;
            RAISE EXCEPTION '% pudo proponer', v_rol;
        EXCEPTION WHEN insufficient_privilege THEN RESET ROLE; END;
        EXECUTE format('SET LOCAL ROLE %I', v_rol);
        BEGIN
            PERFORM public.treksafe_aceptar_relevo(hu40_prueba.e(1), hu40_prueba.u(2),
                gen_random_uuid(), gen_random_uuid());
            RESET ROLE;
            RAISE EXCEPTION '% pudo aceptar', v_rol;
        EXCEPTION WHEN insufficient_privilege THEN RESET ROLE; END;
        EXECUTE format('SET LOCAL ROLE %I', v_rol);
        BEGIN
            PERFORM public.treksafe_rechazar_relevo(hu40_prueba.e(1), hu40_prueba.u(2),
                gen_random_uuid(), gen_random_uuid());
            RESET ROLE;
            RAISE EXCEPTION '% pudo rechazar', v_rol;
        EXCEPTION WHEN insufficient_privilege THEN RESET ROLE; END;
        EXECUTE format('SET LOCAL ROLE %I', v_rol);
        BEGIN
            PERFORM public.treksafe_cancelar_relevo(hu40_prueba.e(1), hu40_prueba.u(1),
                gen_random_uuid(), gen_random_uuid());
            RESET ROLE;
            RAISE EXCEPTION '% pudo cancelar', v_rol;
        EXCEPTION WHEN insufficient_privilege THEN RESET ROLE; END;
        EXECUTE format('SET LOCAL ROLE %I', v_rol);
        BEGIN
            PERFORM public.treksafe_resolver_relevo(hu40_prueba.e(1), hu40_prueba.u(2),
                gen_random_uuid(), gen_random_uuid(), 'rechazado');
            RESET ROLE;
            RAISE EXCEPTION '% pudo resolver', v_rol;
        EXCEPTION WHEN insufficient_privilege THEN RESET ROLE; END;
    END LOOP;
    RAISE NOTICE 'OK 2: anon y authenticated no leen, escriben ni ejecutan';
END $$;

-- De aquí en adelante todo corre como service_role, igual que el backend.
SET LOCAL ROLE service_role;

-- 3) CA-01: el responsable propone a un rescatista validado; no cambia nada del caso (CA-02).
DO $$
DECLARE
    r JSONB; rel JSONB;
BEGIN
    r := hu40_prueba.espera(hu40_prueba.proponer(hu40_prueba.e(1), hu40_prueba.u(1),
        hu40_prueba.u(2), '  Cambio de turno  ', 1, hu40_prueba.op(1)), 'OK')->'resultado';
    rel := r->'relevo';
    IF (r->>'repetido')::BOOLEAN IS NOT FALSE
       OR r->>'estado' <> 'abierto' OR (r->>'version')::INT <> 1
       OR r->'responsable'->>'id' <> hu40_prueba.u(1)::TEXT
       OR rel->>'estado' <> 'pendiente'
       OR rel->'responsableAnterior'->>'id' <> hu40_prueba.u(1)::TEXT
       OR rel->'responsableAnterior'->>'nombreCompleto' <> 'Rescatista Uno'
       OR rel->'destinatario'->>'id' <> hu40_prueba.u(2)::TEXT
       OR rel->'destinatario'->>'nombreCompleto' <> 'Rescatista Dos'
       OR rel->>'motivo' <> 'Cambio de turno'
       OR rel->>'solicitadoEn' IS NULL OR rel->>'resueltoEn' IS NOT NULL
       OR rel->>'resueltoPorId' IS NOT NULL
       OR (rel->>'versionIncidente')::INT <> 1 THEN
        RAISE EXCEPTION 'Resultado inesperado: %', r;
    END IF;
    IF (SELECT array_agg(k ORDER BY k COLLATE "C") FROM jsonb_object_keys(rel) AS k)
       <> ARRAY['destinatario','estado','id','motivo','responsableAnterior','resueltoEn','resueltoPorId','solicitadoEn','versionIncidente'] THEN
        RAISE EXCEPTION 'El relevo debe tener exactamente estas claves: %', rel;
    END IF;
    -- CA-02: mientras está pendiente, el responsable anterior conserva el caso.
    IF NOT EXISTS (SELECT 1 FROM public.incidentes WHERE expedicion_id = hu40_prueba.e(1)
        AND responsable_id = hu40_prueba.u(1) AND version = 1) THEN
        RAISE EXCEPTION 'Proponer no debe cambiar el responsable ni la versión';
    END IF;
    IF (SELECT count(*) FROM public.relevos_coordinacion) <> 1
       OR (SELECT count(*) FROM public.transferencias_coordinacion) <> 0 THEN
        RAISE EXCEPTION 'Debe haber un relevo y ninguna transferencia';
    END IF;
    RAISE NOTICE 'OK 3: propone, queda pendiente, guarda ambos responsables, motivo y hora, y el responsable y la versión no cambian';
END $$;

-- 4) Idempotencia de la propuesta.
DO $$
DECLARE
    a JSONB; id1 UUID := hu40_prueba.relevo(hu40_prueba.op(1));
BEGIN
    a := hu40_prueba.espera(hu40_prueba.proponer(hu40_prueba.e(1), hu40_prueba.u(1),
        hu40_prueba.u(2), 'Cambio de turno', 1, hu40_prueba.op(1)), 'OK')->'resultado';
    IF (a->>'repetido')::BOOLEAN IS NOT TRUE OR (a->'relevo'->>'id')::UUID <> id1 THEN
        RAISE EXCEPTION 'La repetición debió devolver el mismo relevo: %', a;
    END IF;
    -- Otro actor o otra expedición con la misma operación: no se revela nada ajeno.
    PERFORM hu40_prueba.espera(hu40_prueba.proponer(hu40_prueba.e(1), hu40_prueba.u(2),
        hu40_prueba.u(3), 'x', 1, hu40_prueba.op(1)), 'INCIDENTE_NO_ENCONTRADO');
    PERFORM hu40_prueba.espera(hu40_prueba.proponer(hu40_prueba.e(4), hu40_prueba.u(1),
        hu40_prueba.u(3), 'x', 1, hu40_prueba.op(1)), 'INCIDENTE_NO_ENCONTRADO');
    IF (SELECT count(*) FROM public.relevos_coordinacion) <> 1 THEN
        RAISE EXCEPTION 'La repetición no debe crear otro relevo';
    END IF;
    RAISE NOTICE 'OK 4: repetición idempotente; operación ajena rechazada sin revelar nada';
END $$;

-- 5) Propuestas rechazadas: ninguna escribe nada.
DO $$
DECLARE
    v_largo TEXT := repeat('x', 281);
BEGIN
    PERFORM hu40_prueba.espera(hu40_prueba.proponer(hu40_prueba.e(2), hu40_prueba.u(1),
        hu40_prueba.u(2), 'm', 1, hu40_prueba.op(2)), 'INCIDENTE_NO_ENCONTRADO');
    PERFORM hu40_prueba.espera(hu40_prueba.proponer(hu40_prueba.e(3), hu40_prueba.u(1),
        hu40_prueba.u(2), 'm', 1, hu40_prueba.op(2)), 'INCIDENTE_CERRADO');
    PERFORM hu40_prueba.espera(hu40_prueba.proponer(hu40_prueba.e(4), hu40_prueba.u(4),
        hu40_prueba.u(3), 'm', 1, hu40_prueba.op(2)), 'NO_ES_RESCATISTA');
    PERFORM hu40_prueba.espera(hu40_prueba.proponer(hu40_prueba.e(4), 'b0000000-0000-4000-8000-000000000001',
        hu40_prueba.u(3), 'm', 1, hu40_prueba.op(2)), 'NO_ES_RESCATISTA');
    -- Actor incorrecto: rescatista validado que no es el responsable.
    PERFORM hu40_prueba.espera(hu40_prueba.proponer(hu40_prueba.e(4), hu40_prueba.u(1),
        hu40_prueba.u(3), 'm', 1, hu40_prueba.op(2)), 'NO_ES_RESPONSABLE');
    PERFORM hu40_prueba.espera(hu40_prueba.proponer(hu40_prueba.e(4), hu40_prueba.u(3),
        hu40_prueba.u(1), 'm', 1, hu40_prueba.op(2)), 'NO_ES_RESPONSABLE');
    PERFORM hu40_prueba.espera(hu40_prueba.proponer(hu40_prueba.e(4), hu40_prueba.u(2),
        hu40_prueba.u(2), 'm', 1, hu40_prueba.op(2)), 'DESTINATARIO_INVALIDO');
    PERFORM hu40_prueba.espera(hu40_prueba.proponer(hu40_prueba.e(4), hu40_prueba.u(2),
        hu40_prueba.u(4), 'm', 1, hu40_prueba.op(2)), 'DESTINATARIO_NO_VALIDADO');
    PERFORM hu40_prueba.espera(hu40_prueba.proponer(hu40_prueba.e(4), hu40_prueba.u(2),
        'b0000000-0000-4000-8000-000000000001', 'm', 1, hu40_prueba.op(2)), 'DESTINATARIO_NO_VALIDADO');
    PERFORM hu40_prueba.espera(hu40_prueba.proponer(hu40_prueba.e(4), hu40_prueba.u(2),
        hu40_prueba.u(3), 'm', 5, hu40_prueba.op(2)), 'VERSION_DESACTUALIZADA');
    IF ((hu40_prueba.proponer(hu40_prueba.e(4), hu40_prueba.u(2), hu40_prueba.u(3), 'm', 5,
            hu40_prueba.op(2))->>'detalle')::JSONB->>'versionActual') <> '1' THEN
        RAISE EXCEPTION 'DETAIL debe llevar versionActual';
    END IF;
    PERFORM hu40_prueba.espera(hu40_prueba.proponer(hu40_prueba.e(4), hu40_prueba.u(2),
        hu40_prueba.u(3), '', 1, hu40_prueba.op(2)), 'DATOS_INVALIDOS');
    PERFORM hu40_prueba.espera(hu40_prueba.proponer(hu40_prueba.e(4), hu40_prueba.u(2),
        hu40_prueba.u(3), '   ', 1, hu40_prueba.op(2)), 'DATOS_INVALIDOS');
    PERFORM hu40_prueba.espera(hu40_prueba.proponer(hu40_prueba.e(4), hu40_prueba.u(2),
        hu40_prueba.u(3), v_largo, 1, hu40_prueba.op(2)), 'DATOS_INVALIDOS');
    PERFORM hu40_prueba.espera(hu40_prueba.proponer(hu40_prueba.e(4), hu40_prueba.u(2),
        hu40_prueba.u(3), NULL, 1, hu40_prueba.op(2)), 'DATOS_INVALIDOS');
    PERFORM hu40_prueba.espera(hu40_prueba.proponer(hu40_prueba.e(4), hu40_prueba.u(2),
        hu40_prueba.u(3), 'm', 0, hu40_prueba.op(2)), 'DATOS_INVALIDOS');
    PERFORM hu40_prueba.espera(hu40_prueba.proponer(hu40_prueba.e(4), hu40_prueba.u(2),
        hu40_prueba.u(3), 'm', 1, NULL), 'DATOS_INVALIDOS');
    -- Operación ya usada por una asunción (incidentes) o por un evento del plan.
    PERFORM hu40_prueba.espera(hu40_prueba.proponer(hu40_prueba.e(4), hu40_prueba.u(2),
        hu40_prueba.u(3), 'm', 1, hu40_prueba.op(901)), 'DATOS_INVALIDOS');
    INSERT INTO public.eventos_plan (expedicion_id, senderista_id, tipo, actor_id, version_resultante, cambios, operacion_id)
    VALUES (hu40_prueba.e(2), 'b0000000-0000-4000-8000-000000000001', 'EDITADA',
            'b0000000-0000-4000-8000-000000000001', 2, '{}'::jsonb, hu40_prueba.op(950));
    PERFORM hu40_prueba.espera(hu40_prueba.proponer(hu40_prueba.e(4), hu40_prueba.u(2),
        hu40_prueba.u(3), 'm', 1, hu40_prueba.op(950)), 'DATOS_INVALIDOS');
    IF (SELECT count(*) FROM public.relevos_coordinacion WHERE incidente_id IN
        (SELECT id FROM public.incidentes WHERE expedicion_id IN (hu40_prueba.e(2), hu40_prueba.e(3), hu40_prueba.e(4)))) <> 0 THEN
        RAISE EXCEPTION 'Ninguna propuesta rechazada debe escribir';
    END IF;
    RAISE NOTICE 'OK 5: rechaza incidente inexistente o cerrado, actor sin perfil o que no es responsable, destinatario igual o no validado, versión desactualizada, datos inválidos y operaciones ajenas';
END $$;

-- 6) CA-03: no se admiten relevos simultáneos.
DO $$
DECLARE
    r JSONB; d JSONB;
BEGIN
    r := hu40_prueba.espera(hu40_prueba.proponer(hu40_prueba.e(1), hu40_prueba.u(1),
        hu40_prueba.u(3), 'Otro', 1, hu40_prueba.op(2)), 'RELEVO_PENDIENTE');
    d := (r->>'detalle')::JSONB;
    IF (d->>'relevoId')::UUID <> hu40_prueba.relevo(hu40_prueba.op(1))
       OR d->>'destinatarioId' <> hu40_prueba.u(2)::TEXT
       OR d->>'nombreDestinatario' <> 'Rescatista Dos'
       OR d->>'solicitadoEn' IS NULL OR d ? 'motivo' THEN
        RAISE EXCEPTION 'DETAIL del pendiente inesperado (sin motivo): %', r;
    END IF;
    IF (SELECT count(*) FROM public.relevos_coordinacion) <> 1 THEN
        RAISE EXCEPTION 'No debe crearse un segundo relevo';
    END IF;
    RAISE NOTICE 'OK 6: segundo relevo rechazado con RELEVO_PENDIENTE y el relevo vigente, sin motivo';
END $$;

-- 7) El índice único parcial lo impide aunque otra vía escriba sin la RPC.
DO $$
DECLARE
    v_constraint TEXT;
BEGIN
    BEGIN
        INSERT INTO public.relevos_coordinacion
            (incidente_id, responsable_anterior_id, destinatario_id, motivo, version_incidente, operacion_id)
        SELECT id, hu40_prueba.u(1), hu40_prueba.u(3), 'directo', 1, hu40_prueba.op(990)
        FROM public.incidentes WHERE expedicion_id = hu40_prueba.e(1);
        RAISE EXCEPTION 'El segundo pendiente debió fallar';
    EXCEPTION WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
        IF v_constraint <> 'uq_relevo_pendiente_por_incidente' THEN
            RAISE EXCEPTION 'Falló otra restricción: %', v_constraint;
        END IF;
    END;
    RAISE NOTICE 'OK 7: uq_relevo_pendiente_por_incidente impide el segundo pendiente';
END $$;

-- 8) Aceptaciones rechazadas (el relevo de e1, de A a B, sigue pendiente).
DO $$
DECLARE
    v_relevo UUID := hu40_prueba.relevo(hu40_prueba.op(1));
BEGIN
    -- Actor incorrecto: un tercero y el propio responsable anterior.
    PERFORM hu40_prueba.espera(hu40_prueba.aceptar(hu40_prueba.e(1), hu40_prueba.u(3), v_relevo, hu40_prueba.op(10)), 'NO_ES_DESTINATARIO');
    PERFORM hu40_prueba.espera(hu40_prueba.aceptar(hu40_prueba.e(1), hu40_prueba.u(1), v_relevo, hu40_prueba.op(10)), 'NO_ES_DESTINATARIO');
    PERFORM hu40_prueba.espera(hu40_prueba.aceptar(hu40_prueba.e(1), hu40_prueba.u(4), v_relevo, hu40_prueba.op(10)), 'NO_ES_RESCATISTA');
    PERFORM hu40_prueba.espera(hu40_prueba.aceptar(hu40_prueba.e(1), hu40_prueba.u(2), gen_random_uuid(), hu40_prueba.op(10)), 'RELEVO_NO_ENCONTRADO');
    PERFORM hu40_prueba.espera(hu40_prueba.aceptar(hu40_prueba.e(4), hu40_prueba.u(2), v_relevo, hu40_prueba.op(10)), 'RELEVO_NO_ENCONTRADO');
    PERFORM hu40_prueba.espera(hu40_prueba.aceptar(hu40_prueba.e(1), hu40_prueba.u(2), v_relevo, NULL), 'DATOS_INVALIDOS');
    -- La operación de la propuesta o de una asunción no sirve como operación de aceptación.
    PERFORM hu40_prueba.espera(hu40_prueba.aceptar(hu40_prueba.e(1), hu40_prueba.u(2), v_relevo, hu40_prueba.op(1)), 'DATOS_INVALIDOS');
    PERFORM hu40_prueba.espera(hu40_prueba.aceptar(hu40_prueba.e(1), hu40_prueba.u(2), v_relevo, hu40_prueba.op(901)), 'DATOS_INVALIDOS');
    IF NOT EXISTS (SELECT 1 FROM public.relevos_coordinacion WHERE id = v_relevo AND estado = 'pendiente')
       OR NOT EXISTS (SELECT 1 FROM public.incidentes WHERE expedicion_id = hu40_prueba.e(1)
                      AND responsable_id = hu40_prueba.u(1) AND version = 1)
       OR (SELECT count(*) FROM public.transferencias_coordinacion) <> 0 THEN
        RAISE EXCEPTION 'Una aceptación rechazada no debe cambiar nada';
    END IF;
    RAISE NOTICE 'OK 8: rechaza al actor incorrecto, relevos inexistentes o de otra expedición y operaciones ajenas, sin cambiar nada';
END $$;

-- 9) CA-02: al aceptar se aplica el relevo, todo junto.
DO $$
DECLARE
    r JSONB; v_relevo UUID := hu40_prueba.relevo(hu40_prueba.op(1)); t RECORD;
BEGIN
    r := hu40_prueba.espera(hu40_prueba.aceptar(hu40_prueba.e(1), hu40_prueba.u(2), v_relevo, hu40_prueba.op(10)), 'OK')->'resultado';
    IF (r->>'repetido')::BOOLEAN IS NOT FALSE
       OR r->'responsable'->>'id' <> hu40_prueba.u(2)::TEXT
       OR r->'responsable'->>'nombreCompleto' <> 'Rescatista Dos'
       OR (r->>'version')::INT <> 2
       OR r->'relevo'->>'estado' <> 'aceptado'
       OR r->'relevo'->>'resueltoEn' IS NULL
       OR r->'relevo'->>'resueltoPorId' <> hu40_prueba.u(2)::TEXT
       OR r->>'asumidoEn' <> r->'relevo'->>'resueltoEn' THEN
        RAISE EXCEPTION 'Resultado inesperado: %', r;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.incidentes WHERE expedicion_id = hu40_prueba.e(1)
        AND responsable_id = hu40_prueba.u(2) AND version = 2 AND estado = 'abierto') THEN
        RAISE EXCEPTION 'El incidente debe pasar a B con la versión 2';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.relevos_coordinacion WHERE id = v_relevo AND estado = 'aceptado'
        AND operacion_resolucion_id = hu40_prueba.op(10) AND resuelto_en IS NOT NULL
        AND resuelto_por_id = hu40_prueba.u(2)) THEN
        RAISE EXCEPTION 'El relevo debe quedar aceptado con su operación, quién lo aceptó y hora';
    END IF;
    SELECT * INTO t FROM public.transferencias_coordinacion;
    IF (SELECT count(*) FROM public.transferencias_coordinacion) <> 1
       OR t.relevo_id <> v_relevo OR t.responsable_anterior_id <> hu40_prueba.u(1)
       OR t.responsable_nuevo_id <> hu40_prueba.u(2) OR t.motivo <> 'Cambio de turno'
       OR t.version_anterior <> 1 OR t.version_nueva <> 2 OR t.ocurrido_en IS NULL
       OR t.incidente_id <> (SELECT id FROM public.incidentes WHERE expedicion_id = hu40_prueba.e(1)) THEN
        RAISE EXCEPTION 'Transferencia inesperada: %', to_jsonb(t);
    END IF;
    IF (SELECT asumido_en FROM public.incidentes WHERE expedicion_id = hu40_prueba.e(1)) <> t.ocurrido_en THEN
        RAISE EXCEPTION 'asumido_en debe ser la hora del relevo';
    END IF;
    RAISE NOTICE 'OK 9: aceptar pasa el responsable al destinatario, sube la versión, resuelve el relevo, fija asumido_en y registra la transferencia';
END $$;

-- 10) Aceptar dos veces.
DO $$
DECLARE
    a JSONB; v_relevo UUID := hu40_prueba.relevo(hu40_prueba.op(1));
BEGIN
    a := hu40_prueba.espera(hu40_prueba.aceptar(hu40_prueba.e(1), hu40_prueba.u(2), v_relevo, hu40_prueba.op(10)), 'OK')->'resultado';
    IF (a->>'repetido')::BOOLEAN IS NOT TRUE OR (a->>'version')::INT <> 2 THEN
        RAISE EXCEPTION 'La misma operación debió ser una repetición segura: %', a;
    END IF;
    IF ((hu40_prueba.espera(hu40_prueba.aceptar(hu40_prueba.e(1), hu40_prueba.u(2), v_relevo, hu40_prueba.op(11)),
            'RELEVO_YA_RESUELTO')->>'detalle')::JSONB->>'estado') <> 'aceptado' THEN
        RAISE EXCEPTION 'RELEVO_YA_RESUELTO debe llevar el estado aceptado';
    END IF;
    -- La operación de aceptación vale solo para su destinatario y su relevo.
    PERFORM hu40_prueba.espera(hu40_prueba.aceptar(hu40_prueba.e(1), hu40_prueba.u(3), v_relevo, hu40_prueba.op(10)), 'RELEVO_NO_ENCONTRADO');
    -- Un tercero sobre un relevo ya resuelto no averigua su estado.
    PERFORM hu40_prueba.espera(hu40_prueba.aceptar(hu40_prueba.e(1), hu40_prueba.u(3), v_relevo, hu40_prueba.op(12)), 'NO_ES_DESTINATARIO');
    IF (SELECT count(*) FROM public.transferencias_coordinacion) <> 1
       OR NOT EXISTS (SELECT 1 FROM public.incidentes WHERE expedicion_id = hu40_prueba.e(1) AND version = 2) THEN
        RAISE EXCEPTION 'Aceptar de nuevo no debe duplicar la transferencia ni subir la versión';
    END IF;
    RAISE NOTICE 'OK 10: aceptar dos veces: misma operación repite, otra recibe RELEVO_YA_RESUELTO, sin duplicar la transferencia';
END $$;

-- 11) Tras el relevo manda el nuevo responsable; la versión se controla al proponer.
DO $$
DECLARE
    r JSONB;
BEGIN
    PERFORM hu40_prueba.espera(hu40_prueba.proponer(hu40_prueba.e(1), hu40_prueba.u(1),
        hu40_prueba.u(3), 'm', 2, hu40_prueba.op(20)), 'NO_ES_RESPONSABLE');
    r := hu40_prueba.espera(hu40_prueba.proponer(hu40_prueba.e(1), hu40_prueba.u(2),
        hu40_prueba.u(3), 'm', 1, hu40_prueba.op(20)), 'VERSION_DESACTUALIZADA');
    IF ((r->>'detalle')::JSONB->>'versionActual') <> '2' THEN
        RAISE EXCEPTION 'versionActual debe ser 2: %', r;
    END IF;
    r := hu40_prueba.espera(hu40_prueba.proponer(hu40_prueba.e(1), hu40_prueba.u(2),
        hu40_prueba.u(3), 'Segundo relevo', 2, hu40_prueba.op(20)), 'OK')->'resultado';
    IF (r->'relevo'->>'versionIncidente')::INT <> 2 THEN RAISE EXCEPTION 'versionIncidente debe ser 2: %', r; END IF;
    r := hu40_prueba.espera(hu40_prueba.aceptar(hu40_prueba.e(1), hu40_prueba.u(3),
        hu40_prueba.relevo(hu40_prueba.op(20)), hu40_prueba.op(21)), 'OK')->'resultado';
    IF r->'responsable'->>'id' <> hu40_prueba.u(3)::TEXT OR (r->>'version')::INT <> 3 THEN
        RAISE EXCEPTION 'El responsable debe ser C con la versión 3: %', r;
    END IF;
    IF (SELECT count(*) FROM public.transferencias_coordinacion
        WHERE incidente_id = (SELECT id FROM public.incidentes WHERE expedicion_id = hu40_prueba.e(1))) <> 2 THEN
        RAISE EXCEPTION 'Debe haber dos transferencias (A a B y B a C)';
    END IF;
    RAISE NOTICE 'OK 11: el anterior ya no propone, la versión vieja se rechaza al proponer y los relevos se encadenan';
END $$;

-- 12) Aceptar no compara versión: un cambio de versión posterior a la propuesta no bloquea el caso.
DO $$
DECLARE
    r JSONB;
BEGIN
    PERFORM hu40_prueba.espera(hu40_prueba.proponer(hu40_prueba.e(6), hu40_prueba.u(1),
        hu40_prueba.u(2), 'Cambio', 1, hu40_prueba.op(30)), 'OK');
    UPDATE public.incidentes SET version = version + 1 WHERE expedicion_id = hu40_prueba.e(6);
    r := hu40_prueba.espera(hu40_prueba.aceptar(hu40_prueba.e(6), hu40_prueba.u(2),
        hu40_prueba.relevo(hu40_prueba.op(30)), hu40_prueba.op(31)), 'OK')->'resultado';
    IF (r->>'version')::INT <> 3 OR (r->'relevo'->>'versionIncidente')::INT <> 1
       OR NOT EXISTS (SELECT 1 FROM public.transferencias_coordinacion
            WHERE relevo_id = hu40_prueba.relevo(hu40_prueba.op(30))
              AND version_anterior = 2 AND version_nueva = 3) THEN
        RAISE EXCEPTION 'Aceptar debe aplicar sobre la versión vigente y conservar la de la propuesta: %', r;
    END IF;
    RAISE NOTICE 'OK 12: aceptar no compara versión; guarda la de la propuesta y sube la vigente';
END $$;

-- 13) CA-03: caso cerrado después de la propuesta.
DO $$
BEGIN
    PERFORM hu40_prueba.espera(hu40_prueba.proponer(hu40_prueba.e(5), hu40_prueba.u(1),
        hu40_prueba.u(2), 'Antes del cierre', 1, hu40_prueba.op(40)), 'OK');
END $$;
RESET ROLE;
UPDATE public.incidentes SET estado = 'cerrado', cerrado_en = now() WHERE expedicion_id = hu40_prueba.e(5);
SET LOCAL ROLE service_role;
DO $$
DECLARE
    v_relevo UUID := hu40_prueba.relevo(hu40_prueba.op(40));
BEGIN
    PERFORM hu40_prueba.espera(hu40_prueba.aceptar(hu40_prueba.e(5), hu40_prueba.u(2), v_relevo, hu40_prueba.op(41)), 'INCIDENTE_CERRADO');
    PERFORM hu40_prueba.espera(hu40_prueba.proponer(hu40_prueba.e(5), hu40_prueba.u(1),
        hu40_prueba.u(3), 'Tras el cierre', 1, hu40_prueba.op(42)), 'INCIDENTE_CERRADO');
    IF NOT EXISTS (SELECT 1 FROM public.relevos_coordinacion WHERE id = v_relevo AND estado = 'pendiente')
       OR NOT EXISTS (SELECT 1 FROM public.incidentes WHERE expedicion_id = hu40_prueba.e(5)
            AND responsable_id = hu40_prueba.u(1) AND version = 1)
       OR EXISTS (SELECT 1 FROM public.transferencias_coordinacion WHERE relevo_id = v_relevo) THEN
        RAISE EXCEPTION 'Un caso cerrado no debe transferirse';
    END IF;
    RAISE NOTICE 'OK 13: ni se propone ni se acepta un relevo en un caso cerrado, aunque se cerrara después de la propuesta';
END $$;

-- 14) service_role solo puede lo previsto; las transferencias son de solo anexar.
DO $$
DECLARE
    v_id UUID;
BEGIN
    SELECT id INTO v_id FROM public.incidentes WHERE expedicion_id = hu40_prueba.e(1);
    BEGIN
        UPDATE public.incidentes SET estado = 'localizado' WHERE id = v_id;
        RAISE EXCEPTION 'service_role pudo cambiar el estado del incidente';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
        UPDATE public.incidentes SET cerrado_en = now() WHERE id = v_id;
        RAISE EXCEPTION 'service_role pudo cambiar cerrado_en';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
        DELETE FROM public.incidentes WHERE id = v_id;
        RAISE EXCEPTION 'service_role pudo borrar un incidente';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
        UPDATE public.relevos_coordinacion SET motivo = 'otro';
        RAISE EXCEPTION 'service_role pudo cambiar el motivo';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
        DELETE FROM public.relevos_coordinacion;
        RAISE EXCEPTION 'service_role pudo borrar relevos';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
        UPDATE public.transferencias_coordinacion SET motivo = 'otro';
        RAISE EXCEPTION 'service_role pudo cambiar una transferencia';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
        DELETE FROM public.transferencias_coordinacion;
        RAISE EXCEPTION 'service_role pudo borrar una transferencia';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    RAISE NOTICE 'OK 14: service_role no cambia estado ni cierre, no borra y no modifica motivos ni transferencias';
END $$;

RESET ROLE;
DO $$
BEGIN
    -- Ni siquiera el superusuario modifica el historial (triggers de solo anexar).
    BEGIN
        UPDATE public.transferencias_coordinacion SET motivo = 'otro';
        RAISE EXCEPTION 'Se pudo actualizar una transferencia';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM <> 'TRANSFERENCIA_INMUTABLE' THEN RAISE; END IF;
    END;
    BEGIN
        DELETE FROM public.transferencias_coordinacion;
        RAISE EXCEPTION 'Se pudo borrar una transferencia';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM <> 'TRANSFERENCIA_INMUTABLE' THEN RAISE; END IF;
    END;
    BEGIN
        TRUNCATE public.transferencias_coordinacion;
        RAISE EXCEPTION 'Se pudo vaciar la tabla de transferencias';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM <> 'TRANSFERENCIA_INMUTABLE' THEN RAISE; END IF;
    END;
    RAISE NOTICE 'OK 15: UPDATE, DELETE y TRUNCATE de transferencias rechazados con TRANSFERENCIA_INMUTABLE';
END $$;

-- 16) El borrado en cascada (de la expedición) sí se permite.
SET LOCAL ROLE service_role;
DO $$
BEGIN
    PERFORM hu40_prueba.espera(hu40_prueba.proponer(hu40_prueba.e(7), hu40_prueba.u(1),
        hu40_prueba.u(3), 'Cascada', 1, hu40_prueba.op(50)), 'OK');
    PERFORM hu40_prueba.espera(hu40_prueba.aceptar(hu40_prueba.e(7), hu40_prueba.u(3),
        hu40_prueba.relevo(hu40_prueba.op(50)), hu40_prueba.op(51)), 'OK');
END $$;
RESET ROLE;
DO $$
DECLARE
    v_antes INT; v_despues INT;
BEGIN
    SELECT count(*) INTO v_antes FROM public.transferencias_coordinacion;
    DELETE FROM public.expediciones WHERE id = hu40_prueba.e(7);
    SELECT count(*) INTO v_despues FROM public.transferencias_coordinacion;
    IF v_despues <> v_antes - 1 THEN
        RAISE EXCEPTION 'La cascada debía borrar solo la transferencia de e7 (% → %)', v_antes, v_despues;
    END IF;
    IF EXISTS (SELECT 1 FROM public.incidentes WHERE expedicion_id = hu40_prueba.e(7))
       OR EXISTS (SELECT 1 FROM public.relevos_coordinacion WHERE operacion_id = hu40_prueba.op(50)) THEN
        RAISE EXCEPTION 'La cascada debía borrar el incidente y su relevo';
    END IF;
    RAISE NOTICE 'OK 16: el borrado en cascada de la expedición elimina incidente, relevo y transferencia';
END $$;

-- De aquí en adelante, otra vez como service_role (el caso 16 terminó como superusuario).
SET LOCAL ROLE service_role;

-- 17) Rechazar: solo el destinatario; el responsable conserva el caso y se puede proponer otro.
DO $$
DECLARE
    r JSONB; v_relevo UUID;
BEGIN
    PERFORM hu40_prueba.espera(hu40_prueba.proponer(hu40_prueba.e(8), hu40_prueba.u(1),
        hu40_prueba.u(2), 'Primero', 1, hu40_prueba.op(60)), 'OK');
    v_relevo := hu40_prueba.relevo(hu40_prueba.op(60));
    r := hu40_prueba.espera(hu40_prueba.rechazar(hu40_prueba.e(8), hu40_prueba.u(2), v_relevo,
        hu40_prueba.op(61)), 'OK')->'resultado';
    IF (r->>'repetido')::BOOLEAN IS NOT FALSE
       OR r->'relevo'->>'estado' <> 'rechazado'
       OR r->'relevo'->>'resueltoEn' IS NULL
       OR r->'relevo'->>'resueltoPorId' <> hu40_prueba.u(2)::TEXT
       OR r->'responsable'->>'id' <> hu40_prueba.u(1)::TEXT
       OR (r->>'version')::INT <> 1 THEN
        RAISE EXCEPTION 'Resultado de rechazar inesperado: %', r;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.relevos_coordinacion WHERE id = v_relevo AND estado = 'rechazado'
            AND resuelto_por_id = hu40_prueba.u(2) AND resuelto_en IS NOT NULL
            AND operacion_resolucion_id = hu40_prueba.op(61))
       OR NOT EXISTS (SELECT 1 FROM public.incidentes WHERE expedicion_id = hu40_prueba.e(8)
            AND responsable_id = hu40_prueba.u(1) AND version = 1 AND estado = 'abierto')
       OR EXISTS (SELECT 1 FROM public.transferencias_coordinacion
            WHERE incidente_id = (SELECT id FROM public.incidentes WHERE expedicion_id = hu40_prueba.e(8))) THEN
        RAISE EXCEPTION 'Rechazar solo debe resolver el relevo';
    END IF;
    -- Liberó la posibilidad de proponer otro (el índice único parcial ya no lo bloquea).
    r := hu40_prueba.espera(hu40_prueba.proponer(hu40_prueba.e(8), hu40_prueba.u(1),
        hu40_prueba.u(3), 'Segundo', 1, hu40_prueba.op(62)), 'OK')->'resultado';
    IF r->'relevo'->>'estado' <> 'pendiente' OR r->'relevo'->'destinatario'->>'id' <> hu40_prueba.u(3)::TEXT THEN
        RAISE EXCEPTION 'Tras rechazar debe poder proponerse otro relevo: %', r;
    END IF;
    RAISE NOTICE 'OK 17: el destinatario rechaza; el responsable conserva el caso, la versión no cambia y se puede proponer otro relevo';
END $$;

-- 18) Cancelar: solo quien propuso; libera la posibilidad de proponer otro.
DO $$
DECLARE
    r JSONB; v_relevo UUID := hu40_prueba.relevo(hu40_prueba.op(62));
BEGIN
    r := hu40_prueba.espera(hu40_prueba.cancelar(hu40_prueba.e(8), hu40_prueba.u(1), v_relevo,
        hu40_prueba.op(63)), 'OK')->'resultado';
    IF (r->>'repetido')::BOOLEAN IS NOT FALSE
       OR r->'relevo'->>'estado' <> 'cancelado'
       OR r->'relevo'->>'resueltoEn' IS NULL
       OR r->'relevo'->>'resueltoPorId' <> hu40_prueba.u(1)::TEXT
       OR r->'responsable'->>'id' <> hu40_prueba.u(1)::TEXT
       OR (r->>'version')::INT <> 1 THEN
        RAISE EXCEPTION 'Resultado de cancelar inesperado: %', r;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.relevos_coordinacion WHERE id = v_relevo AND estado = 'cancelado'
            AND resuelto_por_id = hu40_prueba.u(1) AND operacion_resolucion_id = hu40_prueba.op(63)) THEN
        RAISE EXCEPTION 'El relevo debe quedar cancelado por quien lo propuso';
    END IF;
    PERFORM hu40_prueba.espera(hu40_prueba.proponer(hu40_prueba.e(8), hu40_prueba.u(1),
        hu40_prueba.u(2), 'Tercero', 1, hu40_prueba.op(64)), 'OK');
    -- Historial: se conservan los tres relevos, con su estado y quién y cuándo lo resolvió.
    IF (SELECT array_agg(estado ORDER BY estado COLLATE "C")
        FROM public.relevos_coordinacion
        WHERE incidente_id = (SELECT id FROM public.incidentes WHERE expedicion_id = hu40_prueba.e(8)))
       IS DISTINCT FROM ARRAY['cancelado','pendiente','rechazado'] THEN
        RAISE EXCEPTION 'El historial debe conservar los tres relevos';
    END IF;
    IF (SELECT count(*) FROM public.relevos_coordinacion
        WHERE incidente_id = (SELECT id FROM public.incidentes WHERE expedicion_id = hu40_prueba.e(8))
          AND estado IN ('rechazado', 'cancelado') AND resuelto_por_id IS NOT NULL AND resuelto_en IS NOT NULL) <> 2 THEN
        RAISE EXCEPTION 'Rechazado y cancelado deben registrar quién y cuándo';
    END IF;
    RAISE NOTICE 'OK 18: quien propuso cancela; se puede proponer otro y el historial conserva quién y cuándo resolvió cada relevo';
END $$;

-- 19) Rechazos y cancelaciones denegados: ninguno escribe nada (el relevo de e8 a B sigue pendiente).
DO $$
DECLARE
    v_relevo UUID := hu40_prueba.relevo(hu40_prueba.op(64));
BEGIN
    -- Rechazar: solo el destinatario (no quien propuso ni un tercero).
    PERFORM hu40_prueba.espera(hu40_prueba.rechazar(hu40_prueba.e(8), hu40_prueba.u(1), v_relevo, hu40_prueba.op(70)), 'NO_ES_DESTINATARIO');
    PERFORM hu40_prueba.espera(hu40_prueba.rechazar(hu40_prueba.e(8), hu40_prueba.u(3), v_relevo, hu40_prueba.op(70)), 'NO_ES_DESTINATARIO');
    -- Cancelar: solo quien propuso (no el destinatario ni un tercero).
    PERFORM hu40_prueba.espera(hu40_prueba.cancelar(hu40_prueba.e(8), hu40_prueba.u(2), v_relevo, hu40_prueba.op(70)), 'NO_ES_PROPONENTE');
    PERFORM hu40_prueba.espera(hu40_prueba.cancelar(hu40_prueba.e(8), hu40_prueba.u(3), v_relevo, hu40_prueba.op(70)), 'NO_ES_PROPONENTE');
    -- Sin perfil de rescatista, relevo inexistente o de otra expedición.
    PERFORM hu40_prueba.espera(hu40_prueba.rechazar(hu40_prueba.e(8), hu40_prueba.u(4), v_relevo, hu40_prueba.op(70)), 'NO_ES_RESCATISTA');
    PERFORM hu40_prueba.espera(hu40_prueba.cancelar(hu40_prueba.e(8), 'b0000000-0000-4000-8000-000000000001', v_relevo, hu40_prueba.op(70)), 'NO_ES_RESCATISTA');
    PERFORM hu40_prueba.espera(hu40_prueba.rechazar(hu40_prueba.e(8), hu40_prueba.u(2), gen_random_uuid(), hu40_prueba.op(70)), 'RELEVO_NO_ENCONTRADO');
    PERFORM hu40_prueba.espera(hu40_prueba.cancelar(hu40_prueba.e(8), hu40_prueba.u(1), gen_random_uuid(), hu40_prueba.op(70)), 'RELEVO_NO_ENCONTRADO');
    PERFORM hu40_prueba.espera(hu40_prueba.rechazar(hu40_prueba.e(4), hu40_prueba.u(2), v_relevo, hu40_prueba.op(70)), 'RELEVO_NO_ENCONTRADO');
    PERFORM hu40_prueba.espera(hu40_prueba.cancelar(hu40_prueba.e(4), hu40_prueba.u(1), v_relevo, hu40_prueba.op(70)), 'RELEVO_NO_ENCONTRADO');
    -- Datos inválidos y operaciones de otro tipo (propuesta, asunción, evento del plan).
    PERFORM hu40_prueba.espera(hu40_prueba.rechazar(hu40_prueba.e(8), hu40_prueba.u(2), v_relevo, NULL), 'DATOS_INVALIDOS');
    PERFORM hu40_prueba.espera(hu40_prueba.cancelar(hu40_prueba.e(8), hu40_prueba.u(1), NULL, hu40_prueba.op(70)), 'DATOS_INVALIDOS');
    PERFORM hu40_prueba.espera(hu40_prueba.rechazar(hu40_prueba.e(8), hu40_prueba.u(2), v_relevo, hu40_prueba.op(64)), 'DATOS_INVALIDOS');
    PERFORM hu40_prueba.espera(hu40_prueba.cancelar(hu40_prueba.e(8), hu40_prueba.u(1), v_relevo, hu40_prueba.op(908)), 'DATOS_INVALIDOS');
    PERFORM hu40_prueba.espera(hu40_prueba.cancelar(hu40_prueba.e(8), hu40_prueba.u(1), v_relevo, hu40_prueba.op(950)), 'DATOS_INVALIDOS');
    -- La función común no admite otros estados finales.
    BEGIN
        PERFORM public.treksafe_resolver_relevo(hu40_prueba.e(8), hu40_prueba.u(2), v_relevo, hu40_prueba.op(70), 'aceptado');
        RAISE EXCEPTION 'La función común no debe admitir el estado aceptado';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM <> 'DATOS_INVALIDOS' THEN RAISE; END IF;
    END;
    IF NOT EXISTS (SELECT 1 FROM public.relevos_coordinacion WHERE id = v_relevo AND estado = 'pendiente'
            AND resuelto_en IS NULL AND resuelto_por_id IS NULL AND operacion_resolucion_id IS NULL) THEN
        RAISE EXCEPTION 'Una resolución denegada no debe cambiar el relevo';
    END IF;
    RAISE NOTICE 'OK 19: rechazar solo el destinatario, cancelar solo quien propuso; sin perfil, relevo ajeno, datos inválidos y operaciones de otro tipo no escriben nada';
END $$;

-- 20) Idempotencia de rechazar y cancelar, y operaciones de otro tipo o de otro actor.
DO $$
DECLARE
    v_relevo UUID := hu40_prueba.relevo(hu40_prueba.op(64)); a JSONB; d JSONB;
BEGIN
    -- Rechazar el relevo de e8 (de A a B) con op(71), dos veces con la misma operación.
    PERFORM hu40_prueba.espera(hu40_prueba.rechazar(hu40_prueba.e(8), hu40_prueba.u(2), v_relevo, hu40_prueba.op(71)), 'OK');
    a := hu40_prueba.espera(hu40_prueba.rechazar(hu40_prueba.e(8), hu40_prueba.u(2), v_relevo, hu40_prueba.op(71)), 'OK')->'resultado';
    IF (a->>'repetido')::BOOLEAN IS NOT TRUE OR a->'relevo'->>'estado' <> 'rechazado' THEN
        RAISE EXCEPTION 'La misma operación debió repetir el resultado: %', a;
    END IF;
    -- Otra operación sobre un relevo resuelto: RELEVO_YA_RESUELTO con el estado, para cualquiera de las dos acciones.
    d := (hu40_prueba.espera(hu40_prueba.rechazar(hu40_prueba.e(8), hu40_prueba.u(2), v_relevo, hu40_prueba.op(72)),
        'RELEVO_YA_RESUELTO')->>'detalle')::JSONB;
    IF d->>'estado' <> 'rechazado' THEN RAISE EXCEPTION 'Debe decir rechazado: %', d; END IF;
    d := (hu40_prueba.espera(hu40_prueba.cancelar(hu40_prueba.e(8), hu40_prueba.u(1), v_relevo, hu40_prueba.op(73)),
        'RELEVO_YA_RESUELTO')->>'detalle')::JSONB;
    IF d->>'estado' <> 'rechazado' THEN RAISE EXCEPTION 'Cancelar tras rechazar debe decir rechazado: %', d; END IF;
    d := (hu40_prueba.espera(hu40_prueba.aceptar(hu40_prueba.e(8), hu40_prueba.u(2), v_relevo, hu40_prueba.op(74)),
        'RELEVO_YA_RESUELTO')->>'detalle')::JSONB;
    IF d->>'estado' <> 'rechazado' THEN RAISE EXCEPTION 'Aceptar tras rechazar debe decir rechazado: %', d; END IF;
    -- La operación de resolución vale solo para su actor y su relevo.
    PERFORM hu40_prueba.espera(hu40_prueba.rechazar(hu40_prueba.e(8), hu40_prueba.u(3), v_relevo, hu40_prueba.op(71)), 'RELEVO_NO_ENCONTRADO');
    PERFORM hu40_prueba.espera(hu40_prueba.rechazar(hu40_prueba.e(1), hu40_prueba.u(2), v_relevo, hu40_prueba.op(71)), 'RELEVO_NO_ENCONTRADO');
    -- La operación que rechazó no sirve para aceptar.
    PERFORM hu40_prueba.espera(hu40_prueba.aceptar(hu40_prueba.e(8), hu40_prueba.u(2), v_relevo, hu40_prueba.op(71)), 'DATOS_INVALIDOS');
    -- Un tercero sobre un relevo resuelto no averigua su estado.
    PERFORM hu40_prueba.espera(hu40_prueba.rechazar(hu40_prueba.e(8), hu40_prueba.u(3), v_relevo, hu40_prueba.op(75)), 'NO_ES_DESTINATARIO');
    PERFORM hu40_prueba.espera(hu40_prueba.cancelar(hu40_prueba.e(8), hu40_prueba.u(3), v_relevo, hu40_prueba.op(75)), 'NO_ES_PROPONENTE');
    -- Una operación de resolución no sirve como operación de propuesta.
    PERFORM hu40_prueba.espera(hu40_prueba.proponer(hu40_prueba.e(8), hu40_prueba.u(1),
        hu40_prueba.u(3), 'Reuso', 1, hu40_prueba.op(71)), 'DATOS_INVALIDOS');
    -- Cancelar un relevo con la misma operación, también dos veces.
    PERFORM hu40_prueba.espera(hu40_prueba.proponer(hu40_prueba.e(8), hu40_prueba.u(1),
        hu40_prueba.u(3), 'Cuarto', 1, hu40_prueba.op(76)), 'OK');
    PERFORM hu40_prueba.espera(hu40_prueba.cancelar(hu40_prueba.e(8), hu40_prueba.u(1),
        hu40_prueba.relevo(hu40_prueba.op(76)), hu40_prueba.op(77)), 'OK');
    a := hu40_prueba.espera(hu40_prueba.cancelar(hu40_prueba.e(8), hu40_prueba.u(1),
        hu40_prueba.relevo(hu40_prueba.op(76)), hu40_prueba.op(77)), 'OK')->'resultado';
    IF (a->>'repetido')::BOOLEAN IS NOT TRUE OR a->'relevo'->>'estado' <> 'cancelado' THEN
        RAISE EXCEPTION 'Cancelar dos veces con la misma operación debió repetir: %', a;
    END IF;
    PERFORM hu40_prueba.espera(hu40_prueba.rechazar(hu40_prueba.e(8), hu40_prueba.u(1),
        hu40_prueba.relevo(hu40_prueba.op(76)), hu40_prueba.op(77)), 'DATOS_INVALIDOS');
    IF (SELECT count(*) FROM public.relevos_coordinacion WHERE operacion_resolucion_id = hu40_prueba.op(77)) <> 1 THEN
        RAISE EXCEPTION 'La repetición no debe escribir otra resolución';
    END IF;
    RAISE NOTICE 'OK 20: idempotencia por operación, RELEVO_YA_RESUELTO con el estado y operaciones de otro tipo o de otro actor rechazadas sin revelar nada';
END $$;

-- 21) Aceptar, rechazar y cancelar entre sí: un relevo se resuelve una sola vez.
DO $$
DECLARE
    d JSONB;
BEGIN
    -- El relevo de e1 de A a B ya fue aceptado (caso 9).
    d := (hu40_prueba.espera(hu40_prueba.rechazar(hu40_prueba.e(1), hu40_prueba.u(2),
        hu40_prueba.relevo(hu40_prueba.op(1)), hu40_prueba.op(80)), 'RELEVO_YA_RESUELTO')->>'detalle')::JSONB;
    IF d->>'estado' <> 'aceptado' THEN RAISE EXCEPTION 'Debe decir aceptado: %', d; END IF;
    d := (hu40_prueba.espera(hu40_prueba.cancelar(hu40_prueba.e(1), hu40_prueba.u(1),
        hu40_prueba.relevo(hu40_prueba.op(1)), hu40_prueba.op(81)), 'RELEVO_YA_RESUELTO')->>'detalle')::JSONB;
    IF d->>'estado' <> 'aceptado' THEN RAISE EXCEPTION 'Debe decir aceptado: %', d; END IF;
    IF (SELECT count(*) FROM public.transferencias_coordinacion
        WHERE relevo_id = hu40_prueba.relevo(hu40_prueba.op(1))) <> 1
       OR NOT EXISTS (SELECT 1 FROM public.relevos_coordinacion
            WHERE id = hu40_prueba.relevo(hu40_prueba.op(1)) AND estado = 'aceptado') THEN
        RAISE EXCEPTION 'Un relevo aceptado no cambia al rechazar o cancelar';
    END IF;
    -- Cancelado: ya no se acepta (el relevo op(62) de e8 se canceló en el caso 18).
    d := (hu40_prueba.espera(hu40_prueba.aceptar(hu40_prueba.e(8), hu40_prueba.u(3),
        hu40_prueba.relevo(hu40_prueba.op(62)), hu40_prueba.op(82)), 'RELEVO_YA_RESUELTO')->>'detalle')::JSONB;
    IF d->>'estado' <> 'cancelado' THEN RAISE EXCEPTION 'Debe decir cancelado: %', d; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.incidentes WHERE expedicion_id = hu40_prueba.e(8)
        AND responsable_id = hu40_prueba.u(1) AND version = 1) THEN
        RAISE EXCEPTION 'El caso de e8 no debe cambiar de responsable ni de versión';
    END IF;
    RAISE NOTICE 'OK 21: un relevo aceptado, rechazado o cancelado no se vuelve a resolver y RELEVO_YA_RESUELTO dice cómo quedó';
END $$;

-- 22) Caso cerrado tras la propuesta (relevo pendiente de e5, caso 13): rechazar y cancelar
--     devuelven INCIDENTE_CERRADO y no escriben; el relevo queda pendiente pero inerte.
DO $$
DECLARE
    v_relevo UUID := hu40_prueba.relevo(hu40_prueba.op(40));
BEGIN
    PERFORM hu40_prueba.espera(hu40_prueba.rechazar(hu40_prueba.e(5), hu40_prueba.u(2), v_relevo, hu40_prueba.op(90)), 'INCIDENTE_CERRADO');
    PERFORM hu40_prueba.espera(hu40_prueba.cancelar(hu40_prueba.e(5), hu40_prueba.u(1), v_relevo, hu40_prueba.op(91)), 'INCIDENTE_CERRADO');
    PERFORM hu40_prueba.espera(hu40_prueba.aceptar(hu40_prueba.e(5), hu40_prueba.u(2), v_relevo, hu40_prueba.op(92)), 'INCIDENTE_CERRADO');
    IF NOT EXISTS (SELECT 1 FROM public.relevos_coordinacion WHERE id = v_relevo AND estado = 'pendiente'
            AND resuelto_en IS NULL AND resuelto_por_id IS NULL AND operacion_resolucion_id IS NULL)
       OR NOT EXISTS (SELECT 1 FROM public.incidentes WHERE expedicion_id = hu40_prueba.e(5)
            AND responsable_id = hu40_prueba.u(1) AND version = 1 AND estado = 'cerrado')
       OR EXISTS (SELECT 1 FROM public.transferencias_coordinacion WHERE relevo_id = v_relevo) THEN
        RAISE EXCEPTION 'En un caso cerrado no se resuelve ni se transfiere nada';
    END IF;
    RAISE NOTICE 'OK 22: rechazar, cancelar y aceptar en un caso cerrado devuelven INCIDENTE_CERRADO sin escribir; el relevo pendiente queda inerte';
END $$;

-- 23) Restricciones del historial (superusuario): estados y autor de la resolución coherentes.
RESET ROLE;
DO $$
DECLARE
    v_id UUID := hu40_prueba.relevo(hu40_prueba.op(40)); -- pendiente, de A a B (caso cerrado)
BEGIN
    BEGIN
        UPDATE public.relevos_coordinacion SET estado = 'invalidado' WHERE id = v_id;
        RAISE EXCEPTION 'Se aceptó el estado invalidado';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN -- resuelto sin quién ni cuándo
        UPDATE public.relevos_coordinacion SET estado = 'rechazado' WHERE id = v_id;
        RAISE EXCEPTION 'Se aceptó un rechazo sin resolución';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN -- pendiente con resolución
        UPDATE public.relevos_coordinacion SET resuelto_en = now(), resuelto_por_id = hu40_prueba.u(2),
            operacion_resolucion_id = hu40_prueba.op(99) WHERE id = v_id;
        RAISE EXCEPTION 'Se aceptó un pendiente con resolución';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN -- cancelar lo resuelve otro que quien propuso
        UPDATE public.relevos_coordinacion SET estado = 'cancelado', resuelto_en = now(),
            resuelto_por_id = hu40_prueba.u(2), operacion_resolucion_id = hu40_prueba.op(99) WHERE id = v_id;
        RAISE EXCEPTION 'Se aceptó una cancelación del destinatario';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN -- rechazar lo resuelve otro que el destinatario
        UPDATE public.relevos_coordinacion SET estado = 'rechazado', resuelto_en = now(),
            resuelto_por_id = hu40_prueba.u(1), operacion_resolucion_id = hu40_prueba.op(99) WHERE id = v_id;
        RAISE EXCEPTION 'Se aceptó un rechazo de quien propuso';
    EXCEPTION WHEN check_violation THEN NULL; END;
    RAISE NOTICE 'OK 23: la base rechaza estados fuera de pendiente, aceptado, rechazado y cancelado y resoluciones sin autor o de la parte equivocada';
END $$;

ROLLBACK;

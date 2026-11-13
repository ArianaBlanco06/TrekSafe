-- Solo PostgreSQL local desechable; todos los datos de prueba se revierten (ROLLBACK final).
-- Requiere: los roles anon, authenticated y service_role con los privilegios por defecto
-- de Supabase, el esquema base, las migraciones 000 a 019, 021, 022 a 024 (más 015) y la 025
-- y la 029 aplicadas. Se ejecuta con backend/scripts/test-hu50-postgres.mjs, que prepara
-- ese entorno. Cada caso imprime un aviso "OK n: ..."; el primero que falla aborta el
-- archivo con su mensaje. La carrera real entre sesiones se prueba en el script .mjs.
-- Un senderista distinto por expedición: DEP-04 (022) permite una sola expedición
-- bloqueante por senderista.
-- Los datos de salud de prueba son ficticios: tipo de sangre 'AB-' y texto cifrado
-- 'CIFRADO-SECRETO-H50-n' (no es una carga real).
BEGIN;

CREATE SCHEMA hu50_prueba;
GRANT USAGE ON SCHEMA hu50_prueba TO service_role;

CREATE FUNCTION hu50_prueba.inc(n INTEGER) RETURNS UUID LANGUAGE sql IMMUTABLE AS $$
    SELECT ('f5000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
CREATE FUNCTION hu50_prueba.resc(n INTEGER) RETURNS UUID LANGUAGE sql IMMUTABLE AS $$
    SELECT ('a5000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
CREATE FUNCTION hu50_prueba.exp(n INTEGER) RETURNS UUID LANGUAGE sql IMMUTABLE AS $$
    SELECT ('e5000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
CREATE FUNCTION hu50_prueba.sen(n INTEGER) RETURNS UUID LANGUAGE sql IMMUTABLE AS $$
    SELECT ('b5000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
GRANT EXECUTE ON FUNCTION hu50_prueba.inc(INTEGER), hu50_prueba.resc(INTEGER),
    hu50_prueba.exp(INTEGER), hu50_prueba.sen(INTEGER) TO service_role;

-- Ayudantes: ejecutan las RPC y devuelven el código del error o 'OK' con el resultado.
CREATE FUNCTION hu50_prueba.contexto(p_inc UUID, p_actor UUID)
RETURNS JSONB LANGUAGE plpgsql AS $$
BEGIN
    RETURN jsonb_build_object('codigo', 'OK', 'resultado', public.treksafe_contexto_ficha_medica(p_inc, p_actor));
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('codigo', SQLERRM);
END;
$$;
CREATE FUNCTION hu50_prueba.leer(p_inc UUID, p_actor UUID)
RETURNS JSONB LANGUAGE plpgsql AS $$
BEGIN
    RETURN jsonb_build_object('codigo', 'OK', 'resultado', public.treksafe_leer_ficha_cifrada_responsable(p_inc, p_actor));
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('codigo', SQLERRM);
END;
$$;
CREATE FUNCTION hu50_prueba.registrar(p_inc UUID, p_actor UUID, p_resultado TEXT, p_motivo TEXT)
RETURNS JSONB LANGUAGE plpgsql AS $$
BEGIN
    RETURN jsonb_build_object('codigo', 'OK', 'resultado',
        public.treksafe_registrar_acceso_ficha_medica(p_inc, p_actor, p_resultado, p_motivo));
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('codigo', SQLERRM);
END;
$$;
CREATE FUNCTION hu50_prueba.anonimizar(p_sen UUID, p_ids UUID[])
RETURNS JSONB LANGUAGE plpgsql AS $$
BEGIN
    RETURN jsonb_build_object('codigo', 'OK', 'resultado', public.treksafe_anonimizar_notas_avance(p_sen, p_ids));
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('codigo', SQLERRM);
END;
$$;
GRANT EXECUTE ON FUNCTION hu50_prueba.contexto(UUID, UUID), hu50_prueba.leer(UUID, UUID),
    hu50_prueba.registrar(UUID, UUID, TEXT, TEXT), hu50_prueba.anonimizar(UUID, UUID[]) TO service_role;

-- Datos de prueba (superusuario).
INSERT INTO public.usuarios (id, correo_electronico, hash_contrasena, rol) VALUES
    (hu50_prueba.resc(1), 'h50r1@example.invalid', 'fixture', 'rescatista'),
    (hu50_prueba.resc(2), 'h50r2@example.invalid', 'fixture', 'rescatista'),
    (hu50_prueba.resc(3), 'h50r3@example.invalid', 'fixture', 'rescatista');
INSERT INTO public.usuarios (id, correo_electronico, hash_contrasena, rol)
SELECT hu50_prueba.sen(n), 'h50s' || n || '@example.invalid', 'fixture', 'senderista'
FROM generate_series(1, 10) AS n;
INSERT INTO public.perfiles_senderista (usuario_id, nombre_completo, telefono, id_documento)
SELECT hu50_prueba.sen(n), 'Senderista Ficticio ' || n, '999999999', 'H50' || lpad(n::text, 5, '0')
FROM generate_series(1, 10) AS n;
INSERT INTO public.registros_institucionales_rescatista
    (institucion, numero_credencial, nombre_completo, fecha_nacimiento) VALUES
    ('AGMP', 'H50-CRED-1', 'Rescatista Uno', '1990-01-01'),
    ('AGMP', 'H50-CRED-2', 'Rescatista Dos', '1991-02-02'),
    ('AGMP', 'H50-CRED-3', 'Rescatista Tres', '1992-03-03');
INSERT INTO public.perfiles_rescatista (usuario_id, numero_credencial, nombre_completo, fecha_nacimiento) VALUES
    (hu50_prueba.resc(1), 'H50-CRED-1', 'Rescatista Uno', '1990-01-01'),
    (hu50_prueba.resc(2), 'H50-CRED-2', 'Rescatista Dos', '1991-02-02'),
    (hu50_prueba.resc(3), 'H50-CRED-3', 'Rescatista Tres', '1992-03-03');

-- Fichas médicas con consentimiento para los senderistas 1 a 7 (el 8 no tiene ficha).
INSERT INTO public.fichas_medicas (senderista_id, tipo_sangre, condiciones_encriptadas, consentimiento_firmado)
SELECT hu50_prueba.sen(n), 'AB-', 'CIFRADO-SECRETO-H50-' || n, TRUE
FROM generate_series(1, 7) AS n;

-- Expediciones 1 a 8 en alerta (una por senderista). Senderista 9: 9 completada, 10 cancelada
-- y 11 en alerta. Senderista 10: 12 completada.
INSERT INTO public.expediciones
    (id, senderista_id, lugar_inicio, lugar_fin, hora_inicio, hora_retorno_estimada, estado)
SELECT hu50_prueba.exp(n),
       CASE WHEN n BETWEEN 1 AND 8 THEN hu50_prueba.sen(n)
            WHEN n IN (9, 10, 11) THEN hu50_prueba.sen(9)
            ELSE hu50_prueba.sen(10) END,
       'Inicio', 'Destino', now() - interval '5 hours', now() - interval '2 hours',
       CASE WHEN n IN (9, 12) THEN 'completada'
            WHEN n = 10 THEN 'cancelada'
            ELSE 'alerta' END::public.estado_expedicion_enum
FROM generate_series(1, 12) AS n;

-- Incidentes 1 a 8 abiertos, uno por expedición, todos con R1 como responsable vigente.
INSERT INTO public.incidentes (id, expedicion_id, responsable_id, operacion_id)
SELECT hu50_prueba.inc(n), hu50_prueba.exp(n), hu50_prueba.resc(1),
       ('c5000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
FROM generate_series(1, 8) AS n;

-- Notas de avance (HU-34) para el caso ARCO: puntos de ruta y avances con nota.
INSERT INTO public.puntos_ruta (id, expedicion_id, nombre, latitud, longitud, orden)
SELECT ('d5000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, hu50_prueba.exp(n), 'Punto ' || n, -12.0, -77.0, 1
FROM generate_series(9, 12) AS n;
INSERT INTO public.avances_expedicion
    (senderista_id, expedicion_id, punto_id, punto_nombre, punto_orden, solicitud_id, registrado_en, nota)
SELECT CASE WHEN n = 12 THEN hu50_prueba.sen(10) ELSE hu50_prueba.sen(9) END,
       hu50_prueba.exp(n),
       ('d5000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'Punto ' || n, 1,
       ('a1000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, now(),
       'Nota libre del avance ' || n
FROM generate_series(9, 12) AS n;

-- 1) Estructura, funciones y privilegios.
DO $$
DECLARE
    v_funcion REGPROCEDURE;
    v_rol TEXT;
    v_columnas TEXT;
    v_trigger TEXT;
    v_tipo CHAR;
BEGIN
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.accesos_ficha_medica'::REGCLASS) THEN
        RAISE EXCEPTION 'accesos_ficha_medica debe tener RLS activo';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
        AND tablename = 'accesos_ficha_medica' AND policyname = 'treksafe_deny_anon_authenticated') THEN
        RAISE EXCEPTION 'Falta la política treksafe_deny_anon_authenticated';
    END IF;

    SELECT string_agg(column_name, ',' ORDER BY column_name) INTO v_columnas
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'accesos_ficha_medica';
    IF v_columnas <> 'actor_id,expedicion_id,id,incidente_id,motivo,registrado_en,resultado,senderista_id' THEN
        RAISE EXCEPTION 'Columnas inesperadas en accesos_ficha_medica: %', v_columnas;
    END IF;

    -- Solo el senderista tiene FK (con cascada); incidente, expedición y actor no.
    IF (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.accesos_ficha_medica'::REGCLASS AND contype = 'f') <> 1 THEN
        RAISE EXCEPTION 'accesos_ficha_medica debe tener un solo FK (senderista_id)';
    END IF;
    SELECT confdeltype INTO v_tipo FROM pg_constraint WHERE conname = 'fk_accesos_ficha_senderista';
    IF v_tipo IS DISTINCT FROM 'c' THEN RAISE EXCEPTION 'El FK al senderista debe ser ON DELETE CASCADE (%)', v_tipo; END IF;

    FOREACH v_trigger IN ARRAY ARRAY[
        'trg_accesos_ficha_antes_de_insertar', 'trg_accesos_ficha_solo_anexado',
        'trg_accesos_ficha_sin_borrado', 'trg_accesos_ficha_sin_truncate'
    ] LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = v_trigger AND NOT tgisinternal
            AND tgrelid = 'public.accesos_ficha_medica'::REGCLASS) THEN
            RAISE EXCEPTION 'Falta el trigger %', v_trigger;
        END IF;
    END LOOP;

    -- Tres RPC y los dos triggers son INVOKER con search_path vacío.
    FOREACH v_funcion IN ARRAY ARRAY[
        'public.treksafe_contexto_ficha_medica(uuid,uuid)'::REGPROCEDURE,
        'public.treksafe_leer_ficha_cifrada_responsable(uuid,uuid)'::REGPROCEDURE,
        'public.treksafe_registrar_acceso_ficha_medica(uuid,uuid,text,text)'::REGPROCEDURE,
        'public.treksafe_accesos_ficha_antes_de_insertar()'::REGPROCEDURE,
        'public.treksafe_accesos_ficha_solo_anexado()'::REGPROCEDURE
    ] LOOP
        IF (SELECT prosecdef FROM pg_proc WHERE oid = v_funcion) THEN
            RAISE EXCEPTION 'La función debe ser SECURITY INVOKER: %', v_funcion;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_proc p, unnest(p.proconfig) c
            WHERE p.oid = v_funcion AND c = 'search_path=""') THEN
            RAISE EXCEPTION 'La función debe tener search_path vacío: %', v_funcion;
        END IF;
    END LOOP;

    -- La RPC ARCO es DEFINER con search_path fijo.
    v_funcion := 'public.treksafe_anonimizar_notas_avance(uuid,uuid[])'::REGPROCEDURE;
    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_funcion) THEN
        RAISE EXCEPTION 'La RPC ARCO debe ser SECURITY DEFINER';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p, unnest(p.proconfig) c
        WHERE p.oid = v_funcion AND c LIKE 'search_path=pg_catalog%pg_temp%') THEN
        RAISE EXCEPTION 'La RPC ARCO debe fijar search_path = pg_catalog, pg_temp';
    END IF;

    FOREACH v_funcion IN ARRAY ARRAY[
        'public.treksafe_contexto_ficha_medica(uuid,uuid)'::REGPROCEDURE,
        'public.treksafe_leer_ficha_cifrada_responsable(uuid,uuid)'::REGPROCEDURE,
        'public.treksafe_registrar_acceso_ficha_medica(uuid,uuid,text,text)'::REGPROCEDURE,
        'public.treksafe_anonimizar_notas_avance(uuid,uuid[])'::REGPROCEDURE,
        'public.treksafe_accesos_ficha_antes_de_insertar()'::REGPROCEDURE,
        'public.treksafe_accesos_ficha_solo_anexado()'::REGPROCEDURE
    ] LOOP
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
        'public.treksafe_contexto_ficha_medica(uuid,uuid)'::REGPROCEDURE,
        'public.treksafe_leer_ficha_cifrada_responsable(uuid,uuid)'::REGPROCEDURE,
        'public.treksafe_registrar_acceso_ficha_medica(uuid,uuid,text,text)'::REGPROCEDURE,
        'public.treksafe_anonimizar_notas_avance(uuid,uuid[])'::REGPROCEDURE
    ] LOOP
        IF NOT has_function_privilege('service_role', v_funcion, 'EXECUTE') THEN
            RAISE EXCEPTION 'service_role debe poder ejecutar %', v_funcion;
        END IF;
    END LOOP;

    IF NOT has_table_privilege('service_role', 'public.accesos_ficha_medica', 'SELECT')
       OR NOT has_table_privilege('service_role', 'public.accesos_ficha_medica', 'INSERT') THEN
        RAISE EXCEPTION 'service_role debe tener SELECT e INSERT sobre accesos_ficha_medica';
    END IF;
    IF has_table_privilege('service_role', 'public.accesos_ficha_medica', 'UPDATE')
       OR has_table_privilege('service_role', 'public.accesos_ficha_medica', 'DELETE')
       OR has_table_privilege('service_role', 'public.accesos_ficha_medica', 'TRUNCATE') THEN
        RAISE EXCEPTION 'service_role no debe tener UPDATE, DELETE ni TRUNCATE sobre accesos_ficha_medica';
    END IF;
    FOREACH v_rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF has_table_privilege(v_rol, 'public.accesos_ficha_medica', 'SELECT')
           OR has_table_privilege(v_rol, 'public.accesos_ficha_medica', 'INSERT') THEN
            RAISE EXCEPTION '% no debe tocar accesos_ficha_medica', v_rol;
        END IF;
    END LOOP;
    IF NOT has_column_privilege('service_role', 'public.incidentes', 'version', 'UPDATE') THEN
        RAISE EXCEPTION 'service_role necesita UPDATE (version) sobre incidentes para el FOR SHARE';
    END IF;
    IF has_table_privilege('service_role', 'public.avances_expedicion', 'SELECT')
       OR has_table_privilege('service_role', 'public.avances_expedicion', 'UPDATE') THEN
        RAISE EXCEPTION 'service_role no debe tener privilegios directos sobre avances_expedicion';
    END IF;
    RAISE NOTICE 'OK 1: RLS, política, columnas sin datos médicos, un solo FK (senderista, cascada), 4 triggers, 3 RPC y 2 triggers INVOKER con search_path vacío, RPC ARCO DEFINER con search_path fijo, sin EXECUTE para PUBLIC, anon ni authenticated; service_role solo SELECT e INSERT en la auditoría y UPDATE (version) en incidentes';
END $$;

-- De aquí en adelante todo corre como service_role, igual que el backend.
SET LOCAL ROLE service_role;

-- 2) Contexto del responsable: sin texto cifrado ni tipo de sangre.
DO $$
DECLARE
    r JSONB;
BEGIN
    r := hu50_prueba.contexto(hu50_prueba.inc(1), hu50_prueba.resc(1));
    IF r->>'codigo' <> 'OK' THEN RAISE EXCEPTION 'Esperaba OK y llegó %', r; END IF;
    r := r->'resultado';
    IF (r->>'actorEsRescatista')::BOOLEAN IS NOT TRUE OR (r->>'consentimientoVigente')::BOOLEAN IS NOT TRUE THEN
        RAISE EXCEPTION 'Contexto inesperado: %', r;
    END IF;
    IF r->'incidente'->>'id' <> hu50_prueba.inc(1)::text
       OR r->'incidente'->>'expedicionId' <> hu50_prueba.exp(1)::text
       OR r->'incidente'->>'senderistaId' <> hu50_prueba.sen(1)::text
       OR r->'incidente'->>'estado' <> 'abierto'
       OR r->'incidente'->>'responsableId' <> hu50_prueba.resc(1)::text THEN
        RAISE EXCEPTION 'Incidente inesperado en el contexto: %', r;
    END IF;
    IF (SELECT string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys(r) AS k) <> 'actorEsRescatista,consentimientoVigente,incidente'
       OR (SELECT string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys(r->'incidente') AS k)
          <> 'estado,expedicionId,id,responsableId,senderistaId' THEN
        RAISE EXCEPTION 'Claves inesperadas en el contexto: %', r;
    END IF;
    IF r::text LIKE '%CIFRADO%' OR r::text LIKE '%AB-%' OR r::text ~* 'sangre|cifrada|condicion' THEN
        RAISE EXCEPTION 'El contexto no debe llevar datos de salud: %', r;
    END IF;
    -- Otro rescatista recibe el mismo contexto (la decisión es del dominio).
    r := hu50_prueba.contexto(hu50_prueba.inc(1), hu50_prueba.resc(2));
    IF (r->'resultado'->>'actorEsRescatista')::BOOLEAN IS NOT TRUE
       OR r->'resultado'->'incidente'->>'responsableId' <> hu50_prueba.resc(1)::text THEN
        RAISE EXCEPTION 'Contexto de otro rescatista inesperado: %', r;
    END IF;
    RAISE NOTICE 'OK 2: el contexto lleva rescatista, incidente (id, expedición, senderista, estado, responsable) y consentimiento, y nunca el tipo de sangre ni el texto cifrado';
END $$;

-- 3) Incidente inexistente y actor que no es rescatista.
DO $$
DECLARE
    r JSONB;
BEGIN
    r := hu50_prueba.contexto('99999999-9999-4999-8999-999999999999', hu50_prueba.resc(1));
    IF r->>'codigo' <> 'OK' OR r->'resultado'->'incidente' IS DISTINCT FROM 'null'::jsonb
       OR (r->'resultado'->>'actorEsRescatista')::BOOLEAN IS NOT TRUE
       OR (r->'resultado'->>'consentimientoVigente')::BOOLEAN IS NOT FALSE THEN
        RAISE EXCEPTION 'Incidente inexistente: %', r;
    END IF;
    r := hu50_prueba.contexto(hu50_prueba.inc(1), hu50_prueba.sen(2));
    IF (r->'resultado'->>'actorEsRescatista')::BOOLEAN IS NOT FALSE THEN
        RAISE EXCEPTION 'Un senderista no es rescatista: %', r;
    END IF;
    r := hu50_prueba.contexto('99999999-9999-4999-8999-999999999999', hu50_prueba.sen(2));
    IF (r->'resultado'->>'actorEsRescatista')::BOOLEAN IS NOT FALSE OR r->'resultado'->'incidente' IS DISTINCT FROM 'null'::jsonb THEN
        RAISE EXCEPTION 'Senderista e incidente inexistente: %', r;
    END IF;
    RAISE NOTICE 'OK 3: un incidente inexistente devuelve incidente null; un senderista devuelve actorEsRescatista=false';
END $$;

-- 4) El responsable recibe el tipo de sangre y el texto cifrado.
DO $$
DECLARE
    r JSONB;
BEGIN
    r := hu50_prueba.leer(hu50_prueba.inc(1), hu50_prueba.resc(1));
    IF r->>'codigo' <> 'OK' THEN RAISE EXCEPTION 'Esperaba OK y llegó %', r; END IF;
    IF r->'resultado'->>'tipoSangre' <> 'AB-' OR r->'resultado'->>'cargaCifrada' <> 'CIFRADO-SECRETO-H50-1' THEN
        RAISE EXCEPTION 'Datos inesperados: %', r;
    END IF;
    IF (SELECT string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys(r->'resultado') AS k) <> 'cargaCifrada,tipoSangre' THEN
        RAISE EXCEPTION 'Claves inesperadas: %', r;
    END IF;
    RAISE NOTICE 'OK 4: el responsable vigente recibe {tipoSangre, cargaCifrada}';
END $$;

-- 5) Otro rescatista o un senderista reciben NULL.
DO $$
DECLARE
    r JSONB;
BEGIN
    r := hu50_prueba.leer(hu50_prueba.inc(1), hu50_prueba.resc(2));
    IF r->>'codigo' <> 'OK' OR r->'resultado' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Otro rescatista: %', r; END IF;
    r := hu50_prueba.leer(hu50_prueba.inc(1), hu50_prueba.sen(1));
    IF r->>'codigo' <> 'OK' OR r->'resultado' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Senderista: %', r; END IF;
    r := hu50_prueba.leer(hu50_prueba.inc(1), hu50_prueba.sen(2));
    IF r->>'codigo' <> 'OK' OR r->'resultado' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Otro senderista: %', r; END IF;
    r := hu50_prueba.leer('99999999-9999-4999-8999-999999999999', hu50_prueba.resc(1));
    IF r->>'codigo' <> 'OK' OR r->'resultado' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Incidente inexistente: %', r; END IF;
    RAISE NOTICE 'OK 5: otro rescatista, un senderista e incidente inexistente reciben NULL';
END $$;

-- 6) Relevo: el responsable anterior pierde el acceso y el nuevo lo recibe.
DO $$
DECLARE
    r JSONB;
BEGIN
    RESET ROLE;
    UPDATE public.incidentes SET responsable_id = hu50_prueba.resc(2), version = version + 1 WHERE id = hu50_prueba.inc(2);
    SET LOCAL ROLE service_role;

    r := hu50_prueba.leer(hu50_prueba.inc(2), hu50_prueba.resc(1));
    IF r->>'codigo' <> 'OK' OR r->'resultado' IS DISTINCT FROM 'null'::jsonb THEN
        RAISE EXCEPTION 'El responsable anterior no debe recibir datos: %', r;
    END IF;
    r := hu50_prueba.leer(hu50_prueba.inc(2), hu50_prueba.resc(2));
    IF r->>'codigo' <> 'OK' OR r->'resultado'->>'cargaCifrada' <> 'CIFRADO-SECRETO-H50-2' THEN
        RAISE EXCEPTION 'El nuevo responsable debe recibir datos: %', r;
    END IF;
    r := hu50_prueba.contexto(hu50_prueba.inc(2), hu50_prueba.resc(2));
    IF r->'resultado'->'incidente'->>'responsableId' <> hu50_prueba.resc(2)::text THEN
        RAISE EXCEPTION 'El contexto debe mostrar al nuevo responsable: %', r;
    END IF;
    RAISE NOTICE 'OK 6: tras el relevo, el anterior recibe NULL y el nuevo recibe los datos';
END $$;

-- 7) Incidente localizado: datos; incidente cerrado: NULL.
DO $$
DECLARE
    r JSONB;
BEGIN
    RESET ROLE;
    UPDATE public.incidentes SET estado = 'localizado', version = version + 1 WHERE id = hu50_prueba.inc(3);
    SET LOCAL ROLE service_role;
    r := hu50_prueba.leer(hu50_prueba.inc(3), hu50_prueba.resc(1));
    IF r->>'codigo' <> 'OK' OR r->'resultado'->>'cargaCifrada' <> 'CIFRADO-SECRETO-H50-3' THEN
        RAISE EXCEPTION 'Localizado debe dar datos: %', r;
    END IF;
    r := hu50_prueba.contexto(hu50_prueba.inc(3), hu50_prueba.resc(1));
    IF r->'resultado'->'incidente'->>'estado' <> 'localizado' THEN RAISE EXCEPTION 'Estado: %', r; END IF;

    RESET ROLE;
    UPDATE public.incidentes SET estado = 'cerrado', cerrado_en = now(), version = version + 1 WHERE id = hu50_prueba.inc(3);
    SET LOCAL ROLE service_role;
    r := hu50_prueba.leer(hu50_prueba.inc(3), hu50_prueba.resc(1));
    IF r->>'codigo' <> 'OK' OR r->'resultado' IS DISTINCT FROM 'null'::jsonb THEN
        RAISE EXCEPTION 'Cerrado debe dar NULL: %', r;
    END IF;
    r := hu50_prueba.contexto(hu50_prueba.inc(3), hu50_prueba.resc(1));
    IF r->'resultado'->'incidente'->>'estado' <> 'cerrado' THEN RAISE EXCEPTION 'Estado cerrado: %', r; END IF;
    RAISE NOTICE 'OK 7: un incidente localizado entrega los datos; al cerrarse, la guarda devuelve NULL y el contexto informa estado cerrado';
END $$;

-- 8) Consentimiento revocado (la ficha deja de existir) o ficha inexistente.
DO $$
DECLARE
    r JSONB;
BEGIN
    r := hu50_prueba.leer(hu50_prueba.inc(6), hu50_prueba.resc(1));
    IF r->'resultado'->>'cargaCifrada' <> 'CIFRADO-SECRETO-H50-6' THEN RAISE EXCEPTION 'Antes de revocar: %', r; END IF;
    RESET ROLE;
    DELETE FROM public.fichas_medicas WHERE senderista_id = hu50_prueba.sen(6);
    SET LOCAL ROLE service_role;
    r := hu50_prueba.leer(hu50_prueba.inc(6), hu50_prueba.resc(1));
    IF r->>'codigo' <> 'OK' OR r->'resultado' IS DISTINCT FROM 'null'::jsonb THEN
        RAISE EXCEPTION 'Sin ficha debe dar NULL: %', r;
    END IF;
    r := hu50_prueba.contexto(hu50_prueba.inc(6), hu50_prueba.resc(1));
    IF (r->'resultado'->>'consentimientoVigente')::BOOLEAN IS NOT FALSE THEN RAISE EXCEPTION 'Contexto sin ficha: %', r; END IF;
    -- Senderista que nunca tuvo ficha.
    r := hu50_prueba.leer(hu50_prueba.inc(8), hu50_prueba.resc(1));
    IF r->>'codigo' <> 'OK' OR r->'resultado' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Nunca tuvo ficha: %', r; END IF;
    r := hu50_prueba.contexto(hu50_prueba.inc(8), hu50_prueba.resc(1));
    IF (r->'resultado'->>'consentimientoVigente')::BOOLEAN IS NOT FALSE THEN RAISE EXCEPTION 'Contexto sin ficha (8): %', r; END IF;
    RAISE NOTICE 'OK 8: sin ficha con consentimiento, la guarda devuelve NULL y el contexto informa consentimientoVigente=false';
END $$;

-- 9) Auditoría: filas permitida y denegadas con todos sus campos y hora del servidor.
DO $$
DECLARE
    r JSONB;
    v_hora TIMESTAMPTZ;
    v_fila public.accesos_ficha_medica%ROWTYPE;
BEGIN
    r := hu50_prueba.registrar(hu50_prueba.inc(1), hu50_prueba.resc(1), 'permitido', 'RESPONSABLE_VIGENTE');
    IF r->>'codigo' <> 'OK' THEN RAISE EXCEPTION 'Permitido: %', r; END IF;
    r := r->'resultado';
    IF r->>'incidenteId' <> hu50_prueba.inc(1)::text OR r->>'expedicionId' <> hu50_prueba.exp(1)::text
       OR r->>'senderistaId' <> hu50_prueba.sen(1)::text OR r->>'actorId' <> hu50_prueba.resc(1)::text
       OR r->>'resultado' <> 'permitido' OR r->>'motivo' <> 'RESPONSABLE_VIGENTE'
       OR r->>'id' IS NULL OR r->>'registradoEn' IS NULL THEN
        RAISE EXCEPTION 'Fila permitida inesperada: %', r;
    END IF;
    v_hora := (r->>'registradoEn')::timestamptz;
    IF abs(extract(epoch FROM (clock_timestamp() - v_hora))) > 60 THEN RAISE EXCEPTION 'Hora fuera de rango: %', v_hora; END IF;

    r := hu50_prueba.registrar(hu50_prueba.inc(1), hu50_prueba.resc(2), 'denegado', 'NO_ES_RESPONSABLE');
    IF r->>'codigo' <> 'OK' OR r->'resultado'->>'resultado' <> 'denegado' OR r->'resultado'->>'motivo' <> 'NO_ES_RESPONSABLE'
       OR r->'resultado'->>'actorId' <> hu50_prueba.resc(2)::text
       OR r->'resultado'->>'senderistaId' <> hu50_prueba.sen(1)::text THEN
        RAISE EXCEPTION 'Fila denegada inesperada: %', r;
    END IF;

    -- Un INSERT directo con una hora falsa se sobrescribe con la del servidor.
    INSERT INTO public.accesos_ficha_medica (incidente_id, actor_id, resultado, motivo, registrado_en)
    VALUES (hu50_prueba.inc(1), hu50_prueba.resc(3), 'denegado', 'NO_ES_RESCATISTA', '2000-01-01T00:00:00Z')
    RETURNING * INTO v_fila;
    IF v_fila.registrado_en < now() - interval '1 minute' THEN
        RAISE EXCEPTION 'registrado_en no lo fijó el servidor: %', v_fila.registrado_en;
    END IF;

    -- Incidente inexistente: expedición y senderista quedan nulos.
    r := hu50_prueba.registrar('99999999-9999-4999-8999-999999999999', hu50_prueba.resc(1), 'denegado', 'INCIDENTE_NO_ENCONTRADO');
    IF r->>'codigo' <> 'OK' OR r->'resultado'->'expedicionId' IS DISTINCT FROM 'null'::jsonb
       OR r->'resultado'->'senderistaId' IS DISTINCT FROM 'null'::jsonb THEN
        RAISE EXCEPTION 'Incidente inexistente: %', r;
    END IF;
    IF (SELECT count(*) FROM public.accesos_ficha_medica WHERE incidente_id = hu50_prueba.inc(1)) <> 3 THEN
        RAISE EXCEPTION 'Debía haber 3 filas del incidente 1';
    END IF;
    RAISE NOTICE 'OK 9: las filas permitida y denegada llevan incidente, expedición, senderista, actor, resultado, motivo y hora del servidor; un INSERT con hora falsa se corrige; sin incidente, expedición y senderista son NULL';
END $$;

-- 10) Validaciones de la RPC de registro y de las lecturas.
DO $$
DECLARE
    r JSONB;
    v_n BIGINT;
    v_inc UUID := hu50_prueba.inc(1);
    v_act UUID := hu50_prueba.resc(1);
BEGIN
    SELECT count(*) INTO v_n FROM public.accesos_ficha_medica;
    FOR r IN SELECT x FROM unnest(ARRAY[
        hu50_prueba.registrar(NULL, v_act, 'denegado', 'NO_ES_RESPONSABLE'),
        hu50_prueba.registrar(v_inc, NULL, 'denegado', 'NO_ES_RESPONSABLE'),
        hu50_prueba.registrar(v_inc, v_act, NULL, 'NO_ES_RESPONSABLE'),
        hu50_prueba.registrar(v_inc, v_act, 'denegado', NULL),
        hu50_prueba.registrar(v_inc, v_act, 'quizas', 'NO_ES_RESPONSABLE'),
        hu50_prueba.registrar(v_inc, v_act, 'denegado', 'MOTIVO_INVENTADO'),
        hu50_prueba.registrar(v_inc, v_act, 'permitido', 'NO_ES_RESPONSABLE'),
        hu50_prueba.registrar(v_inc, v_act, 'denegado', 'RESPONSABLE_VIGENTE'),
        hu50_prueba.contexto(NULL, v_act),
        hu50_prueba.contexto(v_inc, NULL),
        hu50_prueba.leer(NULL, v_act),
        hu50_prueba.leer(v_inc, NULL),
        hu50_prueba.anonimizar(NULL, ARRAY[hu50_prueba.exp(9)]),
        hu50_prueba.anonimizar(hu50_prueba.sen(9), NULL)
    ]) AS t(x) LOOP
        IF r->>'codigo' <> 'DATOS_INVALIDOS' THEN RAISE EXCEPTION 'Esperaba DATOS_INVALIDOS y llegó %', r; END IF;
    END LOOP;
    IF (SELECT count(*) FROM public.accesos_ficha_medica) <> v_n THEN RAISE EXCEPTION 'Los rechazos no deben escribir'; END IF;

    -- Un permitido sobre un incidente inexistente viola el CHECK (expedición y senderista nulos).
    BEGIN
        PERFORM public.treksafe_registrar_acceso_ficha_medica(
            '99999999-9999-4999-8999-999999999999', v_act, 'permitido', 'RESPONSABLE_VIGENTE');
        RAISE EXCEPTION 'Un permitido sin incidente debía violar el CHECK';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    RAISE NOTICE 'OK 10: parámetros nulos, resultado o motivo fuera del catálogo e incoherencias dan DATOS_INVALIDOS sin escribir; un permitido sobre un incidente inexistente viola el CHECK';
END $$;

-- 11) Solo anexado y cascada del ARCO.
DO $$
DECLARE
    v_n BIGINT;
BEGIN
    BEGIN
        UPDATE public.accesos_ficha_medica SET motivo = motivo;
        RAISE EXCEPTION 'service_role pudo actualizar';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
        DELETE FROM public.accesos_ficha_medica;
        RAISE EXCEPTION 'service_role pudo borrar';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
        TRUNCATE public.accesos_ficha_medica;
        RAISE EXCEPTION 'service_role pudo truncar';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;

    RESET ROLE;
    BEGIN
        UPDATE public.accesos_ficha_medica SET motivo = motivo;
        RAISE EXCEPTION 'El UPDATE no fue rechazado';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM <> 'ACCESO_FICHA_INMUTABLE' THEN RAISE; END IF;
    END;
    BEGIN
        DELETE FROM public.accesos_ficha_medica;
        RAISE EXCEPTION 'El DELETE directo no fue rechazado';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM <> 'ACCESO_FICHA_INMUTABLE' THEN RAISE; END IF;
    END;
    BEGIN
        TRUNCATE public.accesos_ficha_medica;
        RAISE EXCEPTION 'El TRUNCATE no fue rechazado';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM <> 'ACCESO_FICHA_INMUTABLE' THEN RAISE; END IF;
    END;

    -- Cascada del ARCO: borrar la cuenta del senderista 5 arrastra sus accesos.
    INSERT INTO public.accesos_ficha_medica (incidente_id, expedicion_id, senderista_id, actor_id, resultado, motivo)
    VALUES (hu50_prueba.inc(5), hu50_prueba.exp(5), hu50_prueba.sen(5), hu50_prueba.resc(1), 'permitido', 'RESPONSABLE_VIGENTE'),
           (hu50_prueba.inc(5), hu50_prueba.exp(5), hu50_prueba.sen(5), hu50_prueba.resc(2), 'denegado', 'NO_ES_RESPONSABLE');
    SELECT count(*) INTO v_n FROM public.accesos_ficha_medica;
    DELETE FROM public.usuarios WHERE id = hu50_prueba.sen(5);
    IF EXISTS (SELECT 1 FROM public.accesos_ficha_medica WHERE senderista_id = hu50_prueba.sen(5)) THEN
        RAISE EXCEPTION 'La cascada no borró los accesos del senderista';
    END IF;
    IF (SELECT count(*) FROM public.accesos_ficha_medica) <> v_n - 2 THEN
        RAISE EXCEPTION 'La cascada solo debía borrar las dos filas del senderista 5';
    END IF;
    RAISE NOTICE 'OK 11: UPDATE, DELETE directo y TRUNCATE dan ACCESO_FICHA_INMUTABLE; service_role no puede actualizar, borrar ni truncar; DELETE FROM usuarios arrastra solo los accesos de ese senderista';
END $$;
SET LOCAL ROLE service_role;

-- 12) Ninguna columna parece médica y las filas no contienen los valores de prueba.
DO $$
DECLARE
    v_texto TEXT;
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'accesos_ficha_medica'
          AND column_name ~* 'sangre|alergi|condicion|medicament|cifrad|carga|salud|diagnostic'
    ) THEN
        RAISE EXCEPTION 'accesos_ficha_medica no debe tener columnas de salud';
    END IF;
    SELECT string_agg(to_jsonb(a)::text, ' ') INTO v_texto FROM public.accesos_ficha_medica a;
    IF v_texto IS NULL OR v_texto LIKE '%CIFRADO-SECRETO%' OR v_texto LIKE '%"AB-"%' THEN
        RAISE EXCEPTION 'Las filas de auditoría no deben contener datos de salud';
    END IF;
    RAISE NOTICE 'OK 12: ninguna columna de la auditoría es médica y to_jsonb de sus filas no contiene el tipo de sangre ni el texto cifrado de prueba';
END $$;

-- 13) ARCO: anonimizar las notas de avance de las expediciones cerradas.
DO $$
DECLARE
    r JSONB;
BEGIN
    BEGIN
        UPDATE public.avances_expedicion SET nota = NULL;
        RAISE EXCEPTION 'service_role pudo actualizar avances_expedicion';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
        PERFORM 1 FROM public.avances_expedicion;
        RAISE EXCEPTION 'service_role pudo leer avances_expedicion';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;

    -- El senderista 9 tiene expediciones completada (9), cancelada (10) y en alerta (11).
    r := hu50_prueba.anonimizar(hu50_prueba.sen(9),
        ARRAY[hu50_prueba.exp(9), hu50_prueba.exp(10), hu50_prueba.exp(11), hu50_prueba.exp(12)]);
    IF r->>'codigo' <> 'OK' OR (r->>'resultado')::INTEGER <> 2 THEN
        RAISE EXCEPTION 'Debía limpiar 2 notas (completada y cancelada): %', r;
    END IF;
    -- Idempotente: ya no quedan notas por limpiar.
    r := hu50_prueba.anonimizar(hu50_prueba.sen(9),
        ARRAY[hu50_prueba.exp(9), hu50_prueba.exp(10), hu50_prueba.exp(11), hu50_prueba.exp(12)]);
    IF (r->>'resultado')::INTEGER <> 0 THEN RAISE EXCEPTION 'Segunda llamada: %', r; END IF;
    -- Lista vacía de expediciones: no hace nada.
    r := hu50_prueba.anonimizar(hu50_prueba.sen(9), ARRAY[]::UUID[]);
    IF r->>'codigo' <> 'OK' OR (r->>'resultado')::INTEGER <> 0 THEN RAISE EXCEPTION 'Lista vacía: %', r; END IF;

    -- La expedición en alerta (11) conserva su nota aunque se pase su id.
    r := hu50_prueba.anonimizar(hu50_prueba.sen(9), ARRAY[hu50_prueba.exp(11)]);
    IF (r->>'resultado')::INTEGER <> 0 THEN RAISE EXCEPTION 'La expedición en alerta no se anonimiza: %', r; END IF;
    -- Las notas de otro senderista quedan intactas aunque se pase su expedición.
    r := hu50_prueba.anonimizar(hu50_prueba.sen(9), ARRAY[hu50_prueba.exp(12)]);
    IF (r->>'resultado')::INTEGER <> 0 THEN RAISE EXCEPTION 'Notas de otro senderista: %', r; END IF;

    RESET ROLE;
    IF (SELECT nota FROM public.avances_expedicion WHERE expedicion_id = hu50_prueba.exp(11)) IS DISTINCT FROM 'Nota libre del avance 11' THEN
        RAISE EXCEPTION 'La nota de la expedición en alerta cambió';
    END IF;
    IF (SELECT nota FROM public.avances_expedicion WHERE expedicion_id = hu50_prueba.exp(12)) IS DISTINCT FROM 'Nota libre del avance 12' THEN
        RAISE EXCEPTION 'La nota del otro senderista cambió';
    END IF;
    IF EXISTS (SELECT 1 FROM public.avances_expedicion WHERE expedicion_id IN (hu50_prueba.exp(9), hu50_prueba.exp(10)) AND nota IS NOT NULL) THEN
        RAISE EXCEPTION 'Quedaron notas en expediciones completada o cancelada';
    END IF;
    SET LOCAL ROLE service_role;
    RAISE NOTICE 'OK 13: ARCO limpia las notas de las expediciones completada y cancelada (devuelve 2, luego 0); conserva la de la expedición en alerta y la de otro senderista; service_role no accede directo a avances_expedicion; parámetros nulos dan DATOS_INVALIDOS';
END $$;

-- 14) Registro de la migración.
DO $$
BEGIN
    RESET ROLE;
    IF to_regclass('public.treksafe_migraciones') IS NULL THEN
        RAISE EXCEPTION 'Falta treksafe_migraciones (aplicar 000 antes)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.treksafe_migraciones
        WHERE version = '029' AND nombre = 'hu50_ficha_medica_responsable' AND hu = 'HU-50') THEN
        RAISE EXCEPTION '029 no quedó registrada';
    END IF;
    IF obj_description('public.auditoria_acceso_medico'::REGCLASS, 'pg_class') NOT LIKE 'Legado (HU-18)%' THEN
        RAISE EXCEPTION 'Falta el COMMENT de la tabla legada';
    END IF;
    RAISE NOTICE 'OK 14: la 029 quedó registrada en treksafe_migraciones y la tabla legada quedó marcada como no escrita';
END $$;

ROLLBACK;

-- HU-32: puntos intermedios. Aplicar una sola vez, despues del esquema base
-- y de la migracion de version del plan acordada con HU-26.
-- No crea ni sustituye la version compartida. Ver README.md de esta carpeta.
BEGIN;

DO $precondicion$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_attribute
        WHERE attrelid = pg_catalog.to_regclass('public.expediciones')
          AND attname = 'version' AND atttypid = 'bigint'::regtype
          AND attnotnull AND atthasdef AND NOT attisdropped
    ) THEN
        RAISE EXCEPTION 'HU32_VERSION_REQUERIDA: se requiere expediciones.version BIGINT NOT NULL con default'
            USING HINT = 'Coordinar la version unica del plan con Favio y Sebastian antes de aplicar HU-32.';
    END IF;
END;
$precondicion$;

-- Mantener la version dentro de los enteros seguros de JavaScript.
ALTER TABLE public.expediciones ADD CONSTRAINT hu32_chk_version_segura
    CHECK (version BETWEEN 1 AND 9007199254740991);

CREATE FUNCTION public.treksafe_normalizar_nombre_punto(p_nombre text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT
SET search_path = pg_catalog, pg_temp
AS $func$
    -- Mismo conjunto de espacios exteriores que String.trim() de JavaScript.
    SELECT btrim(p_nombre, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
$func$;

CREATE TABLE public.puntos_ruta (
    id uuid PRIMARY KEY,
    expedicion_id uuid NOT NULL REFERENCES public.expediciones(id) ON DELETE CASCADE,
    nombre text NOT NULL,
    latitud numeric(8,5) NOT NULL,
    longitud numeric(8,5) NOT NULL,
    orden smallint NOT NULL,
    CONSTRAINT hu32_chk_id_v4 CHECK (
        id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ),
    CONSTRAINT hu32_chk_nombre CHECK (
        char_length(nombre) BETWEEN 1 AND 100
        AND nombre = public.treksafe_normalizar_nombre_punto(nombre)
    ),
    CONSTRAINT hu32_chk_latitud CHECK (latitud BETWEEN -18.5 AND 0.5),
    CONSTRAINT hu32_chk_longitud CHECK (longitud BETWEEN -81.5 AND -68.5),
    CONSTRAINT hu32_chk_orden CHECK (orden BETWEEN 1 AND 20),
    CONSTRAINT hu32_uq_expedicion_orden UNIQUE (expedicion_id, orden)
        DEFERRABLE INITIALLY IMMEDIATE
);

COMMENT ON TABLE public.puntos_ruta IS
    'HU-32. IDs estables. Escritura exclusiva por RPC que bloquea el plan y valida la coleccion completa.';

-- Validador puro: no accede a tablas ni expresa estados HTTP.
CREATE FUNCTION public.treksafe_validar_puntos_ruta(p_puntos jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $func$
DECLARE
    v_punto jsonb;
    v_indice integer := 0;
    v_cantidad integer;
    v_prefijo text;
    v_nombre text;
    v_id uuid;
    v_orden numeric;
    v_detalles jsonb := '{}'::jsonb;
    v_errores_punto jsonb;
    v_normalizados jsonb := '[]'::jsonb;
BEGIN
    IF jsonb_typeof(p_puntos) IS DISTINCT FROM 'array' THEN
        RETURN jsonb_build_object('tipo', 'datos_invalidos', 'detalles',
            jsonb_build_object('puntos', jsonb_build_array('Los puntos deben ser un arreglo')));
    END IF;
    v_cantidad := jsonb_array_length(p_puntos);
    IF v_cantidad > 20 THEN
        RETURN jsonb_build_object('tipo', 'datos_invalidos', 'detalles',
            jsonb_build_object('puntos', jsonb_build_array('Se permiten hasta 20 puntos')));
    END IF;

    FOR v_punto IN SELECT value FROM jsonb_array_elements(p_puntos) LOOP
        v_prefijo := 'puntos.' || v_indice;
        v_errores_punto := '{}'::jsonb;
        IF jsonb_typeof(v_punto) IS DISTINCT FROM 'object' THEN
            v_detalles := v_detalles || jsonb_build_object(v_prefijo,
                jsonb_build_array('El punto debe ser un objeto'));
            v_indice := v_indice + 1;
            CONTINUE;
        END IF;

        IF EXISTS (SELECT 1 FROM jsonb_object_keys(v_punto) AS k(clave)
                   WHERE clave NOT IN ('id', 'nombre', 'latitud', 'longitud', 'orden')) THEN
            v_errores_punto := v_errores_punto || jsonb_build_object(v_prefijo,
                jsonb_build_array('El punto contiene propiedades desconocidas'));
        END IF;

        IF jsonb_typeof(v_punto->'id') IS DISTINCT FROM 'string'
           OR (v_punto->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
            v_errores_punto := v_errores_punto || jsonb_build_object(v_prefijo || '.id',
                jsonb_build_array('El identificador debe ser un UUID v4'));
        END IF;

        IF jsonb_typeof(v_punto->'nombre') IS DISTINCT FROM 'string' THEN
            v_errores_punto := v_errores_punto || jsonb_build_object(v_prefijo || '.nombre',
                jsonb_build_array('El nombre es obligatorio'));
        ELSE
            v_nombre := public.treksafe_normalizar_nombre_punto(v_punto->>'nombre');
            IF char_length(v_nombre) NOT BETWEEN 1 AND 100 THEN
                v_errores_punto := v_errores_punto || jsonb_build_object(v_prefijo || '.nombre',
                    jsonb_build_array('El nombre debe tener entre 1 y 100 caracteres'));
            END IF;
        END IF;

        IF jsonb_typeof(v_punto->'latitud') IS DISTINCT FROM 'number' THEN
            v_errores_punto := v_errores_punto || jsonb_build_object(v_prefijo || '.latitud',
                jsonb_build_array('La latitud debe ser un numero'));
        ELSIF (v_punto->>'latitud')::numeric NOT BETWEEN -18.5 AND 0.5 THEN
            v_errores_punto := v_errores_punto || jsonb_build_object(v_prefijo || '.latitud',
                jsonb_build_array('La latitud debe estar entre -18.5 y 0.5'));
        END IF;

        IF jsonb_typeof(v_punto->'longitud') IS DISTINCT FROM 'number' THEN
            v_errores_punto := v_errores_punto || jsonb_build_object(v_prefijo || '.longitud',
                jsonb_build_array('La longitud debe ser un numero'));
        ELSIF (v_punto->>'longitud')::numeric NOT BETWEEN -81.5 AND -68.5 THEN
            v_errores_punto := v_errores_punto || jsonb_build_object(v_prefijo || '.longitud',
                jsonb_build_array('La longitud debe estar entre -81.5 y -68.5'));
        END IF;

        IF jsonb_typeof(v_punto->'orden') IS DISTINCT FROM 'number' THEN
            v_errores_punto := v_errores_punto || jsonb_build_object(v_prefijo || '.orden',
                jsonb_build_array('El orden debe ser un entero entre 1 y la cantidad de puntos'));
        ELSE
            v_orden := (v_punto->>'orden')::numeric;
            IF v_orden <> trunc(v_orden) OR v_orden NOT BETWEEN 1 AND v_cantidad THEN
                v_errores_punto := v_errores_punto || jsonb_build_object(v_prefijo || '.orden',
                    jsonb_build_array('El orden debe ser un entero entre 1 y la cantidad de puntos'));
            END IF;
        END IF;

        v_detalles := v_detalles || v_errores_punto;
        IF v_errores_punto = '{}'::jsonb THEN
            v_id := (v_punto->>'id')::uuid;
            IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_normalizados) AS p
                       WHERE (p->>'id')::uuid = v_id) THEN
                v_detalles := v_detalles || jsonb_build_object(v_prefijo || '.id',
                    jsonb_build_array('El identificador esta repetido'));
            END IF;
            IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_normalizados) AS p
                       WHERE (p->>'orden')::numeric = v_orden) THEN
                v_detalles := v_detalles || jsonb_build_object(v_prefijo || '.orden',
                    jsonb_build_array('El orden debe ser unico y consecutivo'));
            END IF;
            v_normalizados := v_normalizados || jsonb_build_array(jsonb_build_object(
                'id', v_id, 'nombre', v_nombre,
                'latitud', round((v_punto->>'latitud')::numeric, 5),
                'longitud', round((v_punto->>'longitud')::numeric, 5),
                'orden', v_orden::smallint));
        END IF;
        v_indice := v_indice + 1;
    END LOOP;

    IF v_detalles <> '{}'::jsonb THEN
        RETURN jsonb_build_object('tipo', 'datos_invalidos', 'detalles', v_detalles);
    END IF;
    SELECT coalesce(jsonb_agg(p ORDER BY (p->>'orden')::integer), '[]'::jsonb)
    INTO v_normalizados FROM jsonb_array_elements(v_normalizados) AS p;
    RETURN jsonb_build_object('tipo', 'valida', 'puntos', v_normalizados);
END;
$func$;

-- Una sola sentencia garantiza una fotografia consistente de plan y puntos.
CREATE FUNCTION public.treksafe_consultar_puntos_ruta(p_senderista_id uuid, p_expedicion_id uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $func$
    SELECT jsonb_build_object(
        'expedicion', jsonb_build_object(
            'id', e.id, 'estado', e.estado,
            'lugarInicio', e.lugar_inicio, 'lugarFin', e.lugar_fin,
            'coordenadasInicio', e.coordenadas_inicio, 'coordenadasFin', e.coordenadas_fin,
            'horaInicio', e.hora_inicio, 'version', e.version,
            'editable', e.estado::text = 'programada' AND e.hora_inicio > clock_timestamp()),
        'puntos', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'id', p.id, 'nombre', p.nombre, 'latitud', p.latitud,
                'longitud', p.longitud, 'orden', p.orden) ORDER BY p.orden)
            FROM public.puntos_ruta AS p WHERE p.expedicion_id = e.id
        ), '[]'::jsonb))
    FROM public.expediciones AS e
    WHERE e.id = p_expedicion_id AND e.senderista_id = p_senderista_id;
$func$;

CREATE FUNCTION public.treksafe_guardar_puntos_ruta(
    p_senderista_id uuid, p_expedicion_id uuid,
    p_version_esperada bigint, p_puntos jsonb
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $func$
DECLARE
    v_plan public.expediciones%ROWTYPE;
    v_validacion jsonb;
    v_puntos jsonb;
    v_ruta jsonb;
    v_constraint text;
BEGIN
    IF p_version_esperada IS NULL OR p_version_esperada NOT BETWEEN 1 AND 9007199254740991 THEN
        RETURN jsonb_build_object('tipo', 'datos_invalidos', 'detalles',
            jsonb_build_object('versionEsperada', jsonb_build_array('La version debe ser un entero positivo seguro')));
    END IF;
    v_validacion := public.treksafe_validar_puntos_ruta(p_puntos);
    IF v_validacion->>'tipo' = 'datos_invalidos' THEN
        RETURN v_validacion;
    END IF;
    v_puntos := v_validacion->'puntos';

    SELECT * INTO v_plan FROM public.expediciones
    WHERE id = p_expedicion_id AND senderista_id = p_senderista_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('tipo', 'no_encontrado');
    END IF;
    IF v_plan.estado::text <> 'programada' THEN
        RETURN jsonb_build_object('tipo', 'expedicion_no_editable');
    END IF;
    IF v_plan.hora_inicio <= clock_timestamp() THEN
        RETURN jsonb_build_object('tipo', 'expedicion_ya_iniciada');
    END IF;
    IF v_plan.version <> p_version_esperada THEN
        RETURN jsonb_build_object('tipo', 'version_obsoleta');
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.puntos_ruta AS p
        JOIN jsonb_to_recordset(v_puntos) AS nuevo(id uuid) ON nuevo.id = p.id
        WHERE p.expedicion_id <> p_expedicion_id
    ) THEN
        RETURN jsonb_build_object('tipo', 'datos_invalidos', 'detalles',
            jsonb_build_object('puntos', jsonb_build_array('Hay identificadores de punto no disponibles')));
    END IF;

    v_ruta := public.treksafe_consultar_puntos_ruta(p_senderista_id, p_expedicion_id);
    IF v_ruta->'puntos' = v_puntos THEN
        RETURN jsonb_build_object('tipo', 'guardado', 'ruta', v_ruta);
    END IF;
    IF v_plan.version = 9007199254740991 THEN
        RAISE EXCEPTION 'Se agoto el rango de version del plan';
    END IF;

    -- Subtransaccion: incluso una colision concurrente de UUID revierte todas
    -- las bajas y modificaciones anteriores antes de devolver el rechazo.
    BEGIN
        SET CONSTRAINTS public.hu32_uq_expedicion_orden DEFERRED;
        DELETE FROM public.puntos_ruta AS p
        WHERE p.expedicion_id = p_expedicion_id
          AND NOT EXISTS (SELECT 1 FROM jsonb_to_recordset(v_puntos) AS n(id uuid) WHERE n.id = p.id);

        UPDATE public.puntos_ruta AS p
        SET nombre = n.nombre, latitud = n.latitud, longitud = n.longitud, orden = n.orden
        FROM jsonb_to_recordset(v_puntos) AS n(id uuid, nombre text, latitud numeric, longitud numeric, orden smallint)
        WHERE p.id = n.id AND p.expedicion_id = p_expedicion_id
          AND ROW(p.nombre, p.latitud, p.longitud, p.orden)
              IS DISTINCT FROM ROW(n.nombre, n.latitud, n.longitud, n.orden);

        INSERT INTO public.puntos_ruta(id, expedicion_id, nombre, latitud, longitud, orden)
        SELECT n.id, p_expedicion_id, n.nombre, n.latitud, n.longitud, n.orden
        FROM jsonb_to_recordset(v_puntos) AS n(id uuid, nombre text, latitud numeric, longitud numeric, orden smallint)
        WHERE NOT EXISTS (SELECT 1 FROM public.puntos_ruta AS p WHERE p.id = n.id);

        -- Si otro plan inserto el mismo UUID mientras esperabamos, no puede
        -- interpretarse como un punto de este plan ni omitirse silenciosamente.
        IF EXISTS (
            SELECT 1 FROM jsonb_to_recordset(v_puntos) AS n(id uuid)
            WHERE NOT EXISTS (SELECT 1 FROM public.puntos_ruta AS p
                              WHERE p.id = n.id AND p.expedicion_id = p_expedicion_id)
        ) THEN
            RAISE unique_violation USING CONSTRAINT = 'puntos_ruta_pkey';
        END IF;
        SET CONSTRAINTS public.hu32_uq_expedicion_orden IMMEDIATE;

        UPDATE public.expediciones SET version = version + 1, actualizado_en = clock_timestamp()
        WHERE id = p_expedicion_id;
    EXCEPTION WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
        IF v_constraint <> 'puntos_ruta_pkey' THEN
            RAISE;
        END IF;
        RETURN jsonb_build_object('tipo', 'datos_invalidos', 'detalles',
            jsonb_build_object('puntos', jsonb_build_array('Hay identificadores de punto no disponibles')));
    END;

    RETURN jsonb_build_object('tipo', 'guardado', 'ruta',
        public.treksafe_consultar_puntos_ruta(p_senderista_id, p_expedicion_id));
END;
$func$;

ALTER TABLE public.puntos_ruta ENABLE ROW LEVEL SECURITY;
CREATE POLICY hu32_deny_cliente ON public.puntos_ruta
    FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- Supabase concede privilegios por defecto: revocarlos explicitamente.
-- service_role solo ejecuta las dos RPC; no escribe la tabla directamente.
REVOKE ALL ON TABLE public.puntos_ruta FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.treksafe_normalizar_nombre_punto(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.treksafe_validar_puntos_ruta(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.treksafe_consultar_puntos_ruta(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.treksafe_guardar_puntos_ruta(uuid, uuid, bigint, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.treksafe_consultar_puntos_ruta(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.treksafe_guardar_puntos_ruta(uuid, uuid, bigint, jsonb) TO service_role;

COMMIT;

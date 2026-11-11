-- DEP-04: creación transaccional; requiere 002 y 014. No modifica contratos HTTP.
BEGIN;

-- La restricción cubre también promociones del cron legado y otros escritores.
-- Si ya hay datos contradictorios, abortar para inspección; nunca borrarlos.
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM public.expediciones
        WHERE estado IN ('en_progreso', 'alerta') GROUP BY senderista_id HAVING count(*) > 1) THEN
        RAISE EXCEPTION 'EXPEDICIONES_BLOQUEANTES_DUPLICADAS';
    END IF;
END $$;
CREATE UNIQUE INDEX uq_expedicion_bloqueante_senderista ON public.expediciones(senderista_id)
    WHERE estado IN ('en_progreso', 'alerta');

CREATE FUNCTION public.treksafe_crear_expedicion(p_senderista_id UUID, p_datos JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
    v_exp public.expediciones%ROWTYPE;
    v_inicio TIMESTAMPTZ;
    v_retorno TIMESTAMPTZ;
    v_ahora TIMESTAMPTZ;
    v_tolerancia INTEGER;
    v_recordatorio INTEGER;
    v_contactos UUID[];
    v_acompanantes TEXT[];
    v_validos INTEGER;
    v_coord TEXT;
BEGIN
    IF p_senderista_id IS NULL OR p_datos IS NULL OR jsonb_typeof(p_datos) <> 'object' THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;
    -- Serialización por senderista: dos creaciones simultáneas no pueden decidir
    -- ambas que no existe una expedición bloqueante. El reloj se toma tras esperar.
    PERFORM ps.usuario_id FROM public.perfiles_senderista ps
    JOIN public.usuarios u ON u.id = ps.usuario_id AND u.rol = 'senderista'
    WHERE ps.usuario_id = p_senderista_id FOR UPDATE OF ps;
    IF NOT FOUND THEN RAISE EXCEPTION 'NO_ES_SENDERISTA'; END IF;
    IF EXISTS (SELECT 1 FROM public.expediciones
        WHERE senderista_id = p_senderista_id AND estado IN ('en_progreso', 'alerta')) THEN
        RAISE EXCEPTION 'EXPEDICION_ACTIVA_EXISTE';
    END IF;

    IF jsonb_typeof(p_datos->'idsContactos') IS DISTINCT FROM 'array'
        OR jsonb_typeof(p_datos->'nombresAcompanantes') IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;
    IF jsonb_array_length(p_datos->'idsContactos') = 0
        OR jsonb_array_length(p_datos->'nombresAcompanantes') = 0
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_datos->'idsContactos') x WHERE jsonb_typeof(x) <> 'string')
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_datos->'nombresAcompanantes') x WHERE jsonb_typeof(x) <> 'string')
        OR length(btrim(coalesce(p_datos->>'lugarInicio', ''))) NOT BETWEEN 2 AND 500
        OR length(btrim(coalesce(p_datos->>'lugarFin', ''))) NOT BETWEEN 2 AND 500 THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;
    BEGIN
        v_inicio := (p_datos->>'horaInicio')::timestamptz;
        v_retorno := (p_datos->>'horaRetornoEstimada')::timestamptz;
        v_tolerancia := (p_datos->>'minutosTolerancia')::integer;
        v_recordatorio := coalesce((p_datos->>'minutosRecordatorio')::integer, 30);
        SELECT array_agg(x::uuid) INTO v_contactos
            FROM jsonb_array_elements_text(p_datos->'idsContactos') AS x;
        SELECT array_agg(btrim(x)) INTO v_acompanantes
            FROM jsonb_array_elements_text(p_datos->'nombresAcompanantes') AS x;
    EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format
        OR datetime_field_overflow OR numeric_value_out_of_range THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END;
    FOREACH v_coord IN ARRAY ARRAY[p_datos->>'coordenadasInicio', p_datos->>'coordenadasFin'] LOOP
        IF v_coord IS NOT NULL AND v_coord <> '' THEN
            IF v_coord !~ '^\s*[+-]?[0-9]+(\.[0-9]+)?\s*,\s*[+-]?[0-9]+(\.[0-9]+)?\s*$' THEN
                RAISE EXCEPTION 'DATOS_INVALIDOS';
            END IF;
            IF abs(split_part(v_coord, ',', 1)::numeric) > 90
                OR abs(split_part(v_coord, ',', 2)::numeric) > 180 THEN
                RAISE EXCEPTION 'DATOS_INVALIDOS';
            END IF;
        END IF;
    END LOOP;
    IF v_tolerancia IS NULL OR v_tolerancia NOT BETWEEN 1 AND 480
        OR v_recordatorio NOT IN (15, 30, 60)
        OR EXISTS (SELECT 1 FROM unnest(v_acompanantes) x
            WHERE x IS NULL OR length(x) NOT BETWEEN 2 AND 200) THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;
    IF cardinality(v_contactos) <> (SELECT count(DISTINCT x) FROM unnest(v_contactos) x) THEN
        RAISE EXCEPTION 'CONTACTOS_INVALIDOS';
    END IF;
    -- Orden estable y SHARE conservan propiedad/existencia de contactos hasta
    -- insertar los vínculos. La FK resuelve la carrera con borrados concurrentes.
    PERFORM c.id FROM public.contactos_emergencia c
        WHERE c.id = ANY(v_contactos) AND c.senderista_id = p_senderista_id
        ORDER BY c.id FOR SHARE;
    GET DIAGNOSTICS v_validos = ROW_COUNT;
    IF v_validos <> cardinality(v_contactos) THEN RAISE EXCEPTION 'CONTACTOS_INVALIDOS'; END IF;
    -- Ninguna espera de bloqueo puede hacer válida una salida que ya ocurrió.
    v_ahora := clock_timestamp();
    IF v_inicio IS NULL OR NOT isfinite(v_inicio) OR v_inicio <= v_ahora THEN
        RAISE EXCEPTION 'HORA_INICIO_INVALIDA';
    END IF;
    IF v_retorno IS NULL OR NOT isfinite(v_retorno)
        OR v_retorno <= v_ahora OR v_retorno <= v_inicio THEN
        RAISE EXCEPTION 'HORA_RETORNO_INVALIDA';
    END IF;

    INSERT INTO public.expediciones (
        senderista_id, lugar_inicio, lugar_fin, coordenadas_inicio, coordenadas_fin,
        hora_inicio, hora_retorno_estimada, minutos_tolerancia, minutos_recordatorio, estado
    ) VALUES (
        p_senderista_id, p_datos->>'lugarInicio', p_datos->>'lugarFin',
        nullif(p_datos->>'coordenadasInicio', ''), nullif(p_datos->>'coordenadasFin', ''),
        v_inicio, v_retorno, v_tolerancia, v_recordatorio,
        CASE WHEN v_inicio <= v_ahora + interval '60 seconds'
            THEN 'en_progreso'::public.estado_expedicion_enum
            ELSE 'programada'::public.estado_expedicion_enum END
    ) RETURNING * INTO v_exp;
    INSERT INTO public.vinculos_expedicion_contacto (expedicion_id, contacto_id)
        SELECT v_exp.id, x FROM unnest(v_contactos) x;
    INSERT INTO public.acompanantes_expedicion (expedicion_id, nombre_acompanante)
        SELECT v_exp.id, x FROM unnest(v_acompanantes) x;
    RETURN to_jsonb(v_exp);
END;
$$;
REVOKE ALL ON FUNCTION public.treksafe_crear_expedicion(UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.treksafe_crear_expedicion(UUID, JSONB) TO service_role;
-- Índices de FK usados al consultar/limpiar las colecciones de la creación.
CREATE INDEX IF NOT EXISTS idx_acompanantes_expedicion ON public.acompanantes_expedicion(expedicion_id);
CREATE INDEX IF NOT EXISTS idx_vinculos_contacto ON public.vinculos_expedicion_contacto(contacto_id);
INSERT INTO public.treksafe_migraciones(version, nombre, hu)
VALUES ('022', 'dep108_crear_expedicion_atomica', 'DEP-04');
COMMIT;

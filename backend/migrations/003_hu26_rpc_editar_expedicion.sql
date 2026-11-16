-- =============================================================================
-- 003 · HU-26: edición atómica de una expedición programada
-- Requiere: 002_hu26_version_y_eventos_plan.sql.
-- Re-ejecutable: CREATE OR REPLACE y permisos idempotentes.
--
-- Errores de negocio: RAISE EXCEPTION con el código en MESSAGE.
--   EXPEDICION_NO_ENCONTRADA, PLAN_NO_EDITABLE, SALIDA_YA_INICIADA,
--   VERSION_OBSOLETA (versión actual en DETAIL), SALIDA_EN_PASADO,
--   RETORNO_INVALIDO, TOLERANCIA_INVALIDA, CONTACTOS_INVALIDOS, DATOS_INVALIDOS.
-- =============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.treksafe_editar_expedicion(
    p_expedicion_id     UUID,
    p_senderista_id     UUID,
    p_version_esperada  INTEGER,
    p_datos             JSONB,
    p_operacion_id      UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_exp               public.expediciones%ROWTYPE;
    v_evento            public.eventos_plan%ROWTYPE;
    v_lugar_inicio      TEXT;
    v_lugar_fin         TEXT;
    v_coord_inicio      TEXT;
    v_coord_fin         TEXT;
    v_hora_inicio       TIMESTAMPTZ;
    v_hora_retorno      TIMESTAMPTZ;
    v_tolerancia        INTEGER;
    v_contactos         UUID[];
    v_acompanantes      TEXT[];
    v_contactos_antes   UUID[];
    v_acompanantes_antes TEXT[];
    v_contactos_validos INTEGER;
    v_version_nueva     INTEGER;
    v_cambios           JSONB := '{}'::jsonb;
BEGIN
    -- a) Operación ya registrada: se devuelve su resultado sin aplicar nada.
    --    Un operacion_id de otro plan u otro senderista no revela nada ajeno.
    SELECT * INTO v_evento FROM public.eventos_plan WHERE operacion_id = p_operacion_id;
    IF FOUND THEN
        IF v_evento.expedicion_id <> p_expedicion_id OR v_evento.senderista_id <> p_senderista_id THEN
            RAISE EXCEPTION 'EXPEDICION_NO_ENCONTRADA';
        END IF;
        RETURN jsonb_build_object('id', v_evento.expedicion_id, 'version', v_evento.version_resultante);
    END IF;

    -- b) Bloqueo de la fila y comprobación de propietario.
    SELECT * INTO v_exp
    FROM public.expediciones
    WHERE id = p_expedicion_id AND senderista_id = p_senderista_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'EXPEDICION_NO_ENCONTRADA';
    END IF;

    -- Un reintento simultáneo pudo confirmarse mientras se esperaba el bloqueo.
    SELECT * INTO v_evento
    FROM public.eventos_plan
    WHERE operacion_id = p_operacion_id AND expedicion_id = p_expedicion_id;
    IF FOUND THEN
        RETURN jsonb_build_object('id', v_evento.expedicion_id, 'version', v_evento.version_resultante);
    END IF;

    -- c) Estado, salida y versión.
    IF v_exp.estado <> 'programada'::public.estado_expedicion_enum THEN
        RAISE EXCEPTION 'PLAN_NO_EDITABLE';
    END IF;
    IF v_exp.hora_inicio <= now() THEN
        RAISE EXCEPTION 'SALIDA_YA_INICIADA';
    END IF;
    IF v_exp.version <> p_version_esperada THEN
        RAISE EXCEPTION 'VERSION_OBSOLETA' USING DETAIL = v_exp.version::text;
    END IF;

    -- d) Validación de los datos nuevos.
    IF jsonb_typeof(p_datos) IS DISTINCT FROM 'object'
        OR jsonb_typeof(p_datos->'idsContactos') IS DISTINCT FROM 'array'
        OR jsonb_typeof(p_datos->'nombresAcompanantes') IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;

    v_lugar_inicio := btrim(p_datos->>'lugarInicio');
    v_lugar_fin := btrim(p_datos->>'lugarFin');
    v_coord_inicio := NULLIF(btrim(p_datos->>'coordenadasInicio'), '');
    v_coord_fin := NULLIF(btrim(p_datos->>'coordenadasFin'), '');

    BEGIN
        v_hora_inicio := (p_datos->>'horaInicio')::timestamptz;
        v_hora_retorno := (p_datos->>'horaRetornoEstimada')::timestamptz;
        v_tolerancia := (p_datos->>'minutosTolerancia')::integer;
        v_contactos := ARRAY(
            SELECT DISTINCT e.valor::uuid
            FROM jsonb_array_elements_text(p_datos->'idsContactos') AS e(valor)
            ORDER BY 1
        );
    EXCEPTION
        WHEN invalid_datetime_format OR datetime_field_overflow
            OR invalid_text_representation OR numeric_value_out_of_range THEN
            RAISE EXCEPTION 'DATOS_INVALIDOS';
    END;

    v_acompanantes := ARRAY(
        SELECT btrim(e.valor)
        FROM jsonb_array_elements_text(p_datos->'nombresAcompanantes') AS e(valor)
        WHERE btrim(e.valor) <> ''
        ORDER BY 1
    );

    IF COALESCE(v_lugar_inicio, '') = '' OR COALESCE(v_lugar_fin, '') = ''
        OR v_hora_inicio IS NULL OR v_hora_retorno IS NULL
        OR cardinality(v_acompanantes) = 0 THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;
    IF v_hora_inicio <= now() THEN
        RAISE EXCEPTION 'SALIDA_EN_PASADO';
    END IF;
    IF v_hora_retorno <= v_hora_inicio THEN
        RAISE EXCEPTION 'RETORNO_INVALIDO';
    END IF;
    IF v_tolerancia IS NULL OR v_tolerancia <= 0 THEN
        RAISE EXCEPTION 'TOLERANCIA_INVALIDA';
    END IF;

    SELECT count(*) INTO v_contactos_validos
    FROM public.contactos_emergencia
    WHERE senderista_id = p_senderista_id AND id = ANY (v_contactos);

    IF cardinality(v_contactos) = 0 OR v_contactos_validos <> cardinality(v_contactos) THEN
        RAISE EXCEPTION 'CONTACTOS_INVALIDOS';
    END IF;

    -- f) Se calculan los cambios antes de reemplazar los valores.
    v_contactos_antes := ARRAY(
        SELECT contacto_id
        FROM public.vinculos_expedicion_contacto
        WHERE expedicion_id = p_expedicion_id
        ORDER BY 1
    );
    v_acompanantes_antes := ARRAY(
        SELECT nombre_acompanante::text
        FROM public.acompanantes_expedicion
        WHERE expedicion_id = p_expedicion_id
        ORDER BY 1
    );

    IF v_exp.lugar_inicio::text IS DISTINCT FROM v_lugar_inicio THEN
        v_cambios := v_cambios || jsonb_build_object('lugarInicio',
            jsonb_build_object('antes', v_exp.lugar_inicio, 'despues', v_lugar_inicio));
    END IF;
    IF v_exp.lugar_fin::text IS DISTINCT FROM v_lugar_fin THEN
        v_cambios := v_cambios || jsonb_build_object('lugarFin',
            jsonb_build_object('antes', v_exp.lugar_fin, 'despues', v_lugar_fin));
    END IF;
    IF v_exp.coordenadas_inicio::text IS DISTINCT FROM v_coord_inicio THEN
        v_cambios := v_cambios || jsonb_build_object('coordenadasInicio',
            jsonb_build_object('antes', v_exp.coordenadas_inicio, 'despues', v_coord_inicio));
    END IF;
    IF v_exp.coordenadas_fin::text IS DISTINCT FROM v_coord_fin THEN
        v_cambios := v_cambios || jsonb_build_object('coordenadasFin',
            jsonb_build_object('antes', v_exp.coordenadas_fin, 'despues', v_coord_fin));
    END IF;
    IF v_exp.hora_inicio IS DISTINCT FROM v_hora_inicio THEN
        v_cambios := v_cambios || jsonb_build_object('horaInicio',
            jsonb_build_object('antes', v_exp.hora_inicio, 'despues', v_hora_inicio));
    END IF;
    IF v_exp.hora_retorno_estimada IS DISTINCT FROM v_hora_retorno THEN
        v_cambios := v_cambios || jsonb_build_object('horaRetornoEstimada',
            jsonb_build_object('antes', v_exp.hora_retorno_estimada, 'despues', v_hora_retorno));
    END IF;
    IF v_exp.minutos_tolerancia IS DISTINCT FROM v_tolerancia THEN
        v_cambios := v_cambios || jsonb_build_object('minutosTolerancia',
            jsonb_build_object('antes', v_exp.minutos_tolerancia, 'despues', v_tolerancia));
    END IF;
    IF v_contactos_antes IS DISTINCT FROM v_contactos THEN
        v_cambios := v_cambios || jsonb_build_object('idsContactos',
            jsonb_build_object('antes', to_jsonb(v_contactos_antes), 'despues', to_jsonb(v_contactos)));
    END IF;
    IF v_acompanantes_antes IS DISTINCT FROM v_acompanantes THEN
        v_cambios := v_cambios || jsonb_build_object('nombresAcompanantes',
            jsonb_build_object('antes', to_jsonb(v_acompanantes_antes), 'despues', to_jsonb(v_acompanantes)));
    END IF;

    -- Sin cambios no se escribe nada: ni versión, ni colecciones, ni evento.
    IF v_cambios = '{}'::jsonb THEN
        RETURN jsonb_build_object('id', p_expedicion_id, 'version', v_exp.version);
    END IF;

    -- e) Actualización del plan y reemplazo completo de sus colecciones.
    UPDATE public.expediciones
    SET lugar_inicio = v_lugar_inicio,
        lugar_fin = v_lugar_fin,
        coordenadas_inicio = v_coord_inicio,
        coordenadas_fin = v_coord_fin,
        hora_inicio = v_hora_inicio,
        hora_retorno_estimada = v_hora_retorno,
        minutos_tolerancia = v_tolerancia,
        version = version + 1,
        actualizado_en = now()
    WHERE id = p_expedicion_id
    RETURNING version INTO v_version_nueva;

    DELETE FROM public.vinculos_expedicion_contacto WHERE expedicion_id = p_expedicion_id;
    INSERT INTO public.vinculos_expedicion_contacto (expedicion_id, contacto_id)
    SELECT p_expedicion_id, c.contacto FROM unnest(v_contactos) AS c(contacto);

    DELETE FROM public.acompanantes_expedicion WHERE expedicion_id = p_expedicion_id;
    INSERT INTO public.acompanantes_expedicion (expedicion_id, nombre_acompanante)
    SELECT p_expedicion_id, a.nombre FROM unnest(v_acompanantes) AS a(nombre);

    INSERT INTO public.eventos_plan (
        expedicion_id, senderista_id, tipo, actor_id, version_resultante, cambios, operacion_id
    ) VALUES (
        p_expedicion_id, p_senderista_id, 'EDITADA', p_senderista_id,
        v_version_nueva, v_cambios, p_operacion_id
    );

    -- g) Resultado.
    RETURN jsonb_build_object('id', p_expedicion_id, 'version', v_version_nueva);
END;
$$;

COMMENT ON FUNCTION public.treksafe_editar_expedicion(UUID, UUID, INTEGER, JSONB, UUID) IS
    'HU-26: edita una expedición programada y registra su evento en una sola transacción.';

REVOKE ALL ON FUNCTION public.treksafe_editar_expedicion(UUID, UUID, INTEGER, JSONB, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.treksafe_editar_expedicion(UUID, UUID, INTEGER, JSONB, UUID)
    TO service_role;

DO $$
BEGIN
    IF to_regclass('public.treksafe_migraciones') IS NOT NULL THEN
        EXECUTE $sql$
            INSERT INTO public.treksafe_migraciones (version, nombre, hu)
            VALUES ('003', 'hu26_rpc_editar_expedicion', 'HU-26')
            ON CONFLICT (version) DO NOTHING
        $sql$;
    END IF;
END
$$;

COMMIT;

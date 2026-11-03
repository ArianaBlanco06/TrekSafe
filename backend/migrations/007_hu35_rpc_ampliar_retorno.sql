-- =============================================================================
-- 007 · HU-35: ampliación atómica del retorno antes del vencimiento
-- Requiere: 002_hu26_version_y_eventos_plan.sql.
-- Re-ejecutable: CREATE OR REPLACE y permisos idempotentes.
-- No depende de 000: registra la aplicación solo si treksafe_migraciones existe.
--
-- 1) treksafe_fecha_limite(hora, tolerancia): única definición SQL del límite
--    nuevo. Equivale a la expresión de treksafe_marcar_expiradas_en_progreso_como_alerta
--    (init_schema.sql), que no se reemplaza:
--        hora_retorno_estimada + (minutos_tolerancia || ' minutes')::interval
--    y a calcularFechaLimite (backend/src/domain/entities/Expedicion.ts):
--        horaRetornoEstimada + minutosTolerancia * 60 000 ms
--    Para un entero n, (n || ' minutes')::interval = make_interval(mins => n).
--
-- 2) treksafe_ampliar_retorno: suma de 1 a 120 minutos a hora_retorno_estimada de
--    una expedición en_progreso cuyo límite aún no venció, con compare-and-swap sobre
--    estado y versión, y registra el evento RETORNO_AMPLIADO.
--
-- Errores de negocio: RAISE EXCEPTION con el código en MESSAGE.
--   EXPEDICION_NO_ENCONTRADA, DATOS_INVALIDOS, RETORNO_NO_AMPLIABLE,
--   ALERTA_YA_DECLARADA, PLAZO_VENCIDO, VERSION_OBSOLETA (versión actual en DETAIL),
--   AMPLIACION_NO_DISPONIBLE.
--
-- Carrera con el cron: la fila se bloquea con FOR UPDATE y se compara el límite con
-- NOW(), el mismo reloj que usa el cron. El UPDATE del cron sobre la misma fila espera
-- al bloqueo y, al reevaluar su WHERE con la hora nueva, ya no la marca. Si el cron
-- confirmó primero, la fila está en 'alerta' y se responde ALERTA_YA_DECLARADA.
--
-- MAX_AMPLIACIONES = 1 (pendiente de confirmar por el Product Owner). Debe coincidir
-- con MAX_AMPLIACIONES de backend/src/domain/value-objects/ampliacionRetorno.ts.
-- =============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.treksafe_fecha_limite(
    p_hora_retorno_estimada  TIMESTAMPTZ,
    p_minutos_tolerancia     INTEGER
)
RETURNS TIMESTAMPTZ
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
    SELECT p_hora_retorno_estimada + make_interval(mins => p_minutos_tolerancia);
$$;

COMMENT ON FUNCTION public.treksafe_fecha_limite(TIMESTAMPTZ, INTEGER) IS
    'Límite de una expedición: hora_retorno_estimada + minutos_tolerancia. Equivale a la expresión del cron y a calcularFechaLimite (TS).';

REVOKE ALL ON FUNCTION public.treksafe_fecha_limite(TIMESTAMPTZ, INTEGER)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.treksafe_fecha_limite(TIMESTAMPTZ, INTEGER)
    TO service_role;

CREATE OR REPLACE FUNCTION public.treksafe_ampliar_retorno(
    p_expedicion_id     UUID,
    p_senderista_id     UUID,
    p_version_esperada  INTEGER,
    p_minutos           INTEGER,
    p_motivo            TEXT,
    p_operacion_id      UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    -- Pendiente de confirmar por el PO; igual que MAX_AMPLIACIONES en TypeScript.
    c_max_ampliaciones  CONSTANT INTEGER := 1;
    v_exp               public.expediciones%ROWTYPE;
    v_evento            public.eventos_plan%ROWTYPE;
    v_motivo            TEXT := btrim(p_motivo);
    v_hora_nueva        TIMESTAMPTZ;
    v_version_nueva     INTEGER;
    v_tolerancia        INTEGER;
    v_ampliaciones      INTEGER;
BEGIN
    -- a) Operación ya registrada: se devuelve su resultado sin aplicar nada.
    --    Un operacion_id de otro plan u otro senderista no revela nada ajeno.
    SELECT * INTO v_evento FROM public.eventos_plan WHERE operacion_id = p_operacion_id;
    IF FOUND THEN
        IF v_evento.expedicion_id <> p_expedicion_id OR v_evento.senderista_id <> p_senderista_id THEN
            RAISE EXCEPTION 'EXPEDICION_NO_ENCONTRADA';
        END IF;
        -- El mismo operacion_id ya se usó para otra operación del plan (p. ej. una edición).
        IF v_evento.tipo <> 'RETORNO_AMPLIADO' THEN
            RAISE EXCEPTION 'DATOS_INVALIDOS';
        END IF;
        -- La tolerancia no cambia en en_progreso (solo se edita una programada).
        -- Si el evento fue anonimizado (cambios = '{}'), se usa la hora actual del plan.
        SELECT minutos_tolerancia,
               COALESCE((v_evento.cambios->'horaRetornoEstimada'->>'despues')::timestamptz,
                        hora_retorno_estimada)
        INTO v_tolerancia, v_hora_nueva
        FROM public.expediciones WHERE id = v_evento.expedicion_id;
        RETURN jsonb_build_object(
            'id', v_evento.expedicion_id,
            'version', v_evento.version_resultante,
            'horaRetornoEstimada', v_hora_nueva,
            'fechaLimite', public.treksafe_fecha_limite(v_hora_nueva, v_tolerancia)
        );
    END IF;

    -- b) Datos de la ampliación.
    IF p_minutos IS NULL OR p_minutos < 1 OR p_minutos > 120 THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;
    IF v_motivo IS NULL OR char_length(v_motivo) < 3 OR char_length(v_motivo) > 200 THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;

    -- c) Bloqueo de la fila y comprobación de propietario.
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
        v_hora_nueva := (v_evento.cambios->'horaRetornoEstimada'->>'despues')::timestamptz;
        RETURN jsonb_build_object(
            'id', v_evento.expedicion_id,
            'version', v_evento.version_resultante,
            'horaRetornoEstimada', v_hora_nueva,
            'fechaLimite', public.treksafe_fecha_limite(v_hora_nueva, v_exp.minutos_tolerancia)
        );
    END IF;

    -- d) Estado: solo en_progreso. Si el cron ya declaró la alerta, se rechaza.
    IF v_exp.estado = 'alerta'::public.estado_expedicion_enum THEN
        RAISE EXCEPTION 'ALERTA_YA_DECLARADA';
    END IF;
    IF v_exp.estado <> 'en_progreso'::public.estado_expedicion_enum THEN
        RAISE EXCEPTION 'RETORNO_NO_AMPLIABLE';
    END IF;

    -- e) Límite con el reloj de la base: la fila sigue en_progreso hasta el tick
    --    siguiente al vencimiento, así que el estado solo no basta.
    IF now() >= public.treksafe_fecha_limite(v_exp.hora_retorno_estimada, v_exp.minutos_tolerancia) THEN
        RAISE EXCEPTION 'PLAZO_VENCIDO';
    END IF;

    -- f) Versión.
    IF v_exp.version <> p_version_esperada THEN
        RAISE EXCEPTION 'VERSION_OBSOLETA' USING DETAIL = v_exp.version::text;
    END IF;

    -- g) Cantidad de ampliaciones ya registradas.
    SELECT count(*) INTO v_ampliaciones
    FROM public.eventos_plan
    WHERE expedicion_id = p_expedicion_id AND tipo = 'RETORNO_AMPLIADO';

    IF v_ampliaciones >= c_max_ampliaciones THEN
        RAISE EXCEPTION 'AMPLIACION_NO_DISPONIBLE';
    END IF;

    -- h) Compare-and-swap: estado, versión y límite vuelven a exigirse en el UPDATE.
    v_hora_nueva := v_exp.hora_retorno_estimada + make_interval(mins => p_minutos);

    UPDATE public.expediciones
    SET hora_retorno_estimada = v_hora_nueva,
        version = version + 1,
        actualizado_en = now()
    WHERE id = p_expedicion_id
      AND estado = 'en_progreso'::public.estado_expedicion_enum
      AND version = p_version_esperada
      AND now() < public.treksafe_fecha_limite(hora_retorno_estimada, minutos_tolerancia)
    RETURNING version INTO v_version_nueva;

    IF NOT FOUND THEN
        -- Inalcanzable con la fila bloqueada; se deja por si cambia el bloqueo.
        RAISE EXCEPTION 'VERSION_OBSOLETA' USING DETAIL = v_exp.version::text;
    END IF;

    INSERT INTO public.eventos_plan (
        expedicion_id, senderista_id, tipo, actor_id, version_resultante, cambios, motivo, operacion_id
    ) VALUES (
        p_expedicion_id, p_senderista_id, 'RETORNO_AMPLIADO', p_senderista_id, v_version_nueva,
        -- Formato uniforme del contrato; los minutos se derivan de despues - antes.
        jsonb_build_object(
            'horaRetornoEstimada', jsonb_build_object(
                'antes', v_exp.hora_retorno_estimada,
                'despues', v_hora_nueva
            )
        ),
        v_motivo, p_operacion_id
    );

    -- i) Resultado.
    RETURN jsonb_build_object(
        'id', p_expedicion_id,
        'version', v_version_nueva,
        'horaRetornoEstimada', v_hora_nueva,
        'fechaLimite', public.treksafe_fecha_limite(v_hora_nueva, v_exp.minutos_tolerancia)
    );
END;
$$;

COMMENT ON FUNCTION public.treksafe_ampliar_retorno(UUID, UUID, INTEGER, INTEGER, TEXT, UUID) IS
    'HU-35: amplía el retorno de una expedición en curso antes de su límite y registra el evento en una sola transacción. Idempotente por operacion_id.';

REVOKE ALL ON FUNCTION public.treksafe_ampliar_retorno(UUID, UUID, INTEGER, INTEGER, TEXT, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.treksafe_ampliar_retorno(UUID, UUID, INTEGER, INTEGER, TEXT, UUID)
    TO service_role;

DO $$
BEGIN
    IF to_regclass('public.treksafe_migraciones') IS NOT NULL THEN
        EXECUTE $sql$
            INSERT INTO public.treksafe_migraciones (version, nombre, hu)
            VALUES ('007', 'hu35_rpc_ampliar_retorno', 'HU-35')
            ON CONFLICT (version) DO NOTHING
        $sql$;
    END IF;
END
$$;

COMMIT;

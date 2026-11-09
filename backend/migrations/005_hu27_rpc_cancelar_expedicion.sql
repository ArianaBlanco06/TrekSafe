-- =============================================================================
-- 005 · HU-27: cancelación atómica e idempotente de una expedición programada
-- Requiere: 002_hu26_version_y_eventos_plan.sql y 004_hu27_estado_cancelada.sql
--           (004 ya confirmada: el valor 'cancelada' no puede usarse en la
--           transacción que lo agrega).
-- Re-ejecutable: CREATE OR REPLACE y permisos idempotentes.
--
-- Errores de negocio: RAISE EXCEPTION con el código en MESSAGE.
--   EXPEDICION_NO_ENCONTRADA, PLAN_NO_CANCELABLE, DATOS_INVALIDOS.
--
-- Idempotencia doble:
--   - por operacion_id: la misma operación devuelve su resultado registrado;
--   - por estado: si el plan ya está cancelado, devuelve el estado actual sin
--     escribir, sin subir la versión y sin otro evento.
--
-- Regla de negocio (pendiente de confirmar por el Product Owner): se cancela
-- mientras el estado sea 'programada', aunque la hora de salida ya haya pasado
-- y el cron aún no la haya promovido. Por eso no se compara hora_inicio con now().
--
-- Carrera con el cron: la fila se bloquea con FOR UPDATE y el UPDATE exige
-- estado = 'programada'. La promoción del cron también filtra por
-- estado = 'programada' en su UPDATE, así que solo una de las dos gana.
-- =============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.treksafe_cancelar_expedicion(
    p_expedicion_id  UUID,
    p_senderista_id  UUID,
    p_motivo         TEXT,
    p_operacion_id   UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_exp            public.expediciones%ROWTYPE;
    v_evento         public.eventos_plan%ROWTYPE;
    v_motivo         TEXT := NULLIF(btrim(p_motivo), '');
    v_version_nueva  INTEGER;
BEGIN
    -- a) Operación ya registrada: se devuelve su resultado sin aplicar nada.
    --    Un operacion_id de otro plan u otro senderista no revela nada ajeno.
    SELECT * INTO v_evento FROM public.eventos_plan WHERE operacion_id = p_operacion_id;
    IF FOUND THEN
        IF v_evento.expedicion_id <> p_expedicion_id OR v_evento.senderista_id <> p_senderista_id THEN
            RAISE EXCEPTION 'EXPEDICION_NO_ENCONTRADA';
        END IF;
        -- El mismo operacion_id ya se usó para otra operación del plan (p. ej. una edición).
        IF v_evento.tipo <> 'CANCELADA' THEN
            RAISE EXCEPTION 'DATOS_INVALIDOS';
        END IF;
        RETURN jsonb_build_object(
            'id', v_evento.expedicion_id,
            'version', v_evento.version_resultante,
            'estado', 'cancelada'
        );
    END IF;

    IF v_motivo IS NOT NULL AND char_length(v_motivo) > 200 THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;

    -- b) Bloqueo de la fila y comprobación de propietario.
    SELECT * INTO v_exp
    FROM public.expediciones
    WHERE id = p_expedicion_id AND senderista_id = p_senderista_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'EXPEDICION_NO_ENCONTRADA';
    END IF;

    -- c) Ya cancelada (por esta u otra operación): mismo resultado, sin escribir.
    --    Cubre también un reintento simultáneo confirmado mientras se esperaba el bloqueo.
    IF v_exp.estado = 'cancelada'::public.estado_expedicion_enum THEN
        RETURN jsonb_build_object('id', v_exp.id, 'version', v_exp.version, 'estado', 'cancelada');
    END IF;

    -- d) Solo se cancela lo que todavía no inicia.
    IF v_exp.estado <> 'programada'::public.estado_expedicion_enum THEN
        RAISE EXCEPTION 'PLAN_NO_CANCELABLE';
    END IF;

    -- e) Cancelación condicionada al estado y su evento, en la misma transacción.
    UPDATE public.expediciones
    SET estado = 'cancelada'::public.estado_expedicion_enum,
        version = version + 1,
        actualizado_en = now()
    WHERE id = p_expedicion_id
      AND estado = 'programada'::public.estado_expedicion_enum
    RETURNING version INTO v_version_nueva;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PLAN_NO_CANCELABLE';
    END IF;

    INSERT INTO public.eventos_plan (
        expedicion_id, senderista_id, tipo, actor_id, version_resultante, cambios, motivo, operacion_id
    ) VALUES (
        p_expedicion_id, p_senderista_id, 'CANCELADA', p_senderista_id, v_version_nueva,
        jsonb_build_object('estado', jsonb_build_object('antes', 'programada', 'despues', 'cancelada')),
        v_motivo, p_operacion_id
    );

    -- f) Resultado.
    RETURN jsonb_build_object('id', p_expedicion_id, 'version', v_version_nueva, 'estado', 'cancelada');
END;
$$;

COMMENT ON FUNCTION public.treksafe_cancelar_expedicion(UUID, UUID, TEXT, UUID) IS
    'HU-27: cancela una expedición programada y registra su evento en una sola transacción. Idempotente.';

REVOKE ALL ON FUNCTION public.treksafe_cancelar_expedicion(UUID, UUID, TEXT, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.treksafe_cancelar_expedicion(UUID, UUID, TEXT, UUID)
    TO service_role;

DO $$
BEGIN
    IF to_regclass('public.treksafe_migraciones') IS NOT NULL THEN
        EXECUTE $sql$
            INSERT INTO public.treksafe_migraciones (version, nombre, hu)
            VALUES ('005', 'hu27_rpc_cancelar_expedicion', 'HU-27')
            ON CONFLICT (version) DO NOTHING
        $sql$;
    END IF;
END
$$;

COMMIT;

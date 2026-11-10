-- =============================================================================
-- 018 · HU-27 CA-01: cancelar solo una expedición programada con salida futura
-- Requiere: 005_hu27_rpc_cancelar_expedicion.sql (y, por tanto, 002 y 004).
-- Re-ejecutable: CREATE OR REPLACE y permisos idempotentes.
-- No depende de 000: registra la aplicación solo si treksafe_migraciones existe.
--
-- SUSTITUYE la función treksafe_cancelar_expedicion de la 005 (misma firma y mismos permisos).
-- No se edita la 005. IMPORTANTE: la 005 es re-ejecutable; volver a ejecutarla DESPUÉS de esta
-- migración restauraría la función anterior y revertiría la corrección. No la ejecutes de nuevo.
--
-- Cambio de regla (confirmado por el Product Owner; ver docs/hu-27/diseno.md): la 005 permitía
-- cancelar mientras el estado fuera 'programada', aunque la hora de salida ya hubiera pasado. Ahora
-- también se exige salida futura: hora_inicio > now(). La comparación es estricta (salida igual a
-- now() no es futura), como en la edición de HU-26 (hora_inicio <= now() ya inició).
--
-- Errores de negocio: RAISE EXCEPTION con el código en MESSAGE. Sin códigos nuevos.
--   EXPEDICION_NO_ENCONTRADA, PLAN_NO_CANCELABLE (estado distinto de programada O salida no futura),
--   DATOS_INVALIDOS.
--
-- Orden de las reglas (la idempotencia va primero, para que repetir una cancelación ya hecha siga
-- devolviendo lo mismo aunque la salida ya haya pasado):
--   a) operación ya registrada (mismo resultado; de otro plan o senderista: no encontrada;
--      de otro tipo de operación: datos inválidos)
--   b) motivo válido, bloqueo de la fila y propietario
--   c) plan ya cancelado (por esta u otra operación): mismo resultado, sin escribir
--   d) estado distinto de programada: PLAN_NO_CANCELABLE
--   e) salida no futura (hora_inicio <= now()): PLAN_NO_CANCELABLE
--   f) UPDATE condicionado a estado Y a salida futura (defensa si cambiara el bloqueo)
--
-- Carrera con el cron: la fila se bloquea con FOR UPDATE y el UPDATE exige estado = 'programada';
-- la promoción del cron también filtra por estado = 'programada', así que solo una de las dos gana.
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
    --    Va antes que la comprobación de la salida: repetir una cancelación ya hecha no depende de la hora.
    IF v_exp.estado = 'cancelada'::public.estado_expedicion_enum THEN
        RETURN jsonb_build_object('id', v_exp.id, 'version', v_exp.version, 'estado', 'cancelada');
    END IF;

    -- d) Solo se cancela lo que todavía no inicia: el estado.
    IF v_exp.estado <> 'programada'::public.estado_expedicion_enum THEN
        RAISE EXCEPTION 'PLAN_NO_CANCELABLE';
    END IF;

    -- e) ... y la salida, que debe ser futura (HU-27 CA-01). Estricto: salida = now() no es futura.
    IF v_exp.hora_inicio <= now() THEN
        RAISE EXCEPTION 'PLAN_NO_CANCELABLE';
    END IF;

    -- f) Cancelación condicionada al estado y a la salida futura, y su evento, en la misma transacción.
    UPDATE public.expediciones
    SET estado = 'cancelada'::public.estado_expedicion_enum,
        version = version + 1,
        actualizado_en = now()
    WHERE id = p_expedicion_id
      AND estado = 'programada'::public.estado_expedicion_enum
      AND hora_inicio > now()
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

    -- g) Resultado.
    RETURN jsonb_build_object('id', p_expedicion_id, 'version', v_version_nueva, 'estado', 'cancelada');
END;
$$;

COMMENT ON FUNCTION public.treksafe_cancelar_expedicion(UUID, UUID, TEXT, UUID) IS
    'HU-27: cancela una expedición programada con salida futura y registra su evento en una sola transacción. Idempotente. Sustituye la versión de la migración 005.';

REVOKE ALL ON FUNCTION public.treksafe_cancelar_expedicion(UUID, UUID, TEXT, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.treksafe_cancelar_expedicion(UUID, UUID, TEXT, UUID)
    TO service_role;

DO $$
BEGIN
    IF to_regclass('public.treksafe_migraciones') IS NOT NULL THEN
        EXECUTE $sql$
            INSERT INTO public.treksafe_migraciones (version, nombre, hu)
            VALUES ('018', 'hu27_cancelar_salida_futura', 'HU-27')
            ON CONFLICT (version) DO NOTHING
        $sql$;
    END IF;
END
$$;

COMMIT;

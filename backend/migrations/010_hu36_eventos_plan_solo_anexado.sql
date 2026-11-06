-- =============================================================================
-- 010 · HU-36: eventos_plan solo admite anexar (historial de cambios del plan)
-- Requiere: 002_hu26_version_y_eventos_plan.sql y 006_hu27_permiso_anonimizar_eventos.sql.
-- Re-ejecutable: CREATE OR REPLACE, DROP TRIGGER IF EXISTS y permisos idempotentes.
-- No reescribe filas existentes.
-- No depende de 000: registra la aplicación solo si treksafe_migraciones existe.
--
-- 1) treksafe_sanear_cambios_evento_plan(cambios): conserva solo los campos del
--    plan conocidos (lista blanca) con la forma {"antes": ..., "despues": ...}.
--    Debe coincidir con CAMPOS_EVENTO_PLAN de
--    backend/src/domain/value-objects/camposEventoPlan.ts.
-- 2) BEFORE INSERT: sanea cambios y fija ocurrido_en con el reloj de la base.
-- 3) BEFORE UPDATE: solo deja pasar la anonimización ARCO de
--    RepositorioUsuario.anonimizarHistorialRutas (cambios = '{}' y motivo NULL,
--    sin tocar ninguna otra columna). Cualquier otro cambio: EVENTO_PLAN_INMUTABLE.
-- 4) BEFORE DELETE: solo deja pasar el borrado en cascada desde expediciones
--    (eliminación de cuenta o de expedición). BEFORE TRUNCATE: siempre rechaza.
-- 5) Permisos: service_role conserva SELECT, INSERT y UPDATE (cambios, motivo);
--    se le retiran UPDATE de tabla, DELETE y TRUNCATE (en Supabase los recibía por
--    los privilegios por defecto).
--
-- Las RPC de HU-26, HU-27 y HU-35 no se modifican: insertan en la misma
-- transacción y sus claves de cambios están en la lista blanca.
-- =============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.treksafe_sanear_cambios_evento_plan(p_cambios JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
    SELECT CASE
        WHEN p_cambios IS NULL OR jsonb_typeof(p_cambios) <> 'object' THEN '{}'::jsonb
        ELSE COALESCE((
            SELECT jsonb_object_agg(
                e.key,
                e.value - ARRAY(
                    SELECT k FROM jsonb_object_keys(e.value) AS k
                    WHERE k NOT IN ('antes', 'despues')
                )
            )
            FROM jsonb_each(p_cambios) AS e
            WHERE e.key IN (
                    'lugarInicio', 'lugarFin', 'coordenadasInicio', 'coordenadasFin',
                    'horaInicio', 'horaRetornoEstimada', 'minutosTolerancia',
                    'idsContactos', 'nombresAcompanantes', 'estado'
                )
              AND jsonb_typeof(e.value) = 'object'
              AND e.value ?| ARRAY['antes', 'despues']
        ), '{}'::jsonb)
    END;
$$;

COMMENT ON FUNCTION public.treksafe_sanear_cambios_evento_plan(JSONB) IS
    'HU-36: conserva solo los campos del plan de la lista blanca con subclaves antes/despues. Igual que sanearCambios (TS).';

CREATE OR REPLACE FUNCTION public.treksafe_eventos_plan_antes_de_insertar()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    NEW.cambios := public.treksafe_sanear_cambios_evento_plan(NEW.cambios);
    NEW.ocurrido_en := now();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.treksafe_eventos_plan_solo_anexado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        -- Única modificación permitida: anonimización ARCO (vaciar cambios y motivo).
        IF NEW.id                 IS NOT DISTINCT FROM OLD.id
           AND NEW.expedicion_id      IS NOT DISTINCT FROM OLD.expedicion_id
           AND NEW.senderista_id      IS NOT DISTINCT FROM OLD.senderista_id
           AND NEW.tipo               IS NOT DISTINCT FROM OLD.tipo
           AND NEW.actor_id           IS NOT DISTINCT FROM OLD.actor_id
           AND NEW.ocurrido_en        IS NOT DISTINCT FROM OLD.ocurrido_en
           AND NEW.version_resultante IS NOT DISTINCT FROM OLD.version_resultante
           AND NEW.operacion_id       IS NOT DISTINCT FROM OLD.operacion_id
           AND NEW.cambios = '{}'::jsonb
           AND NEW.motivo IS NULL
        THEN
            RETURN NEW;
        END IF;
        RAISE EXCEPTION 'EVENTO_PLAN_INMUTABLE';
    END IF;

    IF TG_OP = 'DELETE' THEN
        -- Profundidad 1: DELETE directo. Profundidad >= 2: cascada de la FK
        -- fk_eventos_plan_expedicion (borrado de expedición o de cuenta).
        IF pg_trigger_depth() < 2 THEN
            RAISE EXCEPTION 'EVENTO_PLAN_INMUTABLE';
        END IF;
        RETURN OLD;
    END IF;

    -- TRUNCATE
    RAISE EXCEPTION 'EVENTO_PLAN_INMUTABLE';
END;
$$;

DROP TRIGGER IF EXISTS trg_eventos_plan_antes_de_insertar ON public.eventos_plan;
CREATE TRIGGER trg_eventos_plan_antes_de_insertar
    BEFORE INSERT ON public.eventos_plan
    FOR EACH ROW EXECUTE FUNCTION public.treksafe_eventos_plan_antes_de_insertar();

DROP TRIGGER IF EXISTS trg_eventos_plan_solo_anexado ON public.eventos_plan;
CREATE TRIGGER trg_eventos_plan_solo_anexado
    BEFORE UPDATE ON public.eventos_plan
    FOR EACH ROW EXECUTE FUNCTION public.treksafe_eventos_plan_solo_anexado();

DROP TRIGGER IF EXISTS trg_eventos_plan_sin_borrado ON public.eventos_plan;
CREATE TRIGGER trg_eventos_plan_sin_borrado
    BEFORE DELETE ON public.eventos_plan
    FOR EACH ROW EXECUTE FUNCTION public.treksafe_eventos_plan_solo_anexado();

DROP TRIGGER IF EXISTS trg_eventos_plan_sin_truncate ON public.eventos_plan;
CREATE TRIGGER trg_eventos_plan_sin_truncate
    BEFORE TRUNCATE ON public.eventos_plan
    FOR EACH STATEMENT EXECUTE FUNCTION public.treksafe_eventos_plan_solo_anexado();

-- Permisos. REVOKE de tabla también retira los permisos de columna, por eso se
-- vuelve a conceder el UPDATE limitado de 006.
REVOKE UPDATE, DELETE, TRUNCATE ON public.eventos_plan FROM service_role;
GRANT SELECT, INSERT ON public.eventos_plan TO service_role;
GRANT UPDATE (cambios, motivo) ON public.eventos_plan TO service_role;

REVOKE ALL ON FUNCTION public.treksafe_sanear_cambios_evento_plan(JSONB)
    FROM PUBLIC, anon, authenticated;
-- El trigger de inserción se ejecuta con el rol que inserta (SECURITY INVOKER).
GRANT EXECUTE ON FUNCTION public.treksafe_sanear_cambios_evento_plan(JSONB)
    TO service_role;
REVOKE ALL ON FUNCTION public.treksafe_eventos_plan_antes_de_insertar()
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.treksafe_eventos_plan_solo_anexado()
    FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.eventos_plan IS
    'Eventos de cambio del plan de una expedición. Solo se anexan (HU-36): sin UPDATE salvo anonimización ARCO, sin DELETE salvo cascada. Nunca guarda contraseñas ni datos médicos.';
COMMENT ON TRIGGER trg_eventos_plan_antes_de_insertar ON public.eventos_plan IS
    'HU-36: sanea cambios con la lista blanca y fija ocurrido_en = now().';
COMMENT ON TRIGGER trg_eventos_plan_solo_anexado ON public.eventos_plan IS
    'HU-36: rechaza UPDATE salvo la anonimización ARCO (cambios = {} y motivo NULL).';
COMMENT ON TRIGGER trg_eventos_plan_sin_borrado ON public.eventos_plan IS
    'HU-36: rechaza DELETE directo; permite la cascada desde expediciones.';
COMMENT ON TRIGGER trg_eventos_plan_sin_truncate ON public.eventos_plan IS
    'HU-36: rechaza TRUNCATE.';

DO $$
BEGIN
    IF to_regclass('public.treksafe_migraciones') IS NOT NULL THEN
        EXECUTE $sql$
            INSERT INTO public.treksafe_migraciones (version, nombre, hu)
            VALUES ('010', 'hu36_eventos_plan_solo_anexado', 'HU-36')
            ON CONFLICT (version) DO NOTHING
        $sql$;
    END IF;
END
$$;

COMMIT;

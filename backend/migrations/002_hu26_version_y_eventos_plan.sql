-- =============================================================================
-- 002 · HU-26: versión de expediciones y tabla eventos_plan
-- Requiere: esquema de init_schema.sql (expediciones, roles de Supabase).
-- Re-ejecutable: no falla ni repite efectos si ya se aplicó.
-- No depende de 000: registra la aplicación solo si treksafe_migraciones existe.
-- =============================================================================
BEGIN;

ALTER TABLE public.expediciones
    ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.expediciones.version IS
    'Control optimista de concurrencia: lo incrementan las operaciones del plan (HU-26, HU-27, HU-35).';

CREATE TABLE IF NOT EXISTS public.eventos_plan (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    expedicion_id       UUID            NOT NULL,
    senderista_id       UUID            NOT NULL,
    tipo                TEXT            NOT NULL,
    actor_id            UUID            NOT NULL,
    ocurrido_en         TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    version_resultante  INTEGER         NOT NULL,
    cambios             JSONB           NOT NULL DEFAULT '{}'::jsonb,
    motivo              TEXT,
    operacion_id        UUID            NOT NULL,

    CONSTRAINT fk_eventos_plan_expedicion
        FOREIGN KEY (expedicion_id) REFERENCES public.expediciones (id)
        ON DELETE CASCADE,
    CONSTRAINT uq_eventos_plan_operacion UNIQUE (operacion_id),
    CONSTRAINT chk_eventos_plan_tipo CHECK (
        tipo IN ('EDITADA', 'CANCELADA', 'RETORNO_AMPLIADO')
    )
);

COMMENT ON TABLE public.eventos_plan IS
    'Eventos de cambio del plan de una expedición. Nunca guarda contraseñas ni datos médicos.';
COMMENT ON COLUMN public.eventos_plan.cambios IS
    'Solo los campos que cambiaron: {"campo": {"antes": ..., "despues": ...}}.';
COMMENT ON COLUMN public.eventos_plan.operacion_id IS
    'UUID generado por el cliente; hace idempotente la operación.';

CREATE INDEX IF NOT EXISTS idx_eventos_plan_expedicion_orden
    ON public.eventos_plan (expedicion_id, ocurrido_en, id);

-- Mismo criterio que enable_rls.sql: RLS activo y denegación a anon y authenticated.
ALTER TABLE public.eventos_plan ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS treksafe_deny_anon_authenticated ON public.eventos_plan;
CREATE POLICY treksafe_deny_anon_authenticated ON public.eventos_plan
    FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

REVOKE ALL ON public.eventos_plan FROM anon, authenticated;
GRANT SELECT, INSERT ON public.eventos_plan TO service_role;

DO $$
BEGIN
    IF to_regclass('public.treksafe_migraciones') IS NOT NULL THEN
        EXECUTE $sql$
            INSERT INTO public.treksafe_migraciones (version, nombre, hu)
            VALUES ('002', 'hu26_version_y_eventos_plan', 'HU-26')
            ON CONFLICT (version) DO NOTHING
        $sql$;
    END IF;
END
$$;

COMMIT;

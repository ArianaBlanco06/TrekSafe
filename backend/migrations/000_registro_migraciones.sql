-- =============================================================================
-- 000 · Registro de migraciones (transversal)
-- Requiere: init_schema.sql ya aplicado (roles anon/authenticated de Supabase).
-- Idempotente: puede ejecutarse más de una vez sin efectos adicionales.
-- =============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS treksafe_migraciones (
    version      VARCHAR(16)   PRIMARY KEY,
    nombre       VARCHAR(200)  NOT NULL,
    hu           VARCHAR(32),
    aplicada_en  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    aplicada_por VARCHAR(100)  NOT NULL DEFAULT CURRENT_USER
);

COMMENT ON TABLE treksafe_migraciones IS
    'Registro de migraciones SQL aplicadas (convención NNN_huXX_descripcion.sql).';

ALTER TABLE treksafe_migraciones ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'treksafe_migraciones'
          AND policyname = 'treksafe_deny_anon_authenticated'
    ) THEN
        CREATE POLICY treksafe_deny_anon_authenticated ON treksafe_migraciones
            FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
    END IF;
END
$$;

INSERT INTO treksafe_migraciones (version, nombre, hu)
VALUES ('000', 'registro_migraciones', 'transversal')
ON CONFLICT (version) DO NOTHING;

COMMIT;

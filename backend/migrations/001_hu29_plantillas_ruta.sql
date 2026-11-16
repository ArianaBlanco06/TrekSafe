-- =============================================================================
-- 001 · HU-29 · Plantillas de ruta en la cuenta del senderista
-- Requiere: init_schema.sql y 000_registro_migraciones.sql.
-- NO es idempotente: falla de forma explícita si 001 ya está registrada.
-- Reversión (solo base desechable): 001_hu29_plantillas_ruta.down.sql
-- =============================================================================
BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM treksafe_migraciones WHERE version = '001') THEN
        RAISE EXCEPTION 'La migración 001 ya está registrada en treksafe_migraciones';
    END IF;
END
$$;

CREATE TABLE plantillas_ruta (
    id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    senderista_id        UUID          NOT NULL,
    nombre               VARCHAR(80)   NOT NULL,
    lugar_inicio         VARCHAR(500)  NOT NULL,
    lugar_fin            VARCHAR(500)  NOT NULL,
    coordenadas_inicio   VARCHAR(32),
    coordenadas_fin      VARCHAR(32),
    minutos_tolerancia   INTEGER       NOT NULL DEFAULT 30,
    ids_contactos        UUID[]        NOT NULL DEFAULT '{}',
    nombres_acompanantes TEXT[]        NOT NULL DEFAULT '{}',
    version              INTEGER       NOT NULL DEFAULT 1,
    creado_en            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    actualizado_en       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    -- ARCO: borrar la cuenta (perfil del senderista) borra sus plantillas.
    CONSTRAINT fk_plantillas_ruta_senderista
        FOREIGN KEY (senderista_id) REFERENCES perfiles_senderista (usuario_id)
        ON DELETE CASCADE,
    CONSTRAINT chk_plantillas_ruta_nombre CHECK (length(btrim(nombre)) BETWEEN 1 AND 80),
    CONSTRAINT chk_plantillas_ruta_tolerancia CHECK (minutos_tolerancia BETWEEN 1 AND 480),
    CONSTRAINT chk_plantillas_ruta_contactos CHECK (cardinality(ids_contactos) <= 10),
    CONSTRAINT chk_plantillas_ruta_acompanantes CHECK (cardinality(nombres_acompanantes) <= 20),
    CONSTRAINT chk_plantillas_ruta_version CHECK (version >= 1)
);

COMMENT ON TABLE plantillas_ruta IS
    'Plantillas de ruta guardadas en la cuenta del senderista (HU-29). Sin FK hacia expediciones: borrarlas no altera expediciones.';
COMMENT ON COLUMN plantillas_ruta.ids_contactos IS
    'Ids de contactos sugeridos, sin FK: se revalidan como vigentes al preparar el borrador.';
COMMENT ON COLUMN plantillas_ruta.version IS
    'Control optimista de concurrencia: la incrementa el trigger en cada UPDATE.';

CREATE UNIQUE INDEX uq_plantillas_ruta_senderista_nombre
    ON plantillas_ruta (senderista_id, lower(btrim(nombre)));

CREATE INDEX idx_plantillas_ruta_senderista_actualizado
    ON plantillas_ruta (senderista_id, actualizado_en DESC, id);

CREATE FUNCTION treksafe_plantillas_ruta_antes_de_actualizar()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.version := OLD.version + 1;
    NEW.actualizado_en := NOW();
    NEW.senderista_id := OLD.senderista_id;
    NEW.creado_en := OLD.creado_en;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_plantillas_ruta_antes_de_actualizar
    BEFORE UPDATE ON plantillas_ruta
    FOR EACH ROW EXECUTE FUNCTION treksafe_plantillas_ruta_antes_de_actualizar();

ALTER TABLE plantillas_ruta ENABLE ROW LEVEL SECURITY;

CREATE POLICY treksafe_deny_anon_authenticated ON plantillas_ruta
    FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

INSERT INTO treksafe_migraciones (version, nombre, hu)
VALUES ('001', 'hu29_plantillas_ruta', 'HU-29');

COMMIT;

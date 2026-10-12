-- =============================================================================
-- TrekSafe — Esquema relacional en español (PostgreSQL / Supabase)
-- Hispanización completa · esquema recreado desde cero
-- =============================================================================
-- Ejecución: pegar en el SQL Editor de Supabase o:
--   psql "$DATABASE_URL" -f init_schema.sql
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Limpieza idempotente
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS treksafe_marcar_expiradas_en_progreso_como_alerta() CASCADE;
DROP FUNCTION IF EXISTS treksafe_mark_expired_in_progress_as_alert() CASCADE;

DROP TABLE IF EXISTS auditoria_acceso_medico CASCADE;
DROP TABLE IF EXISTS despachos_correo CASCADE;
DROP TABLE IF EXISTS bitacoras_rescate CASCADE;
DROP TABLE IF EXISTS vinculos_expedicion_contacto CASCADE;
DROP TABLE IF EXISTS acompanantes_expedicion CASCADE;
DROP TABLE IF EXISTS expediciones CASCADE;
DROP TABLE IF EXISTS contactos_emergencia CASCADE;
DROP TABLE IF EXISTS fichas_medicas CASCADE;
DROP TABLE IF EXISTS perfiles_rescatista CASCADE;
DROP TABLE IF EXISTS perfiles_senderista CASCADE;
DROP TABLE IF EXISTS registros_institucionales_rescatista CASCADE;
DROP TABLE IF EXISTS usuarios CASCADE;

-- Tablas legacy (inglés) por si existen
DROP TABLE IF EXISTS medical_access_audit CASCADE;
DROP TABLE IF EXISTS email_dispatches CASCADE;
DROP TABLE IF EXISTS rescue_logs CASCADE;
DROP TABLE IF EXISTS expedition_emergency_contacts CASCADE;
DROP TABLE IF EXISTS expedition_companions CASCADE;
DROP TABLE IF EXISTS expeditions CASCADE;
DROP TABLE IF EXISTS emergency_contacts CASCADE;
DROP TABLE IF EXISTS medical_info CASCADE;
DROP TABLE IF EXISTS rescuers_profile CASCADE;
DROP TABLE IF EXISTS hikers_profile CASCADE;
DROP TABLE IF EXISTS institutional_rescuer_registry CASCADE;
DROP TABLE IF EXISTS users CASCADE;

DROP TYPE IF EXISTS estado_rescate_enum CASCADE;
DROP TYPE IF EXISTS estado_expedicion_enum CASCADE;
DROP TYPE IF EXISTS rol_usuario_enum CASCADE;
DROP TYPE IF EXISTS rescue_status_enum CASCADE;
DROP TYPE IF EXISTS expedition_status_enum CASCADE;
DROP TYPE IF EXISTS user_role_enum CASCADE;

-- ---------------------------------------------------------------------------
-- 1. Extensiones
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- 2. Tipos ENUM
-- ---------------------------------------------------------------------------
CREATE TYPE rol_usuario_enum AS ENUM (
    'senderista',
    'rescatista'
);

CREATE TYPE estado_expedicion_enum AS ENUM (
    'programada',
    'en_progreso',
    'completada',
    'alerta'
);

CREATE TYPE estado_rescate_enum AS ENUM (
    'en_busqueda',
    'localizados',
    'cerrado'
);

-- ---------------------------------------------------------------------------
-- 3. Tablas
-- ---------------------------------------------------------------------------
CREATE TABLE usuarios (
    id                  UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
    correo_electronico  VARCHAR(255)        NOT NULL,
    hash_contrasena     VARCHAR(255)        NOT NULL,
    rol                 rol_usuario_enum    NOT NULL,
    creado_en           TIMESTAMPTZ         NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_usuarios_correo UNIQUE (correo_electronico),
    CONSTRAINT chk_usuarios_correo_formato CHECK (
        correo_electronico ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
    )
);

COMMENT ON TABLE usuarios IS 'Cuentas de acceso con rol senderista o rescatista.';
COMMENT ON COLUMN usuarios.hash_contrasena IS 'Hash bcrypt generado en backend; nunca texto plano.';

CREATE TABLE perfiles_senderista (
    usuario_id      UUID            PRIMARY KEY,
    nombre_completo VARCHAR(200)    NOT NULL,
    telefono        VARCHAR(20)     NOT NULL,
    id_documento    VARCHAR(20)     NOT NULL,

    CONSTRAINT fk_perfiles_senderista_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
        ON DELETE CASCADE,
    CONSTRAINT uq_perfiles_senderista_documento UNIQUE (id_documento),
    CONSTRAINT chk_perfiles_senderista_telefono CHECK (length(trim(telefono)) > 0)
);

COMMENT ON TABLE perfiles_senderista IS 'Datos personales del senderista vinculados 1:1 a usuarios.';

CREATE TABLE registros_institucionales_rescatista (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    institucion         VARCHAR(50)     NOT NULL,
    numero_credencial   VARCHAR(50)     NOT NULL,
    nombre_completo     VARCHAR(200)    NOT NULL,
    fecha_nacimiento    DATE            NOT NULL,
    esta_activo         BOOLEAN         NOT NULL DEFAULT TRUE,
    creado_en           TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_registro_credencial UNIQUE (numero_credencial),
    CONSTRAINT uq_registro_identidad UNIQUE (institucion, numero_credencial, nombre_completo, fecha_nacimiento),
    CONSTRAINT chk_registro_institucion CHECK (
        institucion IN ('AGMP', 'MINCETUR')
    )
);

COMMENT ON TABLE registros_institucionales_rescatista IS
    'Padrón local simulado. El backend valida credencial + nombre + fecha de nacimiento en el alta.';

CREATE TABLE perfiles_rescatista (
    usuario_id          UUID            PRIMARY KEY,
    numero_credencial   VARCHAR(50)     NOT NULL,
    nombre_completo     VARCHAR(200)    NOT NULL,
    fecha_nacimiento    DATE            NOT NULL,
    validado_en         TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_perfiles_rescatista_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
        ON DELETE CASCADE,
    CONSTRAINT uq_perfiles_rescatista_credencial UNIQUE (numero_credencial),
    CONSTRAINT fk_perfiles_rescatista_registro
        FOREIGN KEY (numero_credencial) REFERENCES registros_institucionales_rescatista (numero_credencial)
);

COMMENT ON TABLE perfiles_rescatista IS
    'Rescatista registrado tras validación exitosa contra el padrón institucional.';

CREATE TABLE fichas_medicas (
    id                          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    senderista_id               UUID            NOT NULL,
    tipo_sangre                 VARCHAR(5)      NOT NULL,
    condiciones_encriptadas     TEXT            NOT NULL,
    consentimiento_firmado      BOOLEAN         NOT NULL DEFAULT FALSE,
    creado_en                   TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    actualizado_en              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_fichas_medicas_senderista
        FOREIGN KEY (senderista_id) REFERENCES perfiles_senderista (usuario_id)
        ON DELETE CASCADE,
    CONSTRAINT uq_fichas_medicas_senderista UNIQUE (senderista_id),
    CONSTRAINT chk_ficha_consentimiento CHECK (consentimiento_firmado = TRUE),
    CONSTRAINT chk_ficha_tipo_sangre CHECK (
        tipo_sangre IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')
    )
);

COMMENT ON TABLE fichas_medicas IS
    'Datos de salud. condiciones_encriptadas almacena AES-256 desde backend.';

CREATE TABLE contactos_emergencia (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    senderista_id       UUID            NOT NULL,
    nombre_completo     VARCHAR(200)    NOT NULL,
    parentesco          VARCHAR(100)    NOT NULL,
    telefono            VARCHAR(20)     NOT NULL,
    correo_electronico  VARCHAR(255)    NOT NULL,

    CONSTRAINT fk_contactos_emergencia_senderista
        FOREIGN KEY (senderista_id) REFERENCES perfiles_senderista (usuario_id)
        ON DELETE CASCADE,
    CONSTRAINT chk_contactos_correo CHECK (
        correo_electronico ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
    )
);

COMMENT ON TABLE contactos_emergencia IS 'Contactos de emergencia reutilizables del senderista.';

CREATE TABLE expediciones (
    id                      UUID                        PRIMARY KEY DEFAULT gen_random_uuid(),
    senderista_id           UUID                        NOT NULL,
    lugar_inicio            VARCHAR(500)                NOT NULL,
    lugar_fin               VARCHAR(500)                NOT NULL,
    coordenadas_inicio      VARCHAR(32),
    coordenadas_fin         VARCHAR(32),
    hora_inicio             TIMESTAMPTZ                 NOT NULL,
    hora_retorno_estimada   TIMESTAMPTZ                 NOT NULL,
    minutos_tolerancia      INTEGER                     NOT NULL DEFAULT 30,
    estado                  estado_expedicion_enum      NOT NULL DEFAULT 'programada',
    creado_en               TIMESTAMPTZ                 NOT NULL DEFAULT NOW(),
    actualizado_en          TIMESTAMPTZ                 NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_expediciones_senderista
        FOREIGN KEY (senderista_id) REFERENCES perfiles_senderista (usuario_id)
        ON DELETE CASCADE,
    CONSTRAINT chk_expediciones_tolerancia CHECK (minutos_tolerancia > 0),
    CONSTRAINT chk_expediciones_orden_temporal CHECK (
        hora_retorno_estimada > hora_inicio
    )
);

COMMENT ON TABLE expediciones IS
    'Itinerario declarativo con ventana de tolerancia para el motor de plazos.';
COMMENT ON COLUMN expediciones.minutos_tolerancia IS
    'Minutos adicionales tras hora_retorno_estimada antes de disparar alerta.';
COMMENT ON COLUMN expediciones.coordenadas_inicio IS 'Coordenadas decimales "lat,lon" del punto de salida.';
COMMENT ON COLUMN expediciones.coordenadas_fin IS 'Coordenadas decimales "lat,lon" del destino.';

CREATE TABLE acompanantes_expedicion (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    expedicion_id       UUID            NOT NULL,
    nombre_acompanante  VARCHAR(200)    NOT NULL,

    CONSTRAINT fk_acompanantes_expedicion
        FOREIGN KEY (expedicion_id) REFERENCES expediciones (id)
        ON DELETE CASCADE,
    CONSTRAINT chk_nombre_acompanante CHECK (length(trim(nombre_acompanante)) > 0)
);

COMMENT ON TABLE acompanantes_expedicion IS 'Acompañantes declarados en una expedición específica.';

CREATE TABLE vinculos_expedicion_contacto (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    expedicion_id   UUID            NOT NULL,
    contacto_id     UUID            NOT NULL,

    CONSTRAINT fk_vinculos_expedicion
        FOREIGN KEY (expedicion_id) REFERENCES expediciones (id)
        ON DELETE CASCADE,
    CONSTRAINT fk_vinculos_contacto
        FOREIGN KEY (contacto_id) REFERENCES contactos_emergencia (id)
        ON DELETE CASCADE,
    CONSTRAINT uq_vinculo_expedicion_contacto UNIQUE (expedicion_id, contacto_id)
);

COMMENT ON TABLE vinculos_expedicion_contacto IS 'Contactos vinculados a una expedición para alertas.';

CREATE TABLE bitacoras_rescate (
    id              UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
    expedicion_id   UUID                    NOT NULL,
    rescatista_id   UUID                    NOT NULL,
    notas           TEXT,
    estado_rescate  estado_rescate_enum     NOT NULL DEFAULT 'en_busqueda',
    actualizado_en  TIMESTAMPTZ             NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_bitacoras_expedicion
        FOREIGN KEY (expedicion_id) REFERENCES expediciones (id)
        ON DELETE CASCADE,
    CONSTRAINT fk_bitacoras_rescatista
        FOREIGN KEY (rescatista_id) REFERENCES perfiles_rescatista (usuario_id)
        ON DELETE RESTRICT,
    CONSTRAINT uq_bitacoras_expedicion_rescatista UNIQUE (expedicion_id, rescatista_id)
);

COMMENT ON TABLE bitacoras_rescate IS
    'Seguimiento de casos de alerta por rescatistas validados.';

CREATE TABLE despachos_correo (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    expedicion_id       UUID            NOT NULL REFERENCES expediciones (id) ON DELETE CASCADE,
    tipo_despacho       VARCHAR(32)     NOT NULL,
    clave_destinatario  VARCHAR(255)    NOT NULL,
    enviado_en          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_despacho_correo UNIQUE (expedicion_id, tipo_despacho, clave_destinatario),
    CONSTRAINT chk_tipo_despacho CHECK (
        tipo_despacho IN ('alerta_contacto', 'alerta_rescate')
    )
);

CREATE INDEX idx_despachos_correo_expedicion ON despachos_correo (expedicion_id);

CREATE TABLE auditoria_acceso_medico (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    senderista_id   UUID            NOT NULL,
    expedicion_id   UUID            REFERENCES expediciones (id) ON DELETE SET NULL,
    id_accesor      UUID            NOT NULL,
    rol_accesor     VARCHAR(32)     NOT NULL,
    tipo_acceso     VARCHAR(64)     NOT NULL,
    accedido_en     TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auditoria_acceso_medico_senderista
    ON auditoria_acceso_medico (senderista_id, accedido_en DESC);

-- ---------------------------------------------------------------------------
-- 4. Índices
-- ---------------------------------------------------------------------------
CREATE INDEX idx_expediciones_cron_en_progreso
    ON expediciones (estado, hora_retorno_estimada)
    WHERE estado = 'en_progreso';

CREATE INDEX idx_expediciones_senderista_estado
    ON expediciones (senderista_id, estado);

CREATE INDEX idx_expediciones_senderista_bloqueantes
    ON expediciones (senderista_id, estado)
    WHERE estado IN ('en_progreso', 'alerta');

CREATE INDEX idx_contactos_emergencia_senderista
    ON contactos_emergencia (senderista_id);

CREATE INDEX idx_bitacoras_rescate_expedicion
    ON bitacoras_rescate (expedicion_id);

CREATE INDEX idx_vinculos_expedicion_contacto_expedicion
    ON vinculos_expedicion_contacto (expedicion_id);

CREATE INDEX idx_registro_busqueda
    ON registros_institucionales_rescatista (numero_credencial, nombre_completo, fecha_nacimiento)
    WHERE esta_activo = TRUE;

-- ---------------------------------------------------------------------------
-- 5. Función RPC del cron
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION treksafe_marcar_expiradas_en_progreso_como_alerta()
RETURNS SETOF UUID
LANGUAGE sql
AS $$
    UPDATE expediciones
    SET estado = 'alerta', actualizado_en = NOW()
    WHERE estado = 'en_progreso'
      AND (hora_retorno_estimada + (minutos_tolerancia || ' minutes')::interval) < NOW()
    RETURNING id;
$$;

-- ---------------------------------------------------------------------------
-- 6. Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE usuarios                                ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfiles_senderista                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfiles_rescatista                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE registros_institucionales_rescatista    ENABLE ROW LEVEL SECURITY;
ALTER TABLE fichas_medicas                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE contactos_emergencia                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE expediciones                            ENABLE ROW LEVEL SECURITY;
ALTER TABLE acompanantes_expedicion                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE vinculos_expedicion_contacto            ENABLE ROW LEVEL SECURITY;
ALTER TABLE bitacoras_rescate                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE despachos_correo                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria_acceso_medico                 ENABLE ROW LEVEL SECURITY;

CREATE POLICY treksafe_deny_anon_authenticated ON usuarios
    FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY treksafe_deny_anon_authenticated ON perfiles_senderista
    FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY treksafe_deny_anon_authenticated ON perfiles_rescatista
    FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY treksafe_deny_anon_authenticated ON registros_institucionales_rescatista
    FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY treksafe_deny_anon_authenticated ON fichas_medicas
    FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY treksafe_deny_anon_authenticated ON contactos_emergencia
    FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY treksafe_deny_anon_authenticated ON expediciones
    FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY treksafe_deny_anon_authenticated ON acompanantes_expedicion
    FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY treksafe_deny_anon_authenticated ON vinculos_expedicion_contacto
    FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY treksafe_deny_anon_authenticated ON bitacoras_rescate
    FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY treksafe_deny_anon_authenticated ON despachos_correo
    FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY treksafe_deny_anon_authenticated ON auditoria_acceso_medico
    FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- ---------------------------------------------------------------------------
-- 7. Datos semilla
-- ---------------------------------------------------------------------------
-- Contraseña de prueba: Treksafe123!

INSERT INTO registros_institucionales_rescatista (
    id, institucion, numero_credencial, nombre_completo, fecha_nacimiento, esta_activo
) VALUES
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'AGMP', 'AGMP-2024-00158', 'Carlos Mendoza Quispe', '1985-03-14', TRUE),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'AGMP', 'AGMP-2024-00203', 'Lucía Fernández Ríos', '1990-07-22', TRUE),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'MINCETUR', 'MIN-RS-2019-00441', 'Marco Antonio Vargas Silva', '1988-11-05', TRUE),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', 'MINCETUR', 'MIN-RS-2021-00789', 'Ana Patricia Solís Campos', '1993-01-18', TRUE),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5', 'AGMP', 'AGMP-2023-00999', 'Roberto Elías Paredes Luna', '1979-09-30', FALSE);

INSERT INTO usuarios (id, correo_electronico, hash_contrasena, rol, creado_en)
VALUES (
    '11111111-1111-4111-8111-111111111111',
    'senderista@treksafe.pe',
    crypt('Treksafe123!', gen_salt('bf', 10)),
    'senderista',
    NOW()
);

INSERT INTO perfiles_senderista (usuario_id, nombre_completo, telefono, id_documento)
VALUES (
    '11111111-1111-4111-8111-111111111111',
    'Juan Pérez García',
    '+51987654321',
    '45879632'
);

INSERT INTO usuarios (id, correo_electronico, hash_contrasena, rol, creado_en)
VALUES (
    '22222222-2222-4222-8222-222222222222',
    'rescatista@treksafe.pe',
    crypt('Treksafe123!', gen_salt('bf', 10)),
    'rescatista',
    NOW()
);

INSERT INTO perfiles_rescatista (
    usuario_id, numero_credencial, nombre_completo, fecha_nacimiento, validado_en
)
VALUES (
    '22222222-2222-4222-8222-222222222222',
    'AGMP-2024-00158',
    'Carlos Mendoza Quispe',
    '1985-03-14',
    NOW()
);

COMMIT;

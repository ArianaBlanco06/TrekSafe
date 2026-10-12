-- TrekSafe — RLS deny-by-default (esquema en español)
-- Usar solo si la BD ya tiene las tablas de init_schema.sql y falta activar RLS.

BEGIN;

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

DROP POLICY IF EXISTS treksafe_deny_anon_authenticated ON usuarios;
DROP POLICY IF EXISTS treksafe_deny_anon_authenticated ON perfiles_senderista;
DROP POLICY IF EXISTS treksafe_deny_anon_authenticated ON perfiles_rescatista;
DROP POLICY IF EXISTS treksafe_deny_anon_authenticated ON registros_institucionales_rescatista;
DROP POLICY IF EXISTS treksafe_deny_anon_authenticated ON fichas_medicas;
DROP POLICY IF EXISTS treksafe_deny_anon_authenticated ON contactos_emergencia;
DROP POLICY IF EXISTS treksafe_deny_anon_authenticated ON expediciones;
DROP POLICY IF EXISTS treksafe_deny_anon_authenticated ON acompanantes_expedicion;
DROP POLICY IF EXISTS treksafe_deny_anon_authenticated ON vinculos_expedicion_contacto;
DROP POLICY IF EXISTS treksafe_deny_anon_authenticated ON bitacoras_rescate;
DROP POLICY IF EXISTS treksafe_deny_anon_authenticated ON despachos_correo;
DROP POLICY IF EXISTS treksafe_deny_anon_authenticated ON auditoria_acceso_medico;

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

COMMIT;

-- =============================================================================
-- Reversión de 001 · HU-29. SOLO PARA BASES DESECHABLES.
-- En una base compartida (DEV/producción) borra definitivamente las plantillas
-- de todos los usuarios: no ejecutar sin acuerdo explícito del equipo.
-- =============================================================================
BEGIN;

DROP TABLE IF EXISTS plantillas_ruta CASCADE;
DROP FUNCTION IF EXISTS treksafe_plantillas_ruta_antes_de_actualizar() CASCADE;
DELETE FROM treksafe_migraciones WHERE version = '001';

COMMIT;

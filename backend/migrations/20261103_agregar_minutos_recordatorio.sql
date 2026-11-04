-- =============================================================================
-- Migración Release 2 - HU-38: Configurar anticipación de recordatorio
-- Archivo: backend/migrations/20261103_agregar_minutos_recordatorio.sql
-- Responsable: Fernando Quispe (HU-38)
-- Revisor / Coordinador de Migraciones: Sebastian Chapman
-- =============================================================================
-- Cumplimiento de Criterios:
-- CA-01: Permite elegir 15, 30 o 60 minutos, conservando 30 como valor inicial.
-- CA-02: Almacena la preferencia para que el cron evalúe el aviso según el umbral.
-- CA-03: No altera los campos de fecha límite (hora_retorno_estimada, minutos_tolerancia).
-- =============================================================================

ALTER TABLE expediciones
ADD COLUMN IF NOT EXISTS minutos_recordatorio INTEGER NOT NULL DEFAULT 30
CHECK (minutos_recordatorio IN (15, 30, 60));

-- Comentario para documentación
COMMENT ON COLUMN expediciones.minutos_recordatorio IS 'Anticipación en minutos para generar el aviso de recordatorio in-app (15, 30 o 60). Valor inicial: 30.';

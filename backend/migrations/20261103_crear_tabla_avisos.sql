-- =============================================================================
-- Migración Release 2 - HU-37: Bandeja de avisos in-app
-- Archivo: backend/migrations/20261103_crear_tabla_avisos.sql
-- Responsable: Fernando Quispe (HU-37)
-- Revisor / Coordinador de Migraciones: Sebastian Chapman
-- =============================================================================
-- Cumplimiento de Criterios:
-- CA-01: Consulta de avisos (edición, cancelación, ampliación, recordatorio)
-- CA-02: Persistencia de lectura entre sesiones
-- CA-03: Unicidad (evento_id único por usuario) y autorización RLS
-- =============================================================================

CREATE TABLE IF NOT EXISTS avisos_usuario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expedicion_id UUID REFERENCES expediciones(id) ON DELETE SET NULL,
  evento_id VARCHAR(150), -- Clave de idempotencia del evento para evitar duplicados (CA-03)
  tipo VARCHAR(50) NOT NULL, -- 'EDICION' | 'CANCELACION' | 'AMPLIACION' | 'RECORDATORIO' | 'SISTEMA'
  titulo VARCHAR(150) NOT NULL,
  mensaje TEXT NOT NULL,
  leido BOOLEAN NOT NULL DEFAULT false,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_usuario_evento UNIQUE NULLS NOT DISTINCT (usuario_id, evento_id)
);

-- Índices para optimizar la consulta de avisos por usuario y no leídos
CREATE INDEX IF NOT EXISTS idx_avisos_usuario_leido ON avisos_usuario(usuario_id, leido);
CREATE INDEX IF NOT EXISTS idx_avisos_usuario_fecha ON avisos_usuario(usuario_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_avisos_expedicion ON avisos_usuario(expedicion_id);

-- Habilitar Row Level Security (RLS)
ALTER TABLE avisos_usuario ENABLE ROW LEVEL SECURITY;

-- Política: El usuario autenticado solo puede consultar sus propios avisos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'avisos_usuario' AND policyname = 'avisos_select_propio'
  ) THEN
    CREATE POLICY avisos_select_propio ON avisos_usuario
      FOR SELECT
      USING (auth.uid() = usuario_id);
  END IF;
END $$;

-- Política: El usuario autenticado solo puede actualizar sus propios avisos (marcar como leído)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'avisos_usuario' AND policyname = 'avisos_update_propio'
  ) THEN
    CREATE POLICY avisos_update_propio ON avisos_usuario
      FOR UPDATE
      USING (auth.uid() = usuario_id)
      WITH CHECK (auth.uid() = usuario_id);
  END IF;
END $$;

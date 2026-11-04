-- Migración para HU-45: Outbox de notificaciones con lease y seguimiento de reintentos
-- Autor: Fernando Jesús Quispe Gamez (HU-45: Reintentar avisos fallidos sin perder su seguimiento)
-- Responsable de ejecución en DEV: Sebastian Chapman
-- Fecha: 2026-11-03

CREATE TABLE IF NOT EXISTS outbox_notificaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo_evento VARCHAR(50) NOT NULL,
    destinatario VARCHAR(255) NOT NULL,
    asunto VARCHAR(255) NOT NULL,
    cuerpo TEXT NOT NULL,
    cuerpo_html TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    estado VARCHAR(20) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'enviado', 'fallido', 'incierto')),
    intentos INT NOT NULL DEFAULT 0,
    max_intentos INT NOT NULL DEFAULT 3,
    proximo_intento_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    bloqueado_hasta TIMESTAMPTZ,
    bloqueado_por VARCHAR(100),
    ultimo_error TEXT,
    modo_envio VARCHAR(30), -- 'brevo-api' | 'smtp' | 'dev-log'
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    enviado_en TIMESTAMPTZ
);

-- Índices para optimizar la consulta del worker (lease y búsqueda por estado/fecha)
CREATE INDEX IF NOT EXISTS idx_outbox_worker_polling 
    ON outbox_notificaciones (estado, proximo_intento_en) 
    WHERE estado = 'pendiente';

CREATE INDEX IF NOT EXISTS idx_outbox_lease 
    ON outbox_notificaciones (bloqueado_hasta);

-- RLS: Solo lectura/escritura por service_role (worker de backend)
ALTER TABLE outbox_notificaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acceso total outbox service_role" ON outbox_notificaciones;
CREATE POLICY "Acceso total outbox service_role" 
    ON outbox_notificaciones 
    FOR ALL 
    TO service_role 
    USING (true) 
    WITH CHECK (true);

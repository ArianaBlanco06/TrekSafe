-- 012 · HU-45: Outbox de notificaciones con lease y seguimiento de reintentos
-- Autor: Fernando Jesús Quispe Gamez (HU-45: Reintentar avisos fallidos sin perder su seguimiento)
-- No depende de 000: registra la aplicacion solo si treksafe_migraciones existe.
BEGIN;

CREATE TABLE public.outbox_notificaciones (
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

-- Índices para optimizar la consulta del worker (polling de pendientes y control de lease)
CREATE INDEX idx_outbox_worker_polling 
    ON public.outbox_notificaciones (estado, proximo_intento_en) 
    WHERE estado = 'pendiente';

CREATE INDEX idx_outbox_lease 
    ON public.outbox_notificaciones (bloqueado_hasta);

COMMENT ON TABLE public.outbox_notificaciones IS
    'Cola outbox persistente para despacho confiable de correos con lease concurrente y reintentos exponenciales.';

-- RLS: Bloqueo estricto para anon y authenticated
ALTER TABLE public.outbox_notificaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY treksafe_deny_anon_authenticated ON public.outbox_notificaciones
    FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

REVOKE ALL ON public.outbox_notificaciones FROM PUBLIC, anon, authenticated;

-- Acceso exclusivo al backend mediante service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outbox_notificaciones TO service_role;

-- Registro de aplicación en la tabla de control treksafe_migraciones
DO $$
BEGIN
    IF to_regclass('public.treksafe_migraciones') IS NOT NULL THEN
        EXECUTE $sql$
            INSERT INTO public.treksafe_migraciones (version, nombre, hu)
            VALUES ('012', 'hu45_outbox', 'HU-45')
            ON CONFLICT (version) DO NOTHING
        $sql$;
    END IF;
END
$$;

COMMIT;

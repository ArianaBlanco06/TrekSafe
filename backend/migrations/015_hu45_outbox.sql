-- DEP-04 / HU-45: esquema canónico de outbox. No inicia envíos ni sustituye el cron.
-- Compatible con las columnas del PR #90; agrega identidad lógica obligatoria.
BEGIN;

CREATE TABLE public.outbox_notificaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clave_evento VARCHAR(150) NOT NULL CHECK (length(btrim(clave_evento)) > 0),
    canal VARCHAR(20) NOT NULL DEFAULT 'correo' CHECK (canal = 'correo'),
    tipo_evento VARCHAR(50) NOT NULL,
    destinatario VARCHAR(255) NOT NULL CHECK (
        destinatario ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
    ),
    destinatario_normalizado TEXT GENERATED ALWAYS AS (lower(btrim(destinatario))) STORED,
    asunto VARCHAR(255) NOT NULL,
    cuerpo TEXT NOT NULL,
    cuerpo_html TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
    estado VARCHAR(20) NOT NULL DEFAULT 'pendiente'
        CHECK (estado IN ('pendiente', 'enviado', 'fallido', 'incierto')),
    intentos INTEGER NOT NULL DEFAULT 0 CHECK (intentos >= 0),
    max_intentos INTEGER NOT NULL DEFAULT 3 CHECK (max_intentos BETWEEN 1 AND 20),
    proximo_intento_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    bloqueado_hasta TIMESTAMPTZ,
    bloqueado_por VARCHAR(100),
    ultimo_error TEXT,
    modo_envio VARCHAR(30),
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    enviado_en TIMESTAMPTZ,
    CONSTRAINT uq_outbox_evento_destinatario_canal
        UNIQUE (clave_evento, destinatario_normalizado, canal),
    CONSTRAINT ck_outbox_reserva_completa CHECK (
        (bloqueado_hasta IS NULL) = (bloqueado_por IS NULL)
    )
);

CREATE INDEX idx_outbox_worker_polling ON public.outbox_notificaciones
    (proximo_intento_en, id) WHERE estado = 'pendiente';
CREATE INDEX idx_outbox_lease ON public.outbox_notificaciones (bloqueado_hasta)
    WHERE bloqueado_hasta IS NOT NULL;
ALTER TABLE public.outbox_notificaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY treksafe_deny_anon_authenticated ON public.outbox_notificaciones
    FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
REVOKE ALL ON public.outbox_notificaciones FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.outbox_notificaciones TO service_role;
COMMENT ON TABLE public.outbox_notificaciones IS
    'Pendientes duraderos. enviado significa aceptación del transporte, nunca recepción. Sin datos médicos.';
COMMENT ON COLUMN public.outbox_notificaciones.clave_evento IS
    'Identidad estable del hecho lógico; un reintento conserva evento, destinatario y canal.';

INSERT INTO public.treksafe_migraciones (version, nombre, hu)
VALUES ('015', 'hu45_outbox', 'HU-45 / DEP-04');
COMMIT;

-- 013 · HU-37: Bandeja de avisos dentro de la aplicación
-- Autor: Fernando Jesús Quispe Gamez (HU-37: Consultar avisos dentro de la aplicación)
-- Requiere: 002_hu26_version_y_eventos_plan.sql (para la clave foránea a public.eventos_plan).
-- No depende de 000: registra la aplicación solo si treksafe_migraciones existe.
BEGIN;

CREATE TABLE public.avisos_usuario (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
    expedicion_id UUID REFERENCES public.expediciones(id) ON DELETE CASCADE,
    -- Evento del plan (edición, cancelación, ampliación). Vacío solo en recordatorios (HU-38).
    evento_id UUID REFERENCES public.eventos_plan(id) ON DELETE CASCADE,
    -- Clave de idempotencia: el id del evento, o 'RECORDATORIO:<expedicion>:<minutos>'.
    clave_evento VARCHAR(150) NOT NULL,
    tipo VARCHAR(50) NOT NULL CHECK (tipo IN ('edicion', 'cancelacion', 'ampliacion', 'recordatorio')),
    titulo VARCHAR(255) NOT NULL,
    mensaje TEXT NOT NULL,
    leido BOOLEAN NOT NULL DEFAULT FALSE,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Idempotencia estricta: un aviso por usuario y evento
    CONSTRAINT uq_aviso_usuario_clave UNIQUE (usuario_id, clave_evento),
    -- Edición, cancelación y ampliación siempre apuntan a un evento real del plan
    CONSTRAINT ck_aviso_evento_obligatorio CHECK (tipo = 'recordatorio' OR evento_id IS NOT NULL)
);

COMMENT ON TABLE public.avisos_usuario IS
    'Bandeja de avisos in-app: eventos del plan (con evento_id) y recordatorios de HU-38 (sin evento_id).';

CREATE INDEX idx_avisos_usuario_leido 
    ON public.avisos_usuario (usuario_id, leido, creado_en DESC);

CREATE INDEX idx_avisos_usuario_evento 
    ON public.avisos_usuario (evento_id);

-- RLS: Bloqueo estricto para anon y authenticated
ALTER TABLE public.avisos_usuario ENABLE ROW LEVEL SECURITY;

CREATE POLICY treksafe_deny_anon_authenticated ON public.avisos_usuario
    FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

REVOKE ALL ON public.avisos_usuario FROM PUBLIC, anon, authenticated;

-- Acceso exclusivo al backend mediante service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.avisos_usuario TO service_role;

-- Registro de aplicación en la tabla de control treksafe_migraciones
DO $$
BEGIN
    IF to_regclass('public.treksafe_migraciones') IS NOT NULL THEN
        EXECUTE $sql$
            INSERT INTO public.treksafe_migraciones (version, nombre, hu)
            VALUES ('013', 'hu37_avisos', 'HU-37')
            ON CONFLICT (version) DO NOTHING
        $sql$;
    END IF;
END
$$;

COMMIT;

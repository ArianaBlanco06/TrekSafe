-- Aplicar una vez, después de las dos migraciones de HU-30.
-- Confirmar numeración y orden con Sebastian antes de aplicar en DEV.
BEGIN;

CREATE TABLE public.preparaciones_expedicion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expedicion_id UUID NOT NULL UNIQUE REFERENCES public.expediciones(id) ON DELETE CASCADE,
    lista_origen_id UUID REFERENCES public.listas_equipo(id) ON DELETE SET NULL,
    nombre_lista TEXT NOT NULL CHECK (nombre_lista ~ '[^[:space:]]'),
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.items_preparacion_expedicion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    preparacion_id UUID NOT NULL REFERENCES public.preparaciones_expedicion(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL CHECK (nombre ~ '[^[:space:]]'),
    obligatorio BOOLEAN NOT NULL,
    preparado BOOLEAN NOT NULL DEFAULT FALSE,
    posicion INTEGER NOT NULL CHECK (posicion >= 0),
    UNIQUE (preparacion_id, posicion)
);

CREATE INDEX idx_preparaciones_lista_origen ON public.preparaciones_expedicion(lista_origen_id);

COMMENT ON TABLE public.preparaciones_expedicion IS
    'Copia privada e independiente de una lista por expedicion; el propietario se obtiene de expediciones.';
COMMENT ON TABLE public.items_preparacion_expedicion IS
    'Items copiados con identidad propia y marcas persistentes; no dependen de los items de la lista base.';

ALTER TABLE public.preparaciones_expedicion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items_preparacion_expedicion ENABLE ROW LEVEL SECURITY;
CREATE POLICY treksafe_deny_anon_authenticated ON public.preparaciones_expedicion
    FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY treksafe_deny_anon_authenticated ON public.items_preparacion_expedicion
    FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

REVOKE ALL ON public.preparaciones_expedicion, public.items_preparacion_expedicion
    FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.preparaciones_expedicion, public.items_preparacion_expedicion TO service_role;
-- SELECT FOR UPDATE requiere permisos de lectura y actualizacion del backend.
GRANT SELECT, UPDATE ON public.expediciones TO service_role;

COMMIT;

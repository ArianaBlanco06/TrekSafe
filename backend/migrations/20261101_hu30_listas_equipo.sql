-- HU-30: listas personales de equipo.
-- Requiere el esquema inicial de TrekSafe y los roles de Supabase.
-- Aplicar una sola vez, en el orden acordado con el responsable de migraciones.

BEGIN;

CREATE TABLE public.listas_equipo (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    senderista_id   UUID        NOT NULL,
    nombre          TEXT        NOT NULL,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_listas_equipo_senderista
        FOREIGN KEY (senderista_id)
        REFERENCES public.perfiles_senderista (usuario_id)
        ON DELETE CASCADE,
    CONSTRAINT chk_listas_equipo_nombre
        CHECK (nombre ~ '[^[:space:]]')
);

CREATE TABLE public.items_lista_equipo (
    id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    lista_equipo_id UUID    NOT NULL,
    nombre          TEXT    NOT NULL,
    obligatorio     BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT fk_items_lista_equipo_lista
        FOREIGN KEY (lista_equipo_id)
        REFERENCES public.listas_equipo (id)
        ON DELETE CASCADE,
    CONSTRAINT chk_items_lista_equipo_nombre
        CHECK (nombre ~ '[^[:space:]]')
);

CREATE INDEX idx_listas_equipo_senderista
    ON public.listas_equipo (senderista_id);

CREATE INDEX idx_items_lista_equipo_lista
    ON public.items_lista_equipo (lista_equipo_id);

COMMENT ON TABLE public.listas_equipo IS
    'Listas reutilizables privadas del senderista. Pueden no contener items.';
COMMENT ON TABLE public.items_lista_equipo IS
    'Items obligatorios u opcionales de una lista base; no representan equipo preparado.';
COMMENT ON COLUMN public.listas_equipo.actualizado_en IS
    'La operacion de escritura debe actualizar esta fecha junto con la lista y sus items.';

-- La API usa su JWT propio y service_role. No se expone acceso directo al cliente.
-- service_role evita RLS: el futuro DAO debe filtrar SIEMPRE por senderista_id.
ALTER TABLE public.listas_equipo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items_lista_equipo ENABLE ROW LEVEL SECURITY;

CREATE POLICY treksafe_deny_anon_authenticated ON public.listas_equipo
    FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY treksafe_deny_anon_authenticated ON public.items_lista_equipo
    FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

REVOKE ALL PRIVILEGES ON TABLE public.listas_equipo, public.items_lista_equipo
    FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.listas_equipo, public.items_lista_equipo TO service_role;

COMMIT;

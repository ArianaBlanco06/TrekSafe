-- 014 · HU-38: Anticipación de recordatorio de retorno (15, 30 o 60 minutos)
-- Autor: Fernando Jesús Quispe Gamez (HU-38: Configurar la anticipación del recordatorio)
-- No depende de 000: registra la aplicación solo si treksafe_migraciones existe.
BEGIN;

ALTER TABLE public.expediciones
    ADD COLUMN IF NOT EXISTS minutos_recordatorio INTEGER NOT NULL DEFAULT 30
    CHECK (minutos_recordatorio IN (15, 30, 60));

COMMENT ON COLUMN public.expediciones.minutos_recordatorio IS
    'Anticipación en minutos para generar el recordatorio in-app (15, 30 o 60). Valor inicial: 30.';

DO $$
BEGIN
    IF to_regclass('public.treksafe_migraciones') IS NOT NULL THEN
        EXECUTE $sql$
            INSERT INTO public.treksafe_migraciones (version, nombre, hu)
            VALUES ('014', 'hu38_minutos_recordatorio', 'HU-38')
            ON CONFLICT (version) DO NOTHING
        $sql$;
    END IF;
END
$$;

COMMIT;

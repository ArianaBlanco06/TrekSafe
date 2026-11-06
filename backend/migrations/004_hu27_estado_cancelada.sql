-- =============================================================================
-- 004 · HU-27: valor 'cancelada' en estado_expedicion_enum
-- Requiere: esquema de init_schema.sql (estado_expedicion_enum).
-- Re-ejecutable: ADD VALUE IF NOT EXISTS no falla si el valor ya existe.
-- No depende de 000: registra la aplicación solo si treksafe_migraciones existe.
--
-- Va sola y antes de 005: Postgres no permite usar un valor de enum nuevo en la
-- misma transacción que lo agrega. Ninguna sentencia de este archivo nombra
-- 'cancelada' fuera del ALTER TYPE.
--
-- Reversión: Postgres no permite quitar un valor de un enum. Para deshacerla hay
-- que recrear el tipo, y antes ninguna fila puede estar en 'cancelada'.
-- =============================================================================
BEGIN;

ALTER TYPE public.estado_expedicion_enum ADD VALUE IF NOT EXISTS 'cancelada';

DO $$
BEGIN
    IF to_regclass('public.treksafe_migraciones') IS NOT NULL THEN
        EXECUTE $sql$
            INSERT INTO public.treksafe_migraciones (version, nombre, hu)
            VALUES ('004', 'hu27_estado_cancelada', 'HU-27')
            ON CONFLICT (version) DO NOTHING
        $sql$;
    END IF;
END
$$;

COMMIT;

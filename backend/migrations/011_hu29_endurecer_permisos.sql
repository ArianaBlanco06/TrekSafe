-- =============================================================================
-- 011 · HU-29: endurecer permisos de 000 y 001
-- Requiere: 000_registro_migraciones.sql y 001_hu29_plantillas_ruta.sql.
-- Re-ejecutable: ALTER FUNCTION, REVOKE y GRANT son idempotentes.
--
-- 000 y 001 no retiraron los privilegios por defecto que Supabase concede a
-- anon/authenticated sobre tablas y funciones nuevas. RLS con la política
-- treksafe_deny_anon_authenticated ya bloquea el acceso; esto alinea los
-- permisos con el resto del esquema (defensa en profundidad) y fija el
-- search_path de la función del trigger (aviso del Security Advisor).
-- =============================================================================
BEGIN;

ALTER FUNCTION public.treksafe_plantillas_ruta_antes_de_actualizar()
    SET search_path = '';

REVOKE ALL ON FUNCTION public.treksafe_plantillas_ruta_antes_de_actualizar()
    FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public.plantillas_ruta, public.treksafe_migraciones
    FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.plantillas_ruta TO service_role;

INSERT INTO public.treksafe_migraciones (version, nombre, hu)
VALUES ('011', 'hu29_endurecer_permisos', 'HU-29')
ON CONFLICT (version) DO NOTHING;

COMMIT;

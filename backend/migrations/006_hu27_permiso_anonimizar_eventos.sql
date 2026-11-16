-- =============================================================================
-- 006 · HU-27: permiso para anonimizar eventos_plan (derechos ARCO)
-- Requiere: 002_hu26_version_y_eventos_plan.sql.
-- Re-ejecutable: GRANT es idempotente.
-- No depende de 000: registra la aplicación solo si treksafe_migraciones existe.
--
-- RepositorioUsuario.anonimizarHistorialRutas vacía cambios y motivo de los
-- eventos de las expediciones anonimizadas. 002 solo concede SELECT e INSERT; en
-- Supabase service_role ya recibe ALL por los privilegios por defecto, pero este
-- GRANT lo hace explícito y limitado a las dos columnas con datos personales.
-- El resto del evento (tipo, fecha, versión, actor, operación) sigue sin UPDATE
-- en el contrato.
-- =============================================================================
BEGIN;

GRANT UPDATE (cambios, motivo) ON public.eventos_plan TO service_role;

DO $$
BEGIN
    IF to_regclass('public.treksafe_migraciones') IS NOT NULL THEN
        EXECUTE $sql$
            INSERT INTO public.treksafe_migraciones (version, nombre, hu)
            VALUES ('006', 'hu27_permiso_anonimizar_eventos', 'HU-27')
            ON CONFLICT (version) DO NOTHING
        $sql$;
    END IF;
END
$$;

COMMIT;

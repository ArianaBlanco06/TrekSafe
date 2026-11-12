-- =============================================================================
-- Reinicio de la migración de HU-40 (021; antes 019) SOLO para el proyecto Supabase PERSONAL de pruebas.
--
-- NO ejecutar en el DEV del equipo ni en producción. No es una migración: no va en
-- backend/migrations y no se registra en REGISTRO_APLICACION.md.
--
-- Por qué existe: la migración de HU-40 se corrigió en sitio (HU-40 amplía el relevo con rechazar y
-- cancelar) porque nunca llegó a develop ni a un entorno compartido. El proyecto personal
-- sí tiene la versión anterior (registrada entonces como 019, hoy 021 porque HU-41 usó la 019),
-- y la migración no es re-ejecutable (CREATE TABLE falla si ya
-- existe). Este script deja ese proyecto como estaba justo antes de HU-40 (017 + 018, y la 019 de HU-41
-- si la tuviera).
--
-- Alcance: únicamente objetos de HU-40.
--   * Borra las dos tablas de HU-40 y, con ellas, TODOS los relevos y transferencias de
--     prueba (marca HU40-PRUEBA). No toca incidentes, expediciones, usuarios ni perfiles.
--   * Borra las funciones de HU-40, incluidas las nuevas si ya se hubiera aplicado la 021
--     corregida.
--   * Quita a service_role el UPDATE de incidentes que añadió HU-40 (deja SELECT e INSERT de
--     la 017 y, si existe la bitácora de HU-41, su UPDATE (version)) y el comentario de la
--     columna asumido_en. No hace REVOKE ALL, para no tocar permisos de otras migraciones.
--   * Quita el asiento de HU-40 de treksafe_migraciones (versión '019' o '021', siempre por el
--     nombre hu40_transferir_coordinacion, para no borrar el asiento '019' de HU-41).
--
-- Después de ejecutarlo:
--   1. Aplicar backend/migrations/021_hu40_transferir_coordinacion.sql UNA sola vez
--      (o, si el proyecto ya tiene exactamente esa versión de HU-40, no hace falta reiniciar).
--   2. Ejecutar:  NOTIFY pgrst, 'reload schema';
--
-- Comprobación previa (solo lectura): confirmar en el panel que la referencia del proyecto
-- es la personal antes de pegar este script.
-- =============================================================================
BEGIN;

-- Funciones de HU-40, por su firma exacta y antes que las tablas (dos reciben sus tipos).
DROP FUNCTION IF EXISTS public.treksafe_rechazar_relevo(UUID, UUID, UUID, UUID);
DROP FUNCTION IF EXISTS public.treksafe_cancelar_relevo(UUID, UUID, UUID, UUID);
DROP FUNCTION IF EXISTS public.treksafe_resolver_relevo(UUID, UUID, UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.treksafe_aceptar_relevo(UUID, UUID, UUID, UUID);
DROP FUNCTION IF EXISTS public.treksafe_proponer_relevo(UUID, UUID, UUID, TEXT, INTEGER, UUID);
DROP FUNCTION IF EXISTS public.treksafe_resultado_relevo(public.incidentes, public.relevos_coordinacion, BOOLEAN);
DROP FUNCTION IF EXISTS public.treksafe_relevo_publico(public.relevos_coordinacion);

-- Tablas de HU-40: primero la que referencia a la otra. Sus triggers y la función de solo
-- anexar se van con la tabla y con el DROP FUNCTION siguiente.
DROP TABLE IF EXISTS public.transferencias_coordinacion;
DROP TABLE IF EXISTS public.relevos_coordinacion;
DROP FUNCTION IF EXISTS public.treksafe_transferencias_solo_anexado();

-- incidentes: sin el UPDATE que añadió HU-40 y sin su comentario. Solo se revoca UPDATE (no
-- ALL): SELECT e INSERT de la 017 se conservan. Quitar el UPDATE de tabla retira también los
-- permisos de UPDATE por columna, así que, si existe la bitácora de HU-41, se devuelve su
-- UPDATE (version).
REVOKE UPDATE ON public.incidentes FROM service_role;
DO $$
BEGIN
    IF to_regclass('public.entradas_bitacora_incidente') IS NOT NULL THEN
        GRANT UPDATE (version) ON public.incidentes TO service_role;
    END IF;
END
$$;
COMMENT ON COLUMN public.incidentes.asumido_en IS NULL;

-- Asiento de HU-40 (si existe el registro de migraciones), por nombre: en el proyecto personal
-- quedó como '019'; con la numeración actual es '021'. El asiento '019' de HU-41 no se toca.
DO $$
BEGIN
    IF to_regclass('public.treksafe_migraciones') IS NOT NULL THEN
        EXECUTE $sql$
            DELETE FROM public.treksafe_migraciones
             WHERE nombre = 'hu40_transferir_coordinacion' AND version IN ('019', '021')
        $sql$;
    END IF;
END
$$;

-- Verificación: no debe quedar nada de HU-40 y la 017 debe seguir intacta.
DO $$
BEGIN
    IF to_regclass('public.relevos_coordinacion') IS NOT NULL
       OR to_regclass('public.transferencias_coordinacion') IS NOT NULL THEN
        RAISE EXCEPTION 'Quedan tablas de HU-40';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
               WHERE n.nspname = 'public'
                 AND p.proname IN ('treksafe_proponer_relevo', 'treksafe_aceptar_relevo',
                                   'treksafe_rechazar_relevo', 'treksafe_cancelar_relevo',
                                   'treksafe_resolver_relevo', 'treksafe_resultado_relevo',
                                   'treksafe_relevo_publico', 'treksafe_transferencias_solo_anexado')) THEN
        RAISE EXCEPTION 'Quedan funciones de HU-40';
    END IF;
    IF to_regclass('public.incidentes') IS NULL THEN
        RAISE EXCEPTION 'Falta incidentes (017): este no es el estado esperado';
    END IF;
    IF has_table_privilege('service_role', 'public.incidentes', 'UPDATE') THEN
        RAISE EXCEPTION 'service_role no debe tener UPDATE de tabla completa sobre incidentes';
    END IF;
END
$$;

COMMIT;

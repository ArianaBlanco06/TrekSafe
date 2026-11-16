# Creación del proyecto Supabase DEV de Release 2

Proyecto: `treksafe-dev-r2` (`ibnwggvqgjpeqcretjak`), organización TrekSAfe-v.2, región us-east-2.

Estos dos archivos **ya están aplicados** en DEV. Se ejecutaron el 2026-11-02 (UTC) con
las herramientas de Supabase, por eso aparecen en `supabase_migrations.schema_migrations`
y no en `treksafe_migraciones`. Se guardan aquí solo como documentación: **no volver a
ejecutarlos**.

| Versión Supabase | Archivo | Contenido |
|---|---|---|
| 20261102031915 | `20261102031915_inicializar_treksafe_dev_r2.sql` | Esquema base. Equivale a `init_schema.sql` del commit `f89d6af` sin los `DROP`, con guarda que aborta si `public` no está vacío, `SECURITY INVOKER` y `search_path` en la RPC del cron, y `REVOKE` de tablas y RPC para `anon`/`authenticated`. Incluye datos semilla de prueba. |
| 20261102032432 | `20261102032432_restringir_funcion_auxiliar_rls_dev.sql` | Retira `EXECUTE` de `rls_auto_enable()` (función `SECURITY DEFINER` de Supabase) a clientes. |

Las migraciones de Release 2 posteriores (`000`, `001`, `002`…) están en `backend/migrations/`
y su aplicación se anota en `REGISTRO_APLICACION.md`.

> Los datos semilla incluyen cuentas de prueba con contraseña conocida. Son solo para DEV:
> no usar este script en producción.

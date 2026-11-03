# Migraciones SQL de TrekSafe

Los cambios de esquema de Release 2 viven en esta carpeta. Los archivos `sprint*_migration.sql` y `post_mvp_migration.sql` de la raíz están obsoletos.

**No ejecutes `init_schema.sql` en una base compartida:** borra y recrea todo el esquema.

## Convención

- Nombre: `NNN_huXX_descripcion.sql` (tres dígitos y el número de historia).
- Se aplican en orden numérico, una sola vez por entorno, con el SQL Editor de Supabase o con `psql -v ON_ERROR_STOP=1 -f <archivo>`.
- Cada archivo se ejecuta dentro de `BEGIN; ... COMMIT;`.
- Las tablas nuevas activan RLS y crean la política `treksafe_deny_anon_authenticated`. El backend entra con `service_role`.
- Las funciones invocadas por RPC usan `SECURITY INVOKER` y `search_path` vacío, y solo `service_role` puede ejecutarlas.

## Orden de aplicación

| Archivo | Contenido | Requiere |
|---|---|---|
| `002_hu26_version_y_eventos_plan.sql` | Columna `expediciones.version` y tabla `eventos_plan` | Esquema inicial |
| `003_hu26_rpc_editar_expedicion.sql` | Función `treksafe_editar_expedicion` | `002` |
| `004_hu27_estado_cancelada.sql` | Valor `cancelada` en `estado_expedicion_enum` | Esquema inicial |

Estas migraciones son re-ejecutables. No dependen de `000_registro_migraciones.sql`: si la tabla `treksafe_migraciones` existe, registran su aplicación, y si no existe, continúan.

## Despliegue

Aplica las migraciones **antes** de desplegar el backend. El código de HU-26 selecciona `expediciones.version`, por lo que sin `002` también fallarían los listados y `GET /api/expediciones/activa`.

`004` debe ejecutarse **sola y confirmada** antes de `005`: Postgres no permite usar un valor de enum nuevo en la misma transacción que lo agrega. Un valor de enum no se puede quitar; revertir `004` exige recrear el tipo.

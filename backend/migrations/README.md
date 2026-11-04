# Migraciones SQL de TrekSafe

Los cambios de esquema de Release 2 viven en esta carpeta. Los archivos `sprint*_migration.sql` y `post_mvp_migration.sql` de la raíz están obsoletos.

**No ejecutes `init_schema.sql` en una base compartida:** borra y recrea todo el esquema.

## Convención

- Nombre: `NNN_huXX_descripcion.sql` (tres dígitos y el número de historia o `transversal`). Reversión opcional: `NNN_huXX_descripcion.down.sql`.
- Se aplican en orden numérico, una sola vez por entorno, con el SQL Editor de Supabase o con `psql -v ON_ERROR_STOP=1 -f <archivo>`.
- Cada archivo se ejecuta dentro de `BEGIN; ... COMMIT;`.
- Las tablas nuevas activan RLS y crean la política `treksafe_deny_anon_authenticated`. El backend entra con `service_role`.
- Las funciones invocadas por RPC usan `SECURITY INVOKER` y `search_path` vacío, y solo `service_role` puede ejecutarlas.
- Cada dueño de HU escribe su SQL; Sebastián revisa y coordina la numeración.
- `000` crea `treksafe_migraciones`. HU-29 requiere ese registro y rechaza repeticiones; las excepciones re-ejecutables de HU-26 se detallan abajo.
- Solo se anotan en `REGISTRO_APLICACION.md` las aplicaciones realmente ejecutadas.

## Orden de aplicación

| Archivo | Contenido | Requiere |
|---|---|---|
| `000_registro_migraciones.sql` | Registro transversal de versiones | Esquema inicial |
| `001_hu29_plantillas_ruta.sql` | Plantillas personales de ruta | `000` |
| `002_hu26_version_y_eventos_plan.sql` | Columna `expediciones.version` y tabla `eventos_plan` | Esquema inicial |
| `003_hu26_rpc_editar_expedicion.sql` | Función `treksafe_editar_expedicion` | `002` |

Estas dos migraciones son re-ejecutables. No dependen de `000_registro_migraciones.sql`: si la tabla `treksafe_migraciones` existe, registran su aplicación, y si no existe, continúan.

## Despliegue

Aplica las migraciones **antes** de desplegar el backend. El código de HU-26 selecciona `expediciones.version`, por lo que sin `002` también fallarían los listados y `GET /api/expediciones/activa`.
## Numeración reservada

| Rango | Dueño / HU |
|-------|------------|
| 000 | Registro de migraciones (transversal) |
| 001 | HU-29 plantillas |
| 002-009 | Favio, sprint 1 (HU-26, HU-27, HU-35) |
| 010 | HU-36 |
| 011-019 | Favio, sprint 2 (HU-39, HU-40) |
| 020 | HU-41 |
| 021 | HU-42 |
| 022 | HU-50 |

Otros desarrolladores toman números libres coordinando con Sebastián.

## Orden de aplicación en un entorno nuevo

1. `init_schema.sql` (solo en una base vacía o desechable).
2. `000_registro_migraciones.sql`
3. `001_hu29_plantillas_ruta.sql`
4. `002_hu26_version_y_eventos_plan.sql`
5. `003_hu26_rpc_editar_expedicion.sql`

## Base desechable local (para probar SQL)

Requiere PostgreSQL instalado localmente (no usa Docker ni Supabase).

```bash
initdb -D <directorio>/pgdata -U postgres -A trust -E UTF8
pg_ctl -D <directorio>/pgdata -o "-p 55432 -c listen_addresses=127.0.0.1" -l <directorio>/pg.log start
createdb -h 127.0.0.1 -p 55432 -U postgres treksafe_desechable
```

La suite de integración se ejecuta con:

```bash
TREKSAFE_PG_TEST_URL=postgres://postgres@127.0.0.1:55432/treksafe_desechable npm run test:migraciones --prefix backend
```

Guardas obligatorias: la prueba se niega a ejecutar SQL si el host no es `127.0.0.1`/`localhost` o si el nombre de la base no contiene `desechable`. Recrea el esquema `public` de esa base, así que no apuntarla a datos que importen. Al terminar: `pg_ctl -D <directorio>/pgdata stop`.

Sin la variable `TREKSAFE_PG_TEST_URL` la suite se omite y `npm test` sigue funcionando.

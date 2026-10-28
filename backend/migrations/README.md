# Migraciones SQL de TrekSafe

Los archivos `sprint*_migration.sql` y `post_mvp_migration.sql` de la raíz están obsoletos. A partir de Release 2 los cambios de esquema viven aquí.

## Convención

- Nombre: `NNN_huXX_descripcion.sql` (tres dígitos, `huXX` con el número de historia o `transversal`). Reversión opcional: `NNN_huXX_descripcion.down.sql`.
- Se aplican en orden numérico. Cada migración registra su versión en `treksafe_migraciones` (creada por `000`).
- Cada migración va dentro de `BEGIN; ... COMMIT;`, habilita RLS en sus tablas nuevas y crea la política `treksafe_deny_anon_authenticated` (el backend usa `service_role`).
- Cada dueño de HU escribe su propio SQL; Sebastián lo revisa y asigna/coordina el número.
- **No ejecutar `init_schema.sql` en bases compartidas**: borra y recrea todo el esquema.
- Una migración que ya está registrada falla de forma explícita al repetirse (salvo `000`, que es idempotente).
- Solo se anotan en `REGISTRO_APLICACION.md` las aplicaciones realmente ejecutadas.

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

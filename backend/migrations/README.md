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

Las migraciones `002` y `003` son re-ejecutables. No dependen de `000_registro_migraciones.sql`: si la tabla `treksafe_migraciones` existe, registran su aplicación, y si no existe, continúan.

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
## HU-30: migración de listas personales de equipo

Estas migraciones preparan la persistencia de las listas personales de equipo. El
avance de reglas y casos de uso se describe en [HU-30](../../docs/hu-30-equipo.md);
la API y la pantalla están implementadas. Los archivos están pendientes de revisión y
aplicación coordinada en Supabase DEV con Sebastian; este documento no registra
una aplicación en la base compartida.

### Archivos y requisitos

Aplicar en este orden sobre el esquema inicial de TrekSafe:

1. `20261101_hu30_listas_equipo.sql`: tablas, relaciones e índices.
2. `20261101_hu30_operaciones_equipo.sql`: posición interna de ítems y RPC.

Requieren los roles `anon`, `authenticated` y `service_role` de Supabase. No dependen
de otras HU nuevas. Sus nombres y posiciones deben ajustarse al orden del Issue #56 antes de integrarlos,
si el equipo ya tiene una convención diferente.

Cada archivo se ejecuta una sola vez, dentro de una transacción. Si los objetos ya
existen, falla para evitar ocultar diferencias entre esquemas. No se crea un sistema
de versionado ni sustituye el registro de aplicaciones del equipo.

### Modelo

| Tabla | Datos y restricciones |
| --- | --- |
| `listas_equipo` | UUID, propietario senderista, nombre y fechas. Permite cero ítems. |
| `items_lista_equipo` | UUID, lista, nombre, indicador obligatorio y posición interna. |

Los nombres rechazan cadenas vacías o compuestas únicamente por espacios, tabuladores
o saltos de línea. No se impone unicidad de nombres ni un límite nuevo de ítems.
Hay índices por propietario y por lista. Eliminar una lista elimina sus ítems;
eliminar una cuenta elimina sus listas mediante las relaciones existentes.

La segunda migración asigna a los ítems existentes una posición determinista por
UUID dentro de su lista, porque el esquema previo no almacenaba orden. Después,
las RPC conservan el orden del formulario y actualizan `actualizado_en`.

### Acceso y escrituras

Se conserva el modelo del proyecto: el cliente consume la API con el JWT propio
de TrekSafe. Las tablas tienen RLS, políticas de denegación y permisos de acceso
directo revocados para `anon` y `authenticated`. `service_role` recibe permisos
CRUD y evita RLS, por lo que el servicio y las RPC exigen y comprueban el propietario.

Las RPC de creación y edición guardan la lista y su colección en una transacción.
La edición bloquea la fila de la lista y comprueba propiedad, pertenencia y duplicados
antes de modificarla. La eliminación incluye la cascada. Las funciones usan
`SECURITY INVOKER`, `search_path` fijo y permisos de ejecución únicamente para el
backend. No se proporcionan funciones `SECURITY DEFINER` ni acceso desde el cliente.

Los ítems de esta historia son una lista base. La copia a una expedición y las
marcas de preparación corresponden a HU-31 y se incorporarán por separado.

### Aplicación y verificación

1. Sebastian confirma el archivo y su orden; el entorno de destino debe ser DEV.
2. Ejecutar los dos archivos en el orden indicado con el propietario
   del esquema, mediante el SQL Editor o `psql` con detención ante errores.
3. Comprobar tablas, relaciones, índices, políticas, funciones y permisos.
4. Registrar archivo, fecha y commit en el registro de migraciones del equipo.

No ejecutar nuevamente `init_schema.sql` en una base compartida: elimina tablas.
Tampoco aplicar las migraciones históricas obsoletas como parte de esta historia.

Las pruebas de `tests/hu30_listas_equipo.test.sql` y `tests/hu30_operaciones_equipo.test.sql`
se ejecutan únicamente en una base desechable con el esquema inicial y ambas migraciones aplicadas. Por ejemplo,
desde la raíz del repositorio, con una conexión **local de pruebas** configurada:

```powershell
psql -X -v ON_ERROR_STOP=1 -f backend/migrations/tests/hu30_listas_equipo.test.sql
psql -X -v ON_ERROR_STOP=1 -f backend/migrations/tests/hu30_operaciones_equipo.test.sql
```

El archivo usa cuentas ficticias, prueba listas vacías, indicadores obligatorios
y opcionales, nombres inválidos, claves foráneas, cascadas, rollback y permisos.
Finaliza con `ROLLBACK`. Si se ejecuta desde una herramienta con una sesión
persistente y falla, ejecutar `ROLLBACK` antes de continuar.

El script `backend/scripts/test-hu30-postgres.ps1` prepara y apaga automáticamente
una instancia local desechable y ejecuta también las suites de contrato y HTTP.
Desde la fase 7 requiere las dependencias de ambas carpetas y ejecuta también el
frontend, incluyendo el recorrido integrado React, HTTP y PostgreSQL con dos usuarios.
El alcance y los límites de estas comprobaciones se describen en la documentación
de HU-30. No equivalen a una validación de PostgREST en Supabase DEV.

### Evidencia de HU-30

El 1 de noviembre de 2026 se aplicaron el esquema inicial y esta migración en una
instancia local desechable de PostgreSQL 18, con los tres roles de Supabase
reproducidos para la prueba. El archivo de pruebas terminó correctamente.
Después del `ROLLBACK` quedaron las dos cuentas semilla originales, cero listas
y cero ítems. La instancia se apagó al terminar.

Esta ejecución no se conectó a Supabase ni acredita una aplicación en DEV.

# Migraciones SQL de TrekSafe

Los cambios de esquema de Release 2 viven en esta carpeta. Los archivos
`sprint*_migration.sql` y `post_mvp_migration.sql` de la raíz están obsoletos.

**No ejecutes `init_schema.sql` en una base compartida:** borra y recrea todo el esquema.

## Convención

- Nombre para nuevas migraciones: `NNN_huXX_descripcion.sql` (tres dígitos y el número de historia).
- Se aplican en el orden acordado con Sebastian, una sola vez por entorno, con el
  SQL Editor de Supabase o con `psql -v ON_ERROR_STOP=1 -f <archivo>`.
- Cada archivo se ejecuta dentro de `BEGIN; ... COMMIT;`.
- Las tablas nuevas activan RLS y crean la política `treksafe_deny_anon_authenticated`.
  El backend entra con `service_role`.
- Las funciones invocadas por RPC usan `SECURITY INVOKER` y `search_path` vacío,
  y solo `service_role` puede ejecutarlas.

## Orden de aplicación

| Archivo | Contenido | Requiere |
|---|---|---|
| `000_registro_migraciones.sql` | Tabla `treksafe_migraciones` (registro transversal). Idempotente | Esquema inicial |
| `001_hu29_plantillas_ruta.sql` | Tabla `plantillas_ruta` de HU-29. Reversión: `001_hu29_plantillas_ruta.down.sql` (solo base desechable) | `000` |
| `002_hu26_version_y_eventos_plan.sql` | Columna `expediciones.version` y tabla `eventos_plan` | Esquema inicial |
| `003_hu26_rpc_editar_expedicion.sql` | Función `treksafe_editar_expedicion` | `002` |
| `004_hu27_estado_cancelada.sql` | Valor `cancelada` en `estado_expedicion_enum` | Esquema inicial |
| `005_hu27_rpc_cancelar_expedicion.sql` | Función `treksafe_cancelar_expedicion` | `002` y `004` confirmada |
| `006_hu27_permiso_anonimizar_eventos.sql` | `UPDATE (cambios, motivo)` sobre `eventos_plan` para `service_role` (anonimización ARCO) | `002` |
| `007_hu35_rpc_ampliar_retorno.sql` | Funciones `treksafe_fecha_limite` y `treksafe_ampliar_retorno` | `002` |
| `010_hu36_eventos_plan_solo_anexado.sql` | `eventos_plan` solo anexado: lista blanca de `cambios`, `ocurrido_en` del servidor, sin UPDATE salvo anonimización ARCO, sin DELETE salvo la cascada (detectada porque la expedición ya no existe), sin TRUNCATE | `002` y `006` |
| `20261101_hu30_listas_equipo.sql` | Tablas de listas personales e ítems, relaciones y permisos | Esquema inicial |
| `20261101_hu30_operaciones_equipo.sql` | Posición de ítems y RPC de listas de equipo | `20261101_hu30_listas_equipo.sql` |
| `008_hu31_preparacion_expedicion.sql` | Copia de equipo por expedición, ítems, restricciones y permisos | Las dos migraciones de HU-30; integrar después de HU-27 |
| `009_hu31_operaciones_preparacion.sql` | RPC de consulta, asociación atómica y marcas de preparación | `008_hu31_preparacion_expedicion.sql` |

Las migraciones `002` a `007` y `010` son re-ejecutables. No dependen de
`000_registro_migraciones.sql`: si la tabla `treksafe_migraciones` existe, registran
su aplicación, y si no existe, continúan.

`007` define `treksafe_fecha_limite(hora, tolerancia)`, que calcula el límite de retorno
igual que la función del cron de `init_schema.sql` y que `calcularFechaLimite` en
TypeScript. No modifica la función del cron.

HU-30 conserva los nombres con fecha con los que se preparó y aplicó en DEV,
según lo confirmado por Jhon. Sus dos archivos se ejecutan una sola vez y en el
orden indicado; no son re-ejecutables. No dependen de HU-26. Sebastian mantiene
el registro de aplicación por entorno con archivo, fecha y commit.

## Despliegue

Aplica las migraciones **antes** de desplegar el backend. El código de HU-26
selecciona `expediciones.version`, por lo que sin `002` también fallarían los
listados y `GET /api/expediciones/activa`. La API de HU-30 requiere sus tablas y RPC.
La API `/api/plantillas` de HU-29 requiere `000` y `001`.

## HU-29: plantillas personales de ruta

`001` no es re-ejecutable: falla de forma explícita si su versión ya está registrada
en `treksafe_migraciones`. Solo se anotan en `REGISTRO_APLICACION.md` las
aplicaciones realmente ejecutadas.

La suite de integración de `000`/`001` corre solo contra una base local desechable:

```bash
TREKSAFE_PG_TEST_URL=postgres://postgres@127.0.0.1:55432/treksafe_desechable npm run test:migraciones --prefix backend
```

La prueba se niega a ejecutar SQL si el host no es `127.0.0.1`/`localhost` o si el
nombre de la base no contiene `desechable`, y recrea el esquema `public` de esa base.
Sin `TREKSAFE_PG_TEST_URL` la suite se omite y `npm test` sigue funcionando.

`004` debe ejecutarse **sola y confirmada** antes de `005`: Postgres no permite usar
un valor de enum nuevo en la misma transacción que lo agrega. Un valor de enum no se
puede quitar; revertir `004` exige recrear el tipo.

## HU-30: listas personales de equipo

Estas migraciones preparan la persistencia de las listas personales de equipo. El
avance de reglas y casos de uso se describe en [HU-30](../../docs/hu-30-equipo.md).
La API y la pantalla están implementadas. La evidencia funcional de DEV se adjunta
al issue #30 y al PR #62; el registro de aplicación del equipo conserva los datos
de la ejecución de las migraciones.

### Archivos y requisitos

Aplicar en este orden sobre el esquema inicial de TrekSafe:

1. `20261101_hu30_listas_equipo.sql`: tablas, relaciones e índices.
2. `20261101_hu30_operaciones_equipo.sql`: posición interna de ítems y RPC.

Requieren los roles `anon`, `authenticated` y `service_role` de Supabase. No dependen
de otras HU nuevas. Su orden de aplicación se coordina en el Issue #56;
se conservan los nombres de los archivos ya aplicados.

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

### Evidencia local inicial

El 1 de noviembre de 2026 se aplicaron el esquema inicial y esta migración en una
instancia local desechable de PostgreSQL 18, con los tres roles de Supabase
reproducidos para la prueba. El archivo de pruebas terminó correctamente.
Después del `ROLLBACK` quedaron las dos cuentas semilla originales, cero listas
y cero ítems. La instancia se apagó al terminar.

Esta ejecución no se conectó a Supabase ni acredita una aplicación en DEV.

## HU-31: preparación de equipo por expedición

Los archivos `008_hu31_preparacion_expedicion.sql` y
`009_hu31_operaciones_preparacion.sql` sustituyen los nombres iniciales de HU-31
para evitar el choque de numeración con HU-27 (PR #65), que se integra antes.
**Su aplicación en DEV sigue pendiente.** Se aplican una sola vez; no son
re-ejecutables.

Antes de `COMMIT`, cada archivo registra su versión (`008` o `009`), nombre y
`HU-31` en `public.treksafe_migraciones` solo si esa tabla existe. El bloque usa
`ON CONFLICT (version) DO NOTHING`, igual que HU-27. Esto hace repetible el
registro, no el DDL de tablas o funciones. No se crea ni modifica la tabla de
registro y no se vuelven a ejecutar `000` o `001` en DEV.

La suite local de HU-31 comprueba estos archivos completos sin registro, con
registro vacío y con versiones existentes. Las versiones previas conservan su
fecha y autor. Esas variantes usan bases temporales nuevas y las eliminan al
terminar; no reejecutan el DDL sobre las tablas de preparación ya creadas.

Se requieren las dos migraciones de HU-30, incluyendo la posición de sus ítems.
El orden es el de dependencias de esta tabla, no el orden alfabético de archivos.
No hay que volver a ejecutar las migraciones de HU-30 ya aplicadas en DEV.

`preparaciones_expedicion` admite una sola copia por expedición y conserva el
nombre de la lista. `items_preparacion_expedicion` guarda nombres, obligatoriedad,
orden y marcas con identidades propias. La eliminación de la lista origen deja
su referencia nula, conservando contenido y marcas. Eliminar una expedición
elimina cabecera e ítems por cascada. El contador se calcula en el dominio.

Las RPC son `treksafe_obtener_preparacion`,
`treksafe_asociar_lista_expedicion` y `treksafe_establecer_item_preparado`. Exigen
propiedad y vuelven a comprobar estado dentro de la escritura. La asociación
bloquea expedición y lista base; las marcas bloquean expedición y preparación.
Solo `programada` y `en_progreso` admiten escrituras. Una asociación existente
no se reemplaza y un reintento de marca no invierte su valor.

Las tablas activan RLS y deniegan acceso directo a los roles del cliente. Solo
el backend puede ejecutar las funciones, con `SECURITY INVOKER` y `search_path`
vacío. Se conceden lectura y actualización de `expediciones` a `service_role`
para la consulta y los bloqueos; la RPC de equipo no cambia los datos del plan.

Para reproducir las pruebas con Node 22 y PostgreSQL instalados:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File backend/scripts/test-hu31-postgres.ps1 -PostgresBin "C:\Program Files\PostgreSQL\18\bin"
```

El script reutiliza el entorno local desechable de HU-30 y añade HU-31 mediante
`-IncluirPreparacion`. Crea una instancia temporal en loopback, ejecuta migraciones,
`tests/hu31_preparacion.test.sql`, backend e integraciones frontend de HU-30 y HU-31; verifica
la limpieza y apaga la instancia en `finally`. Las pruebas condicionadas usan
`HU31_TEST_DATABASE_URL` y aceptan solo la base local `treksafe_hu30_test`.
La ejecución no toma `DATABASE_URL` ni se conecta a Supabase.

Resultados y límites: [validación local de HU-31](../../docs/hu-31-validacion.md).

## HU-36: historial de cambios del plan

`010_hu36_eventos_plan_solo_anexado.sql` no crea tablas ni modifica las RPC de
HU-26, HU-27 y HU-35. Añade triggers sobre `eventos_plan`: al insertar sanea
`cambios` con la misma lista blanca que `CAMPOS_EVENTO_PLAN` (TypeScript) y fija
`ocurrido_en = now()`; rechaza con `EVENTO_PLAN_INMUTABLE` cualquier UPDATE que
no sea la anonimización ARCO (`cambios = '{}'` y `motivo` nulo), el DELETE directo
(la cascada desde `expediciones` sigue funcionando: el trigger la reconoce porque la
expedición del evento ya no existe) y el TRUNCATE. Retira a
`service_role` los permisos de tabla UPDATE, DELETE y TRUNCATE y vuelve a conceder
`UPDATE (cambios, motivo)`. **Su aplicación en DEV sigue pendiente.**

Suite local desechable: aplica el esquema inicial, emula los privilegios por defecto de
Supabase para `anon`, `authenticated` y `service_role` (HU-36-S2: ALL en tablas y secuencias
y EXECUTE en funciones de `public`, también para lo creado después, de modo que los asserts
de acceso denegado prueban de verdad los REVOKE de `002` y `010`),
aplica `002` a `007` y dos veces `010`, ejecuta `tests/hu36_eventos_plan_solo_anexado.test.sql`
y luego `src/testing/hu36Postgres.integration.test.ts` con `HU36_TEST_DATABASE_URL`
(contrato del lector contra PostgreSQL real mediante un puente fetch; no es PostgREST):

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File backend/scripts/test-hu36-postgres.ps1 -PostgresBin "C:\Program Files\PostgreSQL\17\bin"
```

Diseño y API: [HU-36](../../docs/hu-36/diseno.md).

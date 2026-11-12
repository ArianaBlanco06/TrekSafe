# Migraciones SQL de TrekSafe

HU-34: `016_hu34_avances_expedicion.sql` está aplicada y registrada en Supabase DEV (2026-11-09 03:05 UTC). No es re-ejecutable: no volver a ejecutarla. Detalles en [dossier HU-34](../../docs/hu-34/README.md).

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
  y solo `service_role` puede ejecutarlas. HU-32 conserva sus dos RPC
  `SECURITY DEFINER` con permisos restringidos y `search_path` fijo,
  descritas en su sección específica.

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
| `20261101_hu30_listas_equipo.sql` | Tablas de listas personales e ítems, relaciones y permisos | Esquema inicial |
| `20261101_hu30_operaciones_equipo.sql` | Posición de ítems y RPC de listas de equipo | `20261101_hu30_listas_equipo.sql` |
| `008_hu31_preparacion_expedicion.sql` | Copia de equipo por expedición, ítems, restricciones y permisos | Las dos migraciones de HU-30; integrar después de HU-27 |
| `009_hu31_operaciones_preparacion.sql` | RPC de consulta, asociación atómica y marcas de preparación | `008_hu31_preparacion_expedicion.sql` |
| `010_hu32_puntos_ruta.sql` | Tabla puntos_ruta y RPC de consulta/guardado atómico | `002` |
| `011_hu29_endurecer_permisos.sql` | Endurece permisos de las tablas y funciones de HU-29 | `000` y `001` |
| `012_hu36_eventos_plan_solo_anexado.sql` | `eventos_plan` solo anexado: lista blanca de `cambios`, `ocurrido_en` del servidor, sin UPDATE salvo anonimización ARCO, sin DELETE salvo la cascada (detectada porque la expedición ya no existe), sin TRUNCATE | `002` y `006` |
| `013_hu37_avisos.sql` | Tabla `avisos_usuario` (bandeja in-app) con `clave_evento` única por usuario | `002` |
| `014_hu38_minutos_recordatorio.sql` | Columna `expediciones.minutos_recordatorio` (15, 30 o 60; por defecto 30) | Esquema inicial |
| `015_hu45_outbox.sql` | Outbox canónica con identidad estable de evento/destinatario/canal, normalización, restricciones e índices. No activa el procesador | `000` |
| `016_hu34_avances_expedicion.sql` | Tabla `avances_expedicion` y RPC de registro idempotente y último avance. Aplicar una sola vez | `002` y `010` |
| `017_hu39_asumir_coordinacion.sql` | Tabla `incidentes` (un incidente no cerrado por expedición) y RPC `treksafe_asumir_coordinacion`. Aplicar una sola vez | `002` |
| `018_hu27_cancelar_salida_futura.sql` | Sustituye `treksafe_cancelar_expedicion` de la `005`: solo cancela una expedición programada con salida futura (`hora_inicio > clock_timestamp()` tomado tras el bloqueo de la fila, no `now()`; sin códigos de error nuevos). Re-ejecutable. **No ejecutar la `005` después de esta migración**: restauraría la función anterior | `005` |
| `019_hu41_bitacora_incidente.sql` | Tabla `entradas_bitacora_incidente` (solo anexado, hora del servidor, corrección como entrada nueva, un cierre por incidente), `UPDATE (version)` sobre `incidentes` para `service_role` (bloqueo `FOR SHARE` frente al relevo), `treksafe_anexar_entrada_bitacora_interna` (para HU-42) y RPC `treksafe_agregar_entrada_bitacora`. Aplicar una sola vez | `017` |
| `021_hu40_transferir_coordinacion.sql` | Relevo de la coordinación: tablas `relevos_coordinacion` (estados `pendiente`, `aceptado`, `rechazado` y `cancelado`; historial de quién resolvió y cuándo; un solo pendiente por incidente) y `transferencias_coordinacion` (solo anexar), `UPDATE` de `service_role` limitado a `responsable_id`, `version` y `asumido_en` de `incidentes` (aditivo: sin `REVOKE ALL`; conserva el `UPDATE (version)` de la `019` de HU-41), y RPC `treksafe_proponer_relevo`, `treksafe_aceptar_relevo`, `treksafe_rechazar_relevo` y `treksafe_cancelar_relevo` (estas dos sobre `treksafe_resolver_relevo`). Aplicar una sola vez. **Antes se llamó `019_hu40_…`**; pasó a `021` porque HU-41 ya usó la `019` y la `020` es de la rama de HU-49. **Corregida en sitio** para ampliar el relevo: no está en `develop` ni aplicada en DEV, **pendiente de que Ariana lo confirme antes del merge**; mientras tanto no aplicarla en ningún entorno compartido. Para el proyecto personal que tuvo la versión anterior, `docs/hu-40/evidencias/reinicio-021-personal.sql` (no es una migración) | `017` |
| `022_dep108_crear_expedicion_atomica.sql` | Creación compuesta por RPC y unicidad de expedición bloqueante por senderista; aborta ante duplicados existentes | `000`, `002`, `014` |
| `023_dep108_avisos_transaccionales.sql` | Trigger que guarda el aviso in-app en la transacción de edición/cancelación/ampliación | `000`, `012`, `013` |
| `024_dep108_vencimientos_outbox.sql` | RPC nueva de vencimientos con estado y pendientes atómicos; no sustituye el cron legado | `000`, `015`, `022` |

`015` es el esquema canónico de HU-45 preparado en DEP-04 (#108). El PR #90 contiene una propuesta llamada `012_hu45_outbox.sql`: **no aplicarla encima de esta tabla ni repetir su registro**. #109 debe conservar la identidad lógica obligatoria y adaptar el encolado/procesador al contrato canónico. Para nuevas migraciones, comprobar el siguiente número libre al momento del merge: hoy la `020` está en la rama de HU-49 (`020_hu49_creacion_plan_idempotente.sql`) y la `021` es de HU-40; el siguiente libre en las ramas remotas conocidas es la `025`.

Para DEP-04, instalar primero la base y dependencias históricas (las dos HU-30 con fecha preceden a `008`/`009`). Después aplicar solo archivos realmente pendientes: `015`, `017`, `018`, `019`, `022`, `023`, `024`; no ordenarlos mediante glob alfabético. Los archivos nuevos son de una sola aplicación: abortan ante objetos/versiones ocupados, sin borrar ni ocultar divergencias. `020` y `021` no forman parte de esta entrega; comprobar disponibilidad de cualquier número contra las ramas pendientes antes de asignarlo. Detalle, pruebas y recuperación: [dossier DEP-04](../../docs/dep-108/README.md).

Las migraciones `002` a `007` y `012` son re-ejecutables. No dependen de
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
La API de puntos de HU-32 requiere además `010_hu32_puntos_ruta.sql`.

## HU-41: bitácora cronológica del incidente

`019` no es re-ejecutable (el `CREATE TABLE` falla si la tabla ya existe) y requiere `017` (`incidentes`) y `002` (`eventos_plan`, para la idempotencia entre tipos de operación). Solo `service_role` ejecuta las funciones.

**Aviso para HU-40 y HU-42:** `SELECT ... FOR SHARE` sobre `incidentes` exige, además de `SELECT`, el privilegio `UPDATE` sobre al menos una columna. La `019` concede `UPDATE (version)` a `service_role`. Si una migración posterior hace `REVOKE UPDATE` de tabla sobre `incidentes`, debe volver a conceder al menos esa columna; de lo contrario la RPC de la bitácora responde `permission denied`.

Suite contra una base local desechable (Docker o PostgreSQL instalado; no toca Supabase ni DEV):

```bash
node backend/scripts/test-hu41-postgres.mjs                    # Docker: postgres:18, puerto 55432
node backend/scripts/test-hu41-postgres.mjs --pg-bin "C:\Program Files\PostgreSQL\17\bin"
```

El script aplica `init_schema.sql` y las migraciones hasta la `018`, después la `019`, y ejecuta `tests/hu41_bitacora_incidente.test.sql` (16 casos), seis pruebas de concurrencia con sesiones reales y la suite TypeScript `hu41Postgres.integration.test.ts`. `REGISTRO_APLICACION.md` lo actualiza quien aplique la migración en cada entorno.

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
Las migraciones 008 y 009 fueron aplicadas y registradas correctamente en Supabase DEV el 6 de noviembre de 2026.

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

## HU-32: puntos intermedios de ruta

Esta sección conserva la documentación y las garantías de HU-32. La aplicación y el registro se coordinan con Sebastian; no sustituye las migraciones compartidas descritas arriba.

### Orden y requisito compartido

1. Contar con el esquema base de TrekSafe instalado previamente.
2. Contar con `002_hu26_version_y_eventos_plan.sql`, que aporta la versión INTEGER compartida con HU-26.
3. Para instalaciones nuevas, revisar y aplicar `010_hu32_puntos_ruta.sql` una sola vez.

**Estado de DEV confirmado por Ariana:** HU-26 y la estructura de HU-32 están aplicadas y verificadas, incluida la versión INTEGER y `hu32_chk_version_segura`. El asiento administrativo `010` ya fue registrado correctamente en `public.treksafe_migraciones` el 2026-11-06 a las 05:23 UTC. No volver a ejecutar el archivo completo en DEV.

El archivo se renombró desde `hu32_puntos_ruta.sql` para ajustarse a la numeración del equipo. Antes del `COMMIT` incorpora el registro condicional en `treksafe_migraciones`, con `ON CONFLICT (version) DO NOTHING`, como `008`/`009`. Esto permite instalarlo sin tabla de registro o conservar un asiento existente; no vuelve re-ejecutable el DDL ni modifica una instalación ya aplicada por renombrar el archivo.

El contrato compartido indicado por el equipo el 3 de noviembre de 2026 es `public.expediciones.version INTEGER`, siguiendo HU-26 de Favio. HU-32 requiere `NOT NULL` y default (fixture inicial: 1), comprueba el tipo exacto antes de crear objetos y restringe las versiones positivas a 1..2147483647. La migración de HU-26 aporta la columna; HU-32 no la crea ni cambia su tipo. Ariana confirmó esta estructura en DEV; en otros entornos se comprueba la dependencia antes de instalar.

El ajuste INTEGER paso la validacion completa: 39 comprobaciones SQL, 28 pruebas de contrato y las suites backend/UI/integracion. Resultados y alcance en [ajuste INTEGER](../../docs/hu-32/ajuste-integer.md).

La migracion se ejecuta dentro de `BEGIN`/`COMMIT`. Ante un requisito ausente o un error, se revierte completa. Un segundo intento sobre una migracion ya aplicada falla en lugar de ocultar diferencias de esquema mediante `IF NOT EXISTS`.

`init_schema.sql` contiene eliminacion de tablas y solo se usa en una base nueva/descartable. No se vuelve a ejecutar sobre DEV compartido con trabajo del equipo.

### Objetos y acceso

| Objeto | Responsabilidad |
| --- | --- |
| `puntos_ruta` | UUID v4 estable, FK a expedicion, nombre normalizado, coordenadas a cinco decimales y orden 1..20 unico por expedicion. |
| `treksafe_normalizar_nombre_punto(text)` | Normalizacion de espacios equivalente a `String.trim()` de JavaScript. |
| `treksafe_validar_puntos_ruta(jsonb)` | Validacion pura y coleccion canonica; conserva indices del arreglo original en los errores. |
| `treksafe_consultar_puntos_ruta(uuid, uuid)` | Fotografia privada de contexto, version y puntos ordenados, en una sola sentencia. |
| `treksafe_guardar_puntos_ruta(uuid, uuid, integer, jsonb)` | Bloqueo del plan y actualizacion atomica de la coleccion, con verificacion de version, estado, hora e IDs. |

Las funciones de normalizacion/validacion no son RPC para clientes. `anon` y `authenticated` no tienen privilegios en los objetos nuevos. `service_role` solo puede ejecutar consulta/guardado; no puede acceder directamente a `puntos_ruta`. Las dos RPC usan `SECURITY DEFINER`, nombres de tabla/funcion calificados y un `search_path` fijo. El propietario que aplica la migracion debe ser un rol confiable con acceso al esquema base y capacidad para definir estos permisos.

`SECURITY DEFINER` es una excepción deliberada a la convención INVOKER: permite mantener revocado el acceso directo del backend a `puntos_ruta` y concentrar la consulta, propiedad y escritura atómica en las dos RPC autorizadas; Ariana confirmó esos permisos en DEV.

La API obtiene el ID del actor del JWT propio de TrekSafe y lo pasa a la RPC desde el servidor. Estas funciones no validan un JWT ni utilizan `auth.uid()`. Una clave `service_role` sigue siendo un secreto exclusivo del backend.

### Resultados SQL para el adaptador

Consulta: JSON con `expedicion` y `puntos`, o SQL `NULL` para expedicion ajena/inexistente. Guardado:

| `tipo` | Contenido adicional | Traduccion HTTP prevista |
| --- | --- | --- |
| `guardado` | `ruta`: contexto y puntos persistidos | 200 |
| `datos_invalidos` | `detalles`: errores por campo | 400, `DATOS_PUNTOS_INVALIDOS` |
| `no_encontrado` | Ninguno | 404, `NO_ENCONTRADO` |
| `expedicion_no_editable` | Ninguno | 409, `EXPEDICION_NO_EDITABLE` |
| `expedicion_ya_iniciada` | Ninguno | 409, `EXPEDICION_YA_INICIADA` |
| `version_obsoleta` | Ninguno | 409, `VERSION_PLAN_OBSOLETA` |

Los errores SQL inesperados se propagan para que se revierta la transacción; la API los convierte en un error genérico. Las fechas del JSON SQL se expresan como timestamps ISO de PostgreSQL y el adaptador las normaliza a UTC según el contrato HTTP.

### Garantias de actualizacion

- Las validaciones estructurales preceden al acceso al plan; despues se comprueban propietario, estado, hora tras el bloqueo, version e IDs ajenos.
- Todas las escrituras de puntos por la aplicacion pasan por la RPC y por el mismo bloqueo de expedicion. El cron y los cambios de estado tambien actualizan esa fila; las futuras ediciones deben respetar la version compartida.
- Maximo 20 por validacion y por las 20 posiciones unicas permitidas. La RPC exige orden consecutivo. El propietario administrativo de la base puede alterar datos directamente; ese acceso no representa el flujo de la aplicacion.
- El intercambio de posiciones usa una restriccion unica diferible. Se actualizan las filas existentes conservando su identidad; no se borran para recrearlas al reordenar.
- Los puntos omitidos se eliminan. Nombres y coordenadas se normalizan antes de comparar. Si la coleccion canonica es identica y la version esta vigente, no cambian la version ni `actualizado_en`.
- Un cambio efectivo actualiza version y metadatos con los puntos. Un fallo, incluida una colision concurrente de UUID, no deja bajas o cambios parciales.
- Con version 2147483647 se admite un guardado identico; un cambio efectivo falla sin escribir puntos ni metadatos. La API rechaza versiones fuera de 1..2147483647 con 400; una llamada SQL directa fuera del rango INTEGER falla en la conversion del argumento antes de ejecutar la RPC.
- La restriccion de orden se verifica antes de devolver exito; una violacion inesperada aborta la operacion.

### Pruebas locales reproducibles

Desde la raiz del repositorio, con Node.js y PostgreSQL nativo instalados:

```powershell
node backend/scripts/test-hu32-sql.mjs --pg-bin "C:\Program Files\PostgreSQL\18\bin"
```

El script usa solo modulos incluidos en Node, sin `npm install`. Crea un cluster en una carpeta temporal `treksafe-hu32-sql-*`, elige otro puerto libre y escucha exclusivamente en `127.0.0.1`. Ejecuta el esquema real y esta migracion con datos ficticios, sin leer `.env`, sin credenciales y sin conectarse al servicio instalado o a Supabase. Requiere permiso para ejecutar los binarios locales y abrir el puerto de loopback.

Con las dependencias del backend instaladas, agregar `--with-backend` ejecuta también los mismos 14 escenarios de contrato contra el repositorio en memoria y el adaptador de producción conectado a PostgreSQL temporal. El runner prepara la configuración de loopback y la pasa solo al proceso hijo de pruebas; no se configura ninguna conexión desde `.env`.

#### Integracion completa y PWA

Con las dependencias de ambos proyectos y PostgREST nativo disponibles:

```powershell
node backend/scripts/test-hu32-sql.mjs --pg-bin "C:\Program Files\PostgreSQL\18\bin" --with-browser --postgrest "C:\ruta\PostgREST\postgrest.exe"
```

Este modo incluye builds, comprobaciones de tipos, pruebas de regresion y navegador, la suite SQL y el contrato. Despues ejecuta la API real y el SDK Supabase contra PostgREST nativo y el cluster temporal, con el build PWA y su worker activo. Las conexiones y credenciales son ficticias/locales; API, PostgREST y PostgreSQL temporal se cierran al finalizar. El loader historico puede leer `.env` en el proceso de integracion, pero se sustituyen todos sus campos antes de inicializar la configuracion y los repositorios. No se modifica el archivo ni se usan sus destinos. Detalle y evidencia: [fase 6](../../docs/hu-32/fase-6-integracion.md).

La version del plan se crea **solo como fixture de esa base temporal**, despues de comprobar que la migracion rechaza correctamente el esquema sin version. No sustituye la migración `002` ni acredita su aplicación en DEV.

Las pruebas cubren reglas, permisos, normalizacion, IDs estables, eliminacion, no-op, version obsoleta, rollback por fallo inyectado y concurrencia de sesiones. Al finalizar se detiene la instancia temporal. Se conservan su carpeta y logs para inspeccion; el script imprime su ubicacion. El servicio PostgreSQL instalado no se detiene ni se reconfigura.

### Registro de aplicacion

Completar tras una aplicacion coordinada; ejecutar pruebas temporales no aplica la migracion a DEV:

| Archivo | Entorno | Fecha | Commit | Responsable | Resultado |
| --- | --- | --- | --- | --- | --- |
| `010_hu32_puntos_ruta.sql` | DEV compartido | 2026-11-06 05:23 UTC | `594b23f` | Ariana | Aplicada y registrada correctamente (OK) |

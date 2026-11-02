# Migraciones incrementales — HU-32

Esta carpeta inicia la propuesta local de migraciones incrementales de HU-32. Su orden definitivo y el registro de aplicacion se coordinan con Sebastian. Los antiguos `sprint*_migration.sql` y `post_mvp_migration.sql` ya estan consolidados en `init_schema.sql`.

## Orden y requisito compartido

1. Contar con el esquema base de TrekSafe instalado previamente.
2. Integrar la migracion de version del plan acordada con Favio y Sebastian.
3. Revisar y aplicar `hu32_puntos_ruta.sql` una sola vez.

El contrato preparado espera `public.expediciones.version BIGINT NOT NULL`, con un default acordado (propuesta: 1). HU-32 comprueba su existencia antes de crear objetos y agrega una restriccion de rango seguro para JavaScript: de 1 a 9007199254740991. No crea esa columna ni asume que ya fue aprobada por el equipo. Si el acuerdo usa otro nombre o tipo, adaptar esta migracion y el contrato antes de aplicarlos.

La migracion se ejecuta dentro de `BEGIN`/`COMMIT`. Ante un requisito ausente o un error, se revierte completa. Un segundo intento sobre una migracion ya aplicada falla en lugar de ocultar diferencias de esquema mediante `IF NOT EXISTS`.

`init_schema.sql` contiene eliminacion de tablas y solo se usa en una base nueva/descartable. No se vuelve a ejecutar sobre DEV compartido con trabajo del equipo.

## Objetos y acceso

| Objeto | Responsabilidad |
| --- | --- |
| `puntos_ruta` | UUID v4 estable, FK a expedicion, nombre normalizado, coordenadas a cinco decimales y orden 1..20 unico por expedicion. |
| `treksafe_normalizar_nombre_punto(text)` | Normalizacion de espacios equivalente a `String.trim()` de JavaScript. |
| `treksafe_validar_puntos_ruta(jsonb)` | Validacion pura y coleccion canonica; conserva indices del arreglo original en los errores. |
| `treksafe_consultar_puntos_ruta(uuid, uuid)` | Fotografia privada de contexto, version y puntos ordenados, en una sola sentencia. |
| `treksafe_guardar_puntos_ruta(uuid, uuid, bigint, jsonb)` | Bloqueo del plan y actualizacion atomica de la coleccion, con verificacion de version, estado, hora e IDs. |

Las funciones de normalizacion/validacion no son RPC para clientes. `anon` y `authenticated` no tienen privilegios en los objetos nuevos. `service_role` solo puede ejecutar consulta/guardado; no puede acceder directamente a `puntos_ruta`. Las dos RPC usan `SECURITY DEFINER`, nombres de tabla/funcion calificados y un `search_path` fijo. El propietario que aplica la migracion debe ser un rol confiable con acceso al esquema base y capacidad para definir estos permisos.

La API de fase 4 obtendra el ID del actor del JWT propio de TrekSafe y lo pasara a la RPC desde el servidor. Estas funciones no validan un JWT ni utilizan `auth.uid()`. Una clave `service_role` sigue siendo un secreto exclusivo del backend.

## Resultados SQL para el adaptador de fase 4

Consulta: JSON con `expedicion` y `puntos`, o SQL `NULL` para expedicion ajena/inexistente. Guardado:

| `tipo` | Contenido adicional | Traduccion HTTP prevista |
| --- | --- | --- |
| `guardado` | `ruta`: contexto y puntos persistidos | 200 |
| `datos_invalidos` | `detalles`: errores por campo | 400, `DATOS_PUNTOS_INVALIDOS` |
| `no_encontrado` | Ninguno | 404, `NO_ENCONTRADO` |
| `expedicion_no_editable` | Ninguno | 409, `EXPEDICION_NO_EDITABLE` |
| `expedicion_ya_iniciada` | Ninguno | 409, `EXPEDICION_YA_INICIADA` |
| `version_obsoleta` | Ninguno | 409, `VERSION_PLAN_OBSOLETA` |

Los errores SQL inesperados se propagan para que se revierta la transaccion; la futura API debera convertirlos en un error generico. Las fechas del JSON SQL se expresan como timestamps ISO de PostgreSQL; el adaptador puede normalizarlas a UTC con `toISOString()` segun el contrato HTTP.

## Garantias de actualizacion

- Las validaciones estructurales preceden al acceso al plan; despues se comprueban propietario, estado, hora tras el bloqueo, version e IDs ajenos.
- Todas las escrituras de puntos por la aplicacion pasan por la RPC y por el mismo bloqueo de expedicion. El cron y los cambios de estado tambien actualizan esa fila; las futuras ediciones deben respetar la version compartida.
- Maximo 20 por validacion y por las 20 posiciones unicas permitidas. La RPC exige orden consecutivo. El propietario administrativo de la base puede alterar datos directamente; ese acceso no representa el flujo de la aplicacion.
- El intercambio de posiciones usa una restriccion unica diferible. Se actualizan las filas existentes conservando su identidad; no se borran para recrearlas al reordenar.
- Los puntos omitidos se eliminan. Nombres y coordenadas se normalizan antes de comparar. Si la coleccion canonica es identica y la version esta vigente, no cambian la version ni `actualizado_en`.
- Un cambio efectivo actualiza version y metadatos con los puntos. Un fallo, incluida una colision concurrente de UUID, no deja bajas o cambios parciales.
- La restriccion de orden se verifica antes de devolver exito; una violacion inesperada aborta la operacion.

## Pruebas locales reproducibles

Desde la raiz del repositorio, con Node.js y PostgreSQL nativo instalados:

```powershell
node backend/scripts/test-hu32-sql.mjs --pg-bin "C:\Program Files\PostgreSQL\18\bin"
```

El script usa solo modulos incluidos en Node, sin `npm install`. Crea un cluster en una carpeta temporal `treksafe-hu32-sql-*`, elige otro puerto libre y escucha exclusivamente en `127.0.0.1`. Ejecuta el esquema real y esta migracion con datos ficticios, sin leer `.env`, sin credenciales y sin conectarse al servicio instalado o a Supabase. Requiere permiso para ejecutar los binarios locales y abrir el puerto de loopback.

Con las dependencias del backend instaladas, agregar `--with-backend` ejecuta tambien los mismos 12 escenarios de contrato contra el repositorio en memoria y el adaptador de produccion conectado a PostgreSQL temporal. El runner prepara la configuracion de loopback y la pasa solo al proceso hijo de pruebas; no se configura ninguna conexion desde `.env`.

La version del plan se crea **solo como fixture de esa base temporal**, despues de comprobar que la migracion rechaza correctamente el esquema sin version. No constituye la migracion compartida pendiente de HU-26.

Las pruebas cubren reglas, permisos, normalizacion, IDs estables, eliminacion, no-op, version obsoleta, rollback por fallo inyectado y concurrencia de sesiones. Al finalizar se detiene la instancia temporal. Se conservan su carpeta y logs para inspeccion; el script imprime su ubicacion. El servicio PostgreSQL instalado no se detiene ni se reconfigura.

## Registro de aplicacion

Completar tras una aplicacion coordinada; ejecutar pruebas temporales no aplica la migracion a DEV:

| Archivo | Entorno | Fecha | Commit | Responsable | Resultado |
| --- | --- | --- | --- | --- | --- |
| `hu32_puntos_ruta.sql` | DEV compartido | Pendiente | Pendiente | Por coordinar con Sebastian | No aplicada |

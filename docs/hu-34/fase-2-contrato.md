# HU-34 — Fase 2: contrato de avances manuales

Fecha: 5 de noviembre de 2026. Responsable: Andriy Hitoshi Enciso Rojas (@Hitoshi).

Estado al redactar fase 2: especificación sin implementación. Actualización del 8 de noviembre: implementada y validada en [fases 3 a 7](README.md). La decisión de permisos se ajusta a la instrucción posterior del equipo: RPC SECURITY DEFINER, como HU-32, sin acceso directo del backend a puntos. Esta fase conserva el contrato y sus fundamentos.

Base: [mapa de fase 1](fase-1-mapa.md), criterios HU-34 del Product Backlog ISW2 y convenciones locales de autenticación, errores y privacidad. Las decisiones de detalle siguientes concretan esos criterios para el desarrollo; no afirman una nueva aprobación del PO ni del esquema compartido.

## 1. Alcance y decisiones

El propietario registra online su llegada a un punto intermedio declarado en HU-32. El sistema conserva un evento con punto, hora de servidor y nota opcional, y permite consultar el último avance del propietario. El registro no certifica la posición física: es una declaración manual, sin captura de GPS.

| Tema | Decisión para la implementación | Motivo |
| --- | --- | --- |
| Estado de registro nuevo | Solo `en_progreso`. | Cumple el criterio del backlog sin habilitar acciones en planes programados o terminados. |
| Límite vencido con cron pendiente | Se admite si el estado transaccional sigue en `en_progreso`. La interfaz mantiene el aviso de vencimiento. | El criterio exige estado en progreso, no una nueva restricción horaria. El registro no aplaza ni bloquea la siguiente evaluación del cron. |
| Punto | UUID existente de `puntos_ruta`, perteneciente a la expedición. | Reutiliza HU-32 y sus identidades estables. Inicio y destino no se convierten en puntos ficticios. |
| Varias llegadas al mismo punto | Permitidas con solicitudes distintas, incluso fuera del orden del plan. | No existe requisito de una sola visita ni de avance secuencial. |
| Idempotencia | Unicidad por `(senderistaId, solicitudId)` en todos los avances de esa cuenta. | Evita reutilizar accidentalmente una solicitud en otra expedición y aísla cuentas. |
| Reenvío equivalente | Devuelve el registro original sin cambiar su hora, aun si el estado ya no admite nuevos avances. | Recuperar un resultado no constituye una nueva llegada. Siempre exige autenticación y propiedad actuales. |
| ID con contenido diferente | Conflicto `SOLICITUD_REUTILIZADA`. | No oculta una edición como si fuese el avance original. |
| Tiempo | PostgreSQL asigna `registradoEn` durante el registro aceptado, después del bloqueo. | No se confía en el reloj del navegador ni en una fecha enviada en el cuerpo. |
| Plan y versión | El avance no escribe en `expediciones`, no incrementa su versión INTEGER ni añade tipos a `eventos_plan`. | Una llegada es seguimiento, no edición del plan. |
| Persistencia | Tabla propia `avances_expedicion`, evento inmutable. | Separa seguimiento de los eventos de modificación de HU-26/HU-36. |
| Consulta | Endpoint propio del último avance; no cambia el JSON de la expedición activa. | Reduce el cruce con historias ya integradas. |
| Offline | Sin cola, reenvío automático ni persistencia local de notas/avances. | HU-34 es online y debe conservar la política de privacidad. |

Si el equipo cambia una regla de esta tabla, se actualiza primero el contrato y sus escenarios. No se requiere detener la redacción o crear ahora una migración para revisar estas decisiones.

## 2. Flujo de interfaz previsto

1. El senderista abre la expedición activa. Se conservan temporizador, estado de alerta y retorno seguro.
2. Se consultan los puntos reales de HU-32 y el último avance propio. Un fallo de estas consultas no inutiliza el retorno seguro.
3. En `en_progreso` y con conexión puede elegir un punto y escribir una nota opcional. Sin puntos se explica que no hay puntos registrados para esta ruta.
4. Al enviar se prepara una solicitud con UUID v4 y contenido normalizado. Se deshabilita el doble envío mientras está pendiente.
5. Un resultado confirmado actualiza el último avance mediante su consulta y limpia la edición enviada. Un reenvío de un avance antiguo no debe reemplazar en pantalla un avance posterior; el POST responde sobre su solicitud, no sobre cuál es el último.
6. Ante fallo de red o resultado incierto se conserva en memoria el mismo ID y contenido. La acción explícita «Reintentar envío» reutiliza ambos. No se informa de éxito sin respuesta válida.
7. Mientras el resultado sea incierto no se transforma esa solicitud en otra editando su contenido. Primero se reintenta la misma; una acción explícita de registrar otra llegada usa un ID nuevo y explica que el envío anterior pudo haberse guardado.
8. Si se cierra/recarga la página, esa solicitud en memoria se pierde; HU-34 no promete recuperación persistente. Volver a consultar el último avance ayuda a revisar qué se guardó, pero no prueba por sí solo el resultado de una solicitud antigua.

La pérdida de conexión deshabilita nuevas acciones y reintentos hasta recuperarla; detectar conexión no garantiza que la API sea accesible. No se envía nada automáticamente al reconectar. En alerta o completada se puede mostrar el último registro y recuperar una solicitud ya enviada; no ofrecer una llegada nueva. La recuperación se limita a la misma sesión viva que conserva la solicitud.

## 3. Registro HTTP

`POST /api/expediciones/:id/avances`

Requiere JWT de TrekSafe y rol `senderista`. El actor proviene exclusivamente del JWT. `:id` es un UUID válido de expedición, sin coerciones ni formatos alternativos.

Ejemplo de cuerpo completo:

```json
{
  "solicitudId": "1e1551c2-2b3d-4e6f-8a9b-1234567890ab",
  "puntoId": "2f2662d3-3c4d-4f70-9b0c-2345678901bc",
  "nota": "Llegué al refugio. Continuaré por la ruta prevista."
}
```

| Campo | Validación |
| --- | --- |
| `solicitudId` | Obligatorio, UUID v4 generado con `crypto.randomUUID()`. Canonizar letras a minúsculas antes de comparar. Se conserva en reintentos. |
| `puntoId` | Obligatorio, UUID v4 de un punto real de HU-32. Canonizar a minúsculas. El servidor comprueba su pertenencia. |
| `nota` | Omitida, `null` o cadena. Límite de 500 puntos de código Unicode después de la normalización definida abajo. |

El cuerpo debe ser un objeto JSON con solo esos campos: rechazar claves desconocidas, arrays, valores coercionados y cualquier `senderistaId`, `registradoEn`, coordenadas o versión. `versionEsperada` no participa en esta operación. UUID v4 para los puntos y solicitudes sigue la identidad documentada por HU-32; el ID de expedición solo requiere UUID válido, como el contrato actual.

### Normalización de nota

- Omitida, `null`, vacía o solo espacios admitidos se convierte en `null`.
- Sustituir CRLF y CR por LF. Recortar en ambos extremos únicamente espacio ASCII, tabulador y LF; conservar espacios interiores y saltos de línea interiores.
- Contar el límite mediante puntos de código, no unidades UTF-16. No aplicar normalización Unicode adicional: dos secuencias distintas no se consideran iguales solo por verse iguales.
- Rechazar NUL, sustitutos Unicode aislados y controles U+0001–U+001F salvo tabulador y LF, y U+007F. La equivalencia entre JavaScript y SQL se probará expresamente.
- Guardar y devolver el texto normalizado. Renderizar como texto en React, nunca como HTML.

La ausencia de nota y `"nota": "  "` son equivalentes para idempotencia. No hay una operación de editar o eliminar avances dentro de esta HU.

## 4. Respuestas de registro

Primera aceptación: **201 Created**. Reenvío equivalente: **200 OK**. Ambos cuerpos contienen el mismo avance; solo cambia `repetida`. Todas las respuestas, incluidos errores, conservan `Cache-Control: no-store`.

Ejemplo de primera aceptación:

```json
{
  "avance": {
    "id": "3a3773e4-4d5e-4081-ab1d-3456789012cd",
    "solicitudId": "1e1551c2-2b3d-4e6f-8a9b-1234567890ab",
    "expedicionId": "4b4884f5-5e6f-4192-bc2e-4567890123de",
    "punto": {
      "id": "2f2662d3-3c4d-4f70-9b0c-2345678901bc",
      "nombre": "Refugio intermedio",
      "orden": 2
    },
    "registradoEn": "2026-11-05T16:30:00.000Z",
    "nota": "Llegué al refugio. Continuaré por la ruta prevista."
  },
  "repetida": false
}
```

`id` lo genera el servidor. `registradoEn` es ISO 8601 UTC; API y comparación de las respuestas usan precisión de milisegundos de forma consistente. No se acepta una hora declarada de llegada anterior: esta HU registra cuándo el servidor acepta la declaración.

`punto.nombre` y `punto.orden` son una fotografía almacenada al registrar, no una consulta mutable que pueda cambiar el resultado de un reenvío. No se exponen propietario, ficha médica ni contactos. No se incluye `Location` hacia un endpoint de detalle individual que esta HU no implementa.

## 5. Consulta del último avance

`GET /api/expediciones/:id/avances/ultimo`

Requiere el mismo JWT y rol senderista. Permite lectura del propietario en cualquier estado de una expedición existente; no otorga acceso a rescatistas ni a otras cuentas por esta ruta. Una expedición propia sin avances devuelve **200**, no 404:

```json
{
  "ultimoAvance": null
}
```

Con registros devuelve **200** con `ultimoAvance` igual a un objeto `avance` de la sección anterior, sin `repetida`.

«Último» se define por `registrado_en DESC, id DESC`. El UUID desempata de forma estable cuando dos eventos tienen la misma hora; ese desempate no representa una secuencia física de llegada. No se ordena por `punto.orden` ni por fecha del navegador. La hora de servidor puede corregirse: el endpoint ofrece el último por ese orden, no una garantía de secuencia monotónica frente a ajustes del reloj.

La consulta debe comprobar propiedad y seleccionar el avance mediante una lectura coherente, sin abrir una consulta sin filtro a todos los usuarios. Sin permiso o sin expedición se devuelve el mismo 404. No se incorpora listado paginado o historial completo de avances en esta HU.

## 6. Permisos y errores

Autenticación y rol se validan antes de ejecutar el comando o consultar persistencia. Se conserva el formato de error local (`mensaje`, `codigo` cuando corresponda y `detalles` para campos). Las claves internas SQL o sus mensajes no se filtran.

| HTTP | Código HU-34 o comportamiento existente | Situación y efecto |
| --- | --- | --- |
| 400 | `DATOS_AVANCE_INVALIDOS` | Parámetro UUID inválido, cuerpo/campo no admitido o nota inválida. Sin escritura. `detalles` usa claves como `expedicionId`, `puntoId`, `solicitudId`, `nota` o `_formulario`. |
| 400 | Manejador existente de JSON malformado | La petición no llega al comando. No se exige añadir un código nuevo al manejador global. |
| 401 | Middleware existente | JWT ausente, inválido o expirado. No se consulta el resultado previo. |
| 403 | Middleware existente | El rol autenticado no es senderista. |
| 404 | `EXPEDICION_NO_ENCONTRADA` | Expedición inexistente o de otra cuenta, tanto GET como POST. La respuesta no distingue ambas. |
| 409 | `EXPEDICION_NO_EN_PROGRESO` | Una solicitud nueva intenta registrar en un estado distinto de `en_progreso`. |
| 409 | `PUNTO_NO_DISPONIBLE` | En expedición propia que admite registro, el punto no existe o no pertenece a esa expedición. No revelar su propietario real. |
| 409 | `SOLICITUD_REUTILIZADA` | La misma cuenta ya usó `solicitudId` con otra expedición, punto o nota normalizada. No revelar el contenido previo. |
| 500 | Manejador existente de error interno | Fallo técnico no clasificado. Rollback sin datos parciales; el resultado puede ser incierto si se perdió la respuesta tras un commit. Reintentar conserva el ID. |

Precedencia del registro: validar autenticación/rol y forma; comprobar expedición propia; resolver solicitud previa; exigir estado para una solicitud nueva; comprobar punto; insertar. Un reenvío equivalente se devuelve antes de rechazar por estado. Un ID reutilizado por la misma cuenta no permite conocer datos de una expedición ajena indicada en la URL, porque se comprueba primero la propiedad del recurso solicitado.

Ejemplo de error de validación:

```json
{
  "error": "ErrorAplicacion",
  "mensaje": "Datos de avance inválidos",
  "codigo": "DATOS_AVANCE_INVALIDOS",
  "detalles": {
    "nota": ["La nota no puede superar 500 caracteres Unicode."]
  }
}
```

## 7. Idempotencia y concurrencia

El contenido canónico de una operación es `(senderistaId, expedicionId, puntoId, notaNormalizada)`. La clave es `(senderistaId, solicitudId)`. No se compara el JSON literal, el estado actual, la fecha del reintento ni los datos actuales del nombre/orden del punto.

| Caso | Resultado |
| --- | --- |
| Misma clave y mismo contenido canónico | Mismo ID de avance, hora, fotografía y nota. `repetida: true`. |
| Misma clave, cambio de nota/punto/expedición | 409, sin nuevo avance. |
| Otra cuenta usa el mismo UUID de solicitud en su propia expedición | Operación independiente; no recupera ni colisiona con el resultado privado de la primera. |
| Misma llegada intencional con UUID nuevo | Nuevo avance si el estado lo permite. |
| Reenvío después de alerta/completado/cancelación | Recupera el original si conserva propiedad y existe; no ejecuta una acción nueva. |
| Dos POST simultáneos equivalentes | Exactamente un 201 y un 200 si ambos finalizan normalmente; una sola fila. |
| Dos POST con misma clave y contenidos diferentes | Como máximo una aceptación; el otro devuelve conflicto, sin mezclar contenido. |
| Fallo antes de confirmar la transacción | Ningún avance parcial. El mismo ID puede reintentarse. |

La clave no caduca por cerrar sesión ni terminar la expedición. Su resultado se conserva mientras exista el avance; eliminar la expedición/cuenta elimina su información conforme a las relaciones definidas para esos recursos. Logout elimina los datos del navegador, no el historial legítimo del servidor.

La restricción única es obligatoria: deshabilitar el botón o consultar antes de insertar no resuelve la concurrencia. Las solicitudes sobre distintas expediciones de la misma cuenta pueden competir por la misma clave aunque bloqueen filas de expedición diferentes; el adaptador SQL debe resolver también ese caso.

## 8. Persistencia y operación atómica prevista

No se crea SQL en esta fase. La migración posterior deberá usar el esquema real de HU-32 y respetar el registro/orden de migraciones del equipo.

Datos previstos de `public.avances_expedicion`:

| Columna | Garantía |
| --- | --- |
| `id` | UUID, clave primaria, generado en servidor. |
| `senderista_id` | Actor verificado; referencia a usuario. Se almacena para la clave privada de idempotencia. |
| `expedicion_id` | Referencia a expedición. La RPC comprueba que pertenece al actor. |
| `punto_id` | Punto de esa misma expedición; conservar la relación. |
| `punto_nombre`, `punto_orden` | Fotografía inmutable al aceptar. |
| `solicitud_id` | UUID con unicidad conjunta con `senderista_id`. |
| `registrado_en` | `timestamptz` asignado por PostgreSQL al insertar, normalizado a milisegundos. |
| `nota` | Texto normalizado o NULL, con restricciones equivalentes al contrato. |

La FK compuesta `(expedicion_id, punto_id)` debe referenciar `(expedicion_id, id)` de `puntos_ruta`. Si HU-32 no proporciona esa clave candidata, la migración HU-34 añadirá la restricción única de soporte sin editar la migración histórica HU-32. Revisar nombres y relaciones al disponer de la dependencia. No se elimina un punto referenciado de forma independiente; la eliminación completa autorizada de la expedición deberá poder eliminar sus avances y puntos por cascada sin bloqueo residual. Probar expresamente esas cascadas. Esto no añade un endpoint de eliminación.

Secuencia de la operación transaccional `treksafe_registrar_avance`:

1. Validar argumentos defensivamente, con las mismas reglas canónicas que el comando.
2. Obtener y bloquear la expedición propia (`FOR UPDATE`). No usar un propietario proporcionado libremente por el navegador: la API pasa el actor del JWT.
3. Buscar `(senderista_id, solicitud_id)`. Si existe, comparar contenido y devolver original o conflicto; no cambiar su hora.
4. Para una nueva operación exigir `en_progreso`. No comprobar la hora como un requisito adicional ni actualizar la fecha límite.
5. Leer y proteger el punto de esa expedición durante el registro. Usar un bloqueo compatible con mantener su referencia y fotografía; las escrituras HU-32 ya bloquean primero la expedición. Mantener el orden expedición → punto.
6. Insertar el evento y su fotografía con hora de PostgreSQL tomada después de los bloqueos. No usar el inicio de la transacción como hora si esperó un bloqueo.
7. Resolver una eventual colisión de la restricción de idempotencia: leer la fila ganadora, comparar los campos canónicos y devolver repetida/conflicto. Capturar únicamente esa restricción, no ocultar otras violaciones o fallos. No se acepta terminar en 500 por una carrera esperada.
8. Devolver un resultado tipado y confirmar todo o revertir todo ante fallo. Un rechazo no cambia filas ni metadatos del plan.

La colisión entre expediciones diferentes requiere una lectura posterior que vea el commit ganador, no una lectura vieja de una única sentencia. Implementar y probar la operación con el aislamiento del entorno de ejecución; la propuesta inicial es el comportamiento de lectura confirmada y resolución en sentencias posteriores. Si el aislamiento impide resolver una carrera, reintentar la transacción de forma acotada en el adaptador con la misma solicitud; nunca informar de rechazo definitivo con datos a medio guardar.

La lectura del último avance puede resolverse con otra RPC privada `treksafe_consultar_ultimo_avance`, que distinga expedición inaccesible de expedición propia sin registros sin revelar datos ajenos. Índices: clave única de idempotencia e índice de consulta por `(expedicion_id, registrado_en DESC, id DESC)`.

RLS y permisos: denegación para `anon`/`authenticated`, sin acceso del navegador. Conforme a la instrucción posterior del equipo, las RPC usan `SECURITY DEFINER`, nombres calificados y `search_path` fijo. `service_role` solo recibe ejecución; las funciones operan con un propietario confiable y mantienen los permisos cerrados de HU-32. Las comprobaciones de propiedad siguen siendo obligatorias dentro de la RPC. Esta decisión reemplaza la propuesta inicial INVOKER de fase 2.

## 9. Coordinación con cron, retorno y plan

El bloqueo de expedición serializa la decisión de registro con las escrituras de estado sobre esa fila. Después de esperar, la RPC debe evaluar el estado vigente, no el observado antes del bloqueo.

| Orden efectivo | Comportamiento |
| --- | --- |
| Se guarda avance, después cron marca alerta | El avance permanece y la alerta se genera normalmente. |
| Cron confirma alerta antes del registro | Solicitud nueva rechazada por estado; reenvío equivalente puede recuperar el original. |
| Se guarda avance, después se confirma retorno | El avance permanece y el retorno completa con su flujo actual. |
| Se completa retorno antes del registro | Solicitud nueva rechazada; no vuelve a `en_progreso`. |
| El límite venció pero el cron no cambió el estado | Se puede registrar; límite y elegibilidad para alerta permanecen idénticos. |

No se modifica el cálculo de `fechaLimite`, la tolerancia, `horaRetornoEstimada`, `estado`, `version` ni `actualizado_en` de expediciones por registrar un avance. Tampoco se envían correos desde el comando. Las funciones actuales de retorno/cron se revisarán en integración, sin refactorizarlas por esta documentación.

El plazo sigue siendo responsabilidad de la lógica existente. La interfaz mantendrá un texto claro: «Registrar un avance no confirma tu retorno ni cambia el plazo».

## 10. Contratos de aplicación y diseño SOLID

Especificación orientativa en TypeScript, incluida solo como documentación:

```ts
type OrdenRegistrarAvance = Readonly<{
  senderistaId: string; // JWT validado, no dato del cuerpo
  expedicionId: string;
  solicitudId: string;
  puntoId: string;
  nota: string | null; // canónica
}>;

type AvanceExpedicion = {
  id: string;
  solicitudId: string;
  expedicionId: string;
  punto: { id: string; nombre: string; orden: number };
  registradoEn: string;
  nota: string | null;
};

type ResultadoRegistroAvance =
  | { tipo: 'registrado'; avance: AvanceExpedicion }
  | { tipo: 'repetido'; avance: AvanceExpedicion }
  | { tipo: 'no_encontrado' }
  | { tipo: 'estado_no_admitido' }
  | { tipo: 'punto_no_disponible' }
  | { tipo: 'solicitud_reutilizada' };

type ResultadoConsultaAvance =
  | { tipo: 'no_encontrado' }
  | { tipo: 'consultado'; ultimoAvance: AvanceExpedicion | null };

interface IRegistroAvances {
  registrarPropio(orden: OrdenRegistrarAvance): Promise<ResultadoRegistroAvance>;
}

interface IConsultaAvances {
  consultarUltimoPropio(
    senderistaId: string, expedicionId: string,
  ): Promise<ResultadoConsultaAvance>;
}
```

Los puertos reciben valores validados; argumentos inválidos de uso interno o fallos técnicos no se convierten en un rechazo de negocio inventado. La RPC valida también para evitar depender de una sola capa. El adaptador traduce resultados conocidos y deja que los fallos técnicos alcancen el manejador seguro de errores.

`RegistrarAvance` será un comando concreto que encapsula una copia inmutable de la orden y recibe `IRegistroAvances` por constructor. `ejecutar()` invoca el receptor con esa orden y devuelve el resultado de aplicación. El controlador usará una fábrica inyectada para construir el comando de cada petición; no creará Supabase ni seleccionará proveedores. No se requiere un bus, una cola, `undo()` ni una jerarquía genérica de comandos para demostrar el patrón.

`ObtenerUltimoAvance` recibe únicamente `IConsultaAvances`. El ensamblaje conecta el DAO Supabase; las pruebas conectan un DAO en memoria con el mismo contrato. El controlador se ocupa de autenticación ya resuelta, validación del transporte y mapeo a HTTP. La lógica de normalización se comparte dentro del backend, sin duplicarla entre controlador y comando.

La hora persistida la controla el DAO/servidor: no se añade `hora` al puerto de escritura ni se crea un reloj redundante en el comando. Para pruebas de memoria se puede inyectar el `IReloj` existente en el DAO en memoria, sin afirmar que su prueba valida el reloj PostgreSQL.

| SOLID | Evidencia a implementar |
| --- | --- |
| SRP | Comando de registro, consulta, adaptador y transporte con responsabilidades distintas. |
| OCP | Sustituir el DAO mediante composición sin modificar el comando. |
| LSP | Mismo contrato de resultados, permisos, nota e idempotencia en memoria y Supabase. La atomicidad real se prueba aparte. |
| ISP | Registro y lectura son puertos pequeños; ningún consumidor depende de toda la gestión de expediciones. |
| DIP | Aplicación depende de interfaces; Supabase se construye en el ensamblaje. |

## 11. Privacidad, sesión y PWA

Usar `api.post(..., true)` y `api.get(..., true)` de `clienteApi.ts`, que aplican `cache: 'no-store'` y verifican token/ámbito de sesión antes y después de leer la respuesta. Mantener `Cache-Control: no-store` en el backend, `NetworkOnly` para respuestas privadas y `registerType: 'prompt'`.

No añadir claves a `offlineStorage.ts`, `localStorage`, `sessionStorage`, IndexedDB ni Cache Storage para solicitudes, notas o resultados HU-34. Los datos que el servidor conserva legítimamente no se descargan a una caché privada para funcionar offline.

La página/componente debe invalidar el estado local al cambiar sesión o expedición y descartar también callbacks de cargas anteriores de puntos/último avance; la protección de transporte no sustituye esa responsabilidad visual. Evitar que una consulta más antigua del mismo usuario sobrescriba un resultado más reciente mediante una generación de carga o cancelación local. Un resultado de sesión anterior no debe limpiar ni modificar el formulario de la sesión nueva.

## 12. Matriz de pruebas para fases posteriores

| Grupo | Casos mínimos y evidencia |
| --- | --- |
| Validación | UUID, campos extra, nota omitida/null/vacía, 500/501 puntos de código, emoji, CRLF, controles y Unicode inválido. Paridad TypeScript/SQL. |
| Autorización | Sin token, otro rol, expedición ajena/inexistente; 404 indistinguible y ausencia de escritura. |
| Estado | Aceptar solo registro nuevo en progreso. Rechazar programada/completada/alerta y cancelada cuando exista en la base de prueba. |
| Punto | Propio válido; ID inexistente/ajeno; sin puntos; fotografía coherente y FK compuesta. |
| Idempotencia | Secuencial y simultánea; nota canónicamente equivalente; cambio de punto/nota/expedición; otra cuenta con igual UUID. |
| Tiempo | Hora del servidor, cuerpo con hora rechazada; reenvío mantiene ID y fecha; orden determinista con horas iguales. |
| Reenvío tardío | Recuperar original después de retorno/alerta con propiedad vigente; no registrar otro. |
| Transacción | Rollback al fallar el insert; carreras entre expediciones por una misma clave; permisos y cascadas reales. |
| Seguridad del plan | Comparar todos los campos del plan antes/después, incluidos INTEGER version, plazos, estado y actualizado_en. Sin evento en `eventos_plan`. |
| Cron | Registrar, vencer plazo y ejecutar tick con colaboradores controlados: alerta y despacho simulado sin alteración de límite. Caso vencido antes de registrar. |
| Carreras con estado | Coordinar dos conexiones PostgreSQL y verificar ambos órdenes con alerta/retorno; no simularlo solo con promesas en memoria. |
| Interfaz | Estado vacío, último avance, repetición de visita, envío pendiente, error incierto/reintento, sin red y recuperación manual. Retorno seguro accesible. |
| Sesión y PWA | Dos cuentas en un navegador, respuesta tardía, logout, Cache Storage sin notas/avances, assets offline y plantillas/borradores autorizados preservados. |
| Regresión | Tipos, backend y build de ambos proyectos, tipos de pruebas, `test:equipo`, suites propias HU-32/HU-34 y `test:pwa:privacidad` independientes. |

No se sustituyen suites ni se desactivan pruebas para facilitar CI. Las comprobaciones SQL requieren una base local desechable y datos ficticios; la aceptación integrada espera HU-32 real. No se ejecuta `init_schema.sql` sobre la base compartida ni se levanta un cron real para estas pruebas.

## 13. Dependencias y cierre

Al redactar esta fase, HU-32 continuaba ausente de los archivos de trabajo revisados. El contrato utilizó las identidades y operaciones descritas en fase 1 desde su rama local, sin copiar una segunda implementación. Posteriormente Andriy inició su merge y se combinaron los conflictos conservando las funcionalidades existentes; el cierre de Git sigue a su cargo. Véase [integración de HU-32](integracion-hu32.md). Antes de fase 3, revisar en particular FK, permisos de lectura/bloqueo y nombres/orden de migraciones con Sebastian. La presencia de los archivos no certifica que sus tablas estén instaladas en Supabase.

Esta fase definió los endpoints, datos canónicos, resultados, reenvíos, concurrencia, tiempo, consulta, privacidad y responsabilidades. Se revisó coherencia con las convenciones locales de `ErrorAplicacion`, los controladores de plan, `clienteApi` y el registro de migraciones. Los ejemplos son datos ficticios.

Verificación realizada: revisión documental y de enlaces locales; no se ejecutaron tests de aplicación, builds, instalaciones, SQL, llamadas a Supabase ni operaciones de Git. No se modificaron `.env`, configuración de servicios o código de aplicación. La siguiente entrega es la fase 3 de persistencia, con la dependencia HU-32 disponible; los resultados futuros de pruebas se registrarán cuando se ejecuten.

Fuentes funcionales: Product Backlog ISW2 (HU-34), informe de continuidad y guía de asignaciones aportados por Andriy, ya contrastados en fase 1. Referencia de SOLID: Semana 2, SRP p. 40, OCP p. 46, LSP p. 52, ISP p. 58 y DIP p. 64, con trazabilidad en el mapa. Las instrucciones operativas de los documentos no sustituyen las indicaciones actuales del usuario; Git y publicación siguen a cargo de Andriy.

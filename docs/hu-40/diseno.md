# HU-40: Transferir la coordinación de una alerta

Como rescatista responsable quiero solicitar y confirmar el relevo por otro rescatista validado, para mantener continuidad en un cambio de turno.

**Criterios de aceptación**

1. **CA-01 Propuesta autorizada:** solo el responsable actual propone a un nuevo responsable validado.
2. **CA-02 Aceptación explícita:** el relevo se aplica cuando el destinatario lo acepta. Mientras esté pendiente, el responsable anterior conserva el caso.
3. **CA-03 Registro y bloqueo:** guarda ambos responsables, el motivo y la hora. Impide relevos simultáneos y relevos en casos cerrados.

Este documento es la Fase 1 (solo diseño). No hay código ni migraciones todavía. Parte de HU-39 (rama `feat/hu-39-asumir-coordinacion`, aún no está en `develop`): reutiliza `incidentes`, `IIncidenteDAO`, `ErrorCoordinacion`, el objeto `coordinacion` y `BloqueCoordinacion`.

## Reglas

| Regla | Decisión |
|---|---|
| Quién propone | Solo el `responsable_id` vigente del incidente. |
| A quién | Un rescatista validado (fila en `perfiles_rescatista`) distinto del actor. |
| Qué caso | Un incidente no cerrado de la expedición. No se exige que la expedición siga en `alerta`: HU-39 deja abierto quién cierra el incidente (ver pendientes). |
| Mientras está pendiente | `incidentes.responsable_id` y `version` no cambian: el responsable anterior conserva el caso (CA-02). Proponer **no sube la versión**. |
| Cuándo se aplica | Solo cuando el destinatario acepta. En esa misma transacción cambia el responsable y sube la versión. |
| Un solo relevo | Índice único parcial: a lo sumo un relevo `pendiente` por incidente (CA-03). |
| Caso cerrado | No se propone ni se acepta sobre un incidente `cerrado`. |
| Control optimista | **Regla de versión:** proponer compara la `versionIncidente` del cliente con la del incidente (`VERSION_DESACTUALIZADA`, 409); aceptar no compara versión, solo exige que el relevo siga pendiente y que quien acepta sea el destinatario. Justificación en 2.2. |
| Idempotencia | `operacionId` (UUID del cliente, uno por intento) en cada comando, igual que HU-39. |
| Bloqueo | `SELECT … FOR UPDATE` sobre la fila de `incidentes`. Cada RPC toma **un solo** bloqueo, así no hay interbloqueos. |
| Datos médicos | Ninguno en tabla, RPC, lecturas ni respuestas. El motivo es texto libre y solo lo ven las dos partes (ver API). |
| Errores | Nunca 401 en errores de negocio (400/403/404/409). |

## 1. Modelo de datos (migración `019_hu40_transferir_coordinacion.sql`)

### 1.1 `public.relevos_coordinacion` (estado del relevo, mutable solo por la RPC)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | UUID | PK, `gen_random_uuid()` |
| `incidente_id` | UUID | FK a `incidentes(id)`, `ON DELETE CASCADE` |
| `estado` | TEXT | `pendiente` o `aceptado` (`CHECK`) |
| `responsable_anterior_id` | UUID | FK a `perfiles_rescatista(usuario_id)`, `ON DELETE RESTRICT`. Quien propone. |
| `destinatario_id` | UUID | FK a `perfiles_rescatista(usuario_id)`, `ON DELETE RESTRICT` |
| `motivo` | TEXT | `NOT NULL`, 1 a 280 caracteres tras `btrim` |
| `solicitado_en` | TIMESTAMPTZ | `NOW()` del servidor al proponer |
| `resuelto_en` | TIMESTAMPTZ | Nulo mientras esté pendiente |
| `version_incidente` | INTEGER | Versión del incidente en la que se propuso |
| `operacion_id` | UUID | `NOT NULL UNIQUE`: operación de la propuesta |
| `operacion_aceptacion_id` | UUID | `UNIQUE`, nulo hasta aceptar: operación de la aceptación |

Restricciones:

- `uq_relevo_pendiente_por_incidente`: `UNIQUE (incidente_id) WHERE estado = 'pendiente'`. Es la garantía de "impide relevos simultáneos", independiente de la lógica de la RPC.
- `chk_relevo_distintos`: `responsable_anterior_id <> destinatario_id`.
- `chk_relevo_resolucion`: `(estado = 'aceptado') = (resuelto_en IS NOT NULL AND operacion_aceptacion_id IS NOT NULL)`.
- Índice por `destinatario_id` (WHERE `estado = 'pendiente'`) para que la consola encuentre los relevos dirigidos a quien consulta.
- RLS activo con `treksafe_deny_anon_authenticated`. `service_role`: `SELECT`, `INSERT` y `UPDATE (estado, resuelto_en, operacion_aceptacion_id)`. Sin `DELETE`.

### 1.2 `public.transferencias_coordinacion` (evento de transferencia, solo anexar)

Una fila por relevo **aplicado**. Es el registro histórico inmutable; `relevos_coordinacion` es el estado de trabajo.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | UUID | PK |
| `incidente_id` | UUID | FK a `incidentes(id)`, `ON DELETE CASCADE` |
| `relevo_id` | UUID | `NOT NULL UNIQUE`, FK a `relevos_coordinacion(id)`: un relevo produce un solo evento |
| `responsable_anterior_id`, `responsable_nuevo_id` | UUID | FK a `perfiles_rescatista`, `RESTRICT` |
| `motivo` | TEXT | Copia del motivo |
| `version_anterior`, `version_nueva` | INTEGER | `version_nueva = version_anterior + 1` (`CHECK`) |
| `ocurrido_en` | TIMESTAMPTZ | Hora en que se aplicó, `NOW()` del servidor |

Es append-only con el mismo patrón que `eventos_plan` en la migración 012: triggers `BEFORE UPDATE`, `BEFORE DELETE` y `BEFORE TRUNCATE` que rechazan todo, salvo el borrado en cascada (se reconoce porque el incidente ya no existe). `service_role` solo tiene `SELECT` e `INSERT`.

Se mantienen las dos tablas porque tienen ciclos de vida distintos: el relevo puede ganar estados en el futuro (rechazado, cancelado; ver pendientes) y esos no son transferencias. El evento solo existe cuando el responsable cambió de verdad.

### 1.3 Cambios sobre `incidentes` (tabla de HU-39)

- Permiso nuevo: `GRANT UPDATE (responsable_id, version, asumido_en) ON public.incidentes TO service_role`. Es a nivel de columna, no abre `estado` ni `cerrado_en` (eso es de HU-42).
- Sin columnas nuevas ni cambios de restricciones.
- Semántica de `asumido_en` tras un relevo: pasa a ser "el responsable vigente coordina desde". Se actualiza con la hora de aceptación. `abierto_en` conserva la apertura original. Así el "desde HH:MM" de la consola sigue siendo verdadero para el responsable actual.

### 1.4 Cómo se cumple "se registran ambos responsables, el motivo y la hora"

| Dato | Dónde queda | Cuándo |
|---|---|---|
| Responsable anterior | `relevos_coordinacion.responsable_anterior_id` y `transferencias_coordinacion.responsable_anterior_id` | Al proponer / al aplicar |
| Nuevo responsable (destinatario) | `relevos_coordinacion.destinatario_id` y `transferencias_coordinacion.responsable_nuevo_id`; además queda en `incidentes.responsable_id` | Al proponer / al aplicar |
| Motivo | `relevos_coordinacion.motivo` y copia inmutable en `transferencias_coordinacion.motivo` | Al proponer / al aplicar |
| Hora | `solicitado_en` (propuesta), `resuelto_en` (aceptación) y `ocurrido_en` (evento) | Hora del servidor, nunca del cliente |

Aunque el relevo cambie después de estado, el evento append-only conserva la trazabilidad completa.

## 2. Las dos RPC

Ambas son `LANGUAGE plpgsql`, `SECURITY INVOKER`, `SET search_path = ''`, con `REVOKE` a `PUBLIC/anon/authenticated` y `EXECUTE` solo para `service_role`. Los errores de negocio son `RAISE EXCEPTION '<CODIGO>'` con el código en `MESSAGE` y, cuando hace falta, JSON en `DETAIL`. Resultado `JSONB` armado por una función auxiliar única `treksafe_resultado_relevo` (DRY, como `treksafe_resultado_coordinacion` en 017).

### 2.1 `treksafe_proponer_relevo(p_expedicion_id, p_actor_id, p_destinatario_id, p_motivo, p_version_incidente, p_operacion_id)`

Orden de validaciones (cada paso solo se evalúa si el anterior pasó):

| # | Paso | Falla con |
|---|---|---|
| 1 | Algún parámetro nulo, o `p_motivo` vacío o de más de 280 caracteres | `DATOS_INVALIDOS` |
| 2 | Operación ya registrada en `relevos_coordinacion.operacion_id`: mismo actor e incidente de la expedición → devuelve el mismo relevo (`repetido: true`) sin escribir. Otro actor u otra expedición → no se revela nada ajeno | `INCIDENTE_NO_ENCONTRADO` |
| 3 | La operación ya se usó en otro tipo de operación (`eventos_plan`, `incidentes`, `operacion_aceptacion_id`) | `DATOS_INVALIDOS` |
| 4 | El actor tiene perfil en `perfiles_rescatista` | `NO_ES_RESCATISTA` |
| 5 | **Bloqueo**: incidente no cerrado de la expedición, `FOR UPDATE`. Si no existe ninguno para esa expedición → `INCIDENTE_NO_ENCONTRADO`. Si solo hay cerrados → `INCIDENTE_CERRADO` | ver columna |
| 6 | `incidentes.responsable_id = p_actor_id` | `NO_ES_RESPONSABLE` |
| 7 | `p_destinatario_id <> p_actor_id` | `DESTINATARIO_INVALIDO` |
| 8 | El destinatario tiene perfil en `perfiles_rescatista` | `DESTINATARIO_NO_VALIDADO` |
| 9 | `p_version_incidente = incidentes.version`. `DETAIL` lleva `{"versionActual": n}` | `VERSION_DESACTUALIZADA` |
| 10 | No hay un relevo `pendiente` del incidente. `DETAIL` lleva el relevo pendiente (id, destinatario, solicitado_en) | `RELEVO_PENDIENTE` |
| 11 | `INSERT` del relevo con `version_incidente = incidentes.version`. Si salta `uq_relevo_pendiente_por_incidente` (otra vía sin bloqueo), se relee el pendiente y se responde `RELEVO_PENDIENTE`. Si colisiona `operacion_id`, se resuelve como en el paso 2 | resultado `repetido: false` |

Decisiones de orden: la identidad del actor (4 y 6) va antes de validar al destinatario o la versión, para que quien no es responsable no obtenga información del caso. El 5 distingue "no existe" de "cerrado" porque el CA-03 pide expresamente rechazar relevos en casos cerrados.

### 2.2 `treksafe_aceptar_relevo(p_expedicion_id, p_actor_id, p_relevo_id, p_operacion_id)`

| # | Paso | Falla con |
|---|---|---|
| 1 | Algún parámetro nulo | `DATOS_INVALIDOS` |
| 2 | `operacion_aceptacion_id = p_operacion_id` ya registrada: mismo destinatario y mismo relevo → resultado ya aplicado (`repetido: true`) sin escribir. Otro actor o relevo → no se revela nada ajeno | `RELEVO_NO_ENCONTRADO` |
| 3 | La operación ya se usó como propuesta o en otro tipo de operación | `DATOS_INVALIDOS` |
| 4 | El actor tiene perfil de rescatista | `NO_ES_RESCATISTA` |
| 5 | Localiza el relevo por `p_relevo_id` y su incidente (lectura sin bloqueo del `incidente_id`, que es inmutable) y exige que el incidente sea de `p_expedicion_id`. Si no, `RELEVO_NO_ENCONTRADO` | `RELEVO_NO_ENCONTRADO` |
| 6 | **Bloqueo** del incidente `FOR UPDATE` y **relectura** del relevo (pudo cambiar mientras se esperaba el bloqueo) | — |
| 7 | `destinatario_id = p_actor_id` | `NO_ES_DESTINATARIO` |
| 8 | `estado = 'pendiente'` | `RELEVO_YA_RESUELTO` |
| 9 | El incidente no está `cerrado` | `INCIDENTE_CERRADO` |
| 10 | Aplica el relevo (sección 3) | resultado `repetido: false` |

Decisiones de orden y de significado:

- El 7 va antes que el 8: un tercero no averigua si el relevo ya se resolvió.
- `RELEVO_YA_RESUELTO` también responde cuando el destinatario reenvía con **otra** `operacionId` un relevo ya aceptado. A diferencia de HU-39 (mismo responsable con otra operación = 200), aquí es una transición de estado con consecuencias sobre el responsable, y se prefiere no confirmar en silencio con una operación distinta. Con la misma `operacionId` sigue siendo 200 idempotente.
- **Regla de versión (una frase):** proponer compara la versión del cliente con la del incidente (`VERSION_DESACTUALIZADA`, 409); aceptar no compara versión, solo que el relevo siga pendiente y que quien acepta sea el destinatario.
- **Por qué, frente a la orientación del backlog** ("modelar ProponerRelevo y AceptarRelevo con la versión del incidente"): la versión sigue siendo el eje de ambos comandos, pero actúa donde protege. Al proponer, la versión evita que el responsable decida sobre un estado que ya no ve. Al aceptar, el destinatario no decide sobre el estado del incidente sino sobre una propuesta concreta (`relevoId`), cuya vigencia ya garantizan el estado `pendiente` y el bloqueo de la fila; la versión en la que se propuso queda guardada (`relevos_coordinacion.version_incidente`) y la que resulta queda en el evento (`version_nueva`). Exigir una versión al aceptar dejaría un relevo imposible de aceptar si el incidente cambia de versión después de la propuesta (por ejemplo, un `localizado` de HU-42) y, con un solo pendiente por incidente, bloquearía el caso. Aceptar sigue subiendo la versión, y eso es lo que fuerza el control optimista de HU-41, HU-42 y HU-50.

## 3. Aplicación del relevo (todo en una transacción)

Dentro de `treksafe_aceptar_relevo`, con el incidente bloqueado, en este orden y en la misma transacción de la RPC:

1. `UPDATE incidentes SET responsable_id = <destinatario>, version = version + 1, asumido_en = NOW() WHERE id = <incidente>`.
2. `UPDATE relevos_coordinacion SET estado = 'aceptado', resuelto_en = NOW(), operacion_aceptacion_id = p_operacion_id WHERE id = <relevo>`.
3. `INSERT INTO transferencias_coordinacion (…)` con anterior, nuevo, motivo, `version_anterior`, `version_nueva`, `ocurrido_en = NOW()`.
4. Devuelve el resultado con el incidente ya actualizado.

Si cualquiera falla, PL/pgSQL revierte todo: no puede quedar un responsable cambiado sin evento, ni un evento sin cambio.

## 4. API

Ambas rutas cuelgan de `/api/rescate`, exigen token de rescatista y usan los mismos middlewares que `/alertas/:expedicionId/coordinacion`. El actor sale siempre del JWT, nunca del cuerpo.

### 4.1 `POST /api/rescate/alertas/:expedicionId/coordinacion/relevos` (proponer)

Cuerpo: `{ "operacionId": "<uuid>", "destinatarioId": "<uuid>", "motivo": "Cambio de turno", "versionIncidente": 1 }`

Respuesta `201` (se creó) o `200` (repetición):

```json
{
  "coordinacion": {
    "incidenteId": "<uuid>",
    "version": 1,
    "responsableId": "<uuid>",
    "nombreResponsable": "Ana Rescate",
    "asumidoEn": "2030-01-15T12:00:00.000Z",
    "esMia": true,
    "relevoPendiente": {
      "relevoId": "<uuid>",
      "destinatarioId": "<uuid>",
      "nombreDestinatario": "Luis Relevo",
      "solicitadoEn": "2030-01-15T14:00:00.000Z",
      "esParaMi": false,
      "motivo": "Cambio de turno"
    }
  }
}
```

### 4.2 `POST /api/rescate/alertas/:expedicionId/coordinacion/relevos/:relevoId/aceptar` (aceptar)

Cuerpo: `{ "operacionId": "<uuid>" }` (sin versión). Respuesta `200` (aplicado o repetición) con `{ "coordinacion": {…} }`: el responsable ya es quien aceptó (`esMia: true`), la `version` subió y `relevoPendiente` es `null`.

### 4.3 Códigos de error

| Estado | Código | Cuándo |
|---|---|---|
| 400 | Sin código (`ErrorValidacion`, con `detalles`) | Ids que no son UUID, motivo vacío o de más de 280 caracteres, versión no entera |
| 400 | `DATOS_INVALIDOS` | La operación ya se usó en otro tipo de operación |
| 400 | `DESTINATARIO_INVALIDO` | El destinatario es el propio actor |
| 400 | `DESTINATARIO_NO_VALIDADO` | El destinatario no tiene perfil de rescatista |
| 403 | `PROHIBIDO` | Token de senderista |
| 403 | `NO_ES_RESCATISTA` | Token de rescatista sin perfil validado |
| 403 | `NO_ES_RESPONSABLE` | Propone alguien que no es el responsable vigente |
| 403 | `NO_ES_DESTINATARIO` | Acepta alguien que no es el destinatario del relevo |
| 404 | `INCIDENTE_NO_ENCONTRADO` | La expedición no tiene incidente, o la operación es ajena |
| 404 | `RELEVO_NO_ENCONTRADO` | El relevo no existe, no es de esa expedición, o la operación es ajena |
| 409 | `INCIDENTE_CERRADO` | El caso está cerrado |
| 409 | `RELEVO_PENDIENTE` | Ya hay un relevo pendiente. El cuerpo incluye `relevoPendiente` (sin motivo) |
| 409 | `VERSION_DESACTUALIZADA` | Solo al proponer. El cuerpo incluye `versionActual` |
| 409 | `RELEVO_YA_RESUELTO` | El relevo ya fue aceptado y la operación es distinta |

Solo la falta de token o un token inválido responden 401 (lo interpreta el frontend como sesión vencida).

### 4.4 Cambio en `coordinacion` de las lecturas

`GET /rescate/expediciones`, `/alertas` y `/alertas/:expedicionId` agregan a `coordinacion` el campo `relevoPendiente`: el objeto de arriba, o `null` si no hay relevo pendiente. Cambio aditivo y retrocompatible.

- Lo ve todo rescatista autorizado, igual que el responsable (HU-39 CA-03): `relevoId`, `destinatarioId`, `nombreDestinatario`, `solicitadoEn` y `esParaMi` (si quien consulta es el destinatario).
- `motivo` solo se incluye si quien consulta es el responsable (`esMia`) o el destinatario (`esParaMi`). Es texto libre y podría contener información sensible; los demás rescatistas no lo necesitan.
- Una lectura adicional por lista: los relevos pendientes de todos los incidentes de la página, con el nombre del destinatario, en una sola consulta (sin N+1), igual que `leerCoordinaciones`.
- No se expone ningún dato médico en ningún camino. Una prueba lo comprueba, como en HU-39.

## 5. Concurrencia

Todas las RPC toman el bloqueo de la fila del incidente, así que las operaciones sobre un mismo caso se serializan y el que llega segundo evalúa sus reglas ya con el resultado del primero.

| Escenario | Resultado |
|---|---|
| **Dos propuestas simultáneas** (el responsable desde dos sesiones, a B y a C) | La primera inserta el relevo pendiente. La segunda espera el bloqueo, ve el pendiente y recibe `RELEVO_PENDIENTE` con quién es el destinatario. Si algo escribiera sin bloquear, `uq_relevo_pendiente_por_incidente` lo impide y la RPC relee y responde lo mismo. |
| **Proponer contra aceptar** (A propone a C mientras B acepta el relevo de A) | Si gana la aceptación: el responsable pasa a B, la versión sube y la propuesta de A falla con `NO_ES_RESPONSABLE` (ya no lo es). Si gana la propuesta: falla con `RELEVO_PENDIENTE` y la aceptación sigue su curso. En ningún orden hay dos relevos pendientes ni un responsable ambiguo. |
| **Aceptar dos veces** | Misma `operacionId`: la segunda devuelve el mismo resultado sin escribir (200). Otra `operacionId`: `RELEVO_YA_RESUELTO`. El evento de transferencia es único por `relevo_id`, así que ni una condición de carrera puede duplicarlo. |
| Otro rescatista intenta aceptar | `NO_ES_DESTINATARIO`, sin importar el estado del relevo. |
| Aceptar contra cierre del caso (HU-42) | HU-42 debe tomar el mismo `FOR UPDATE` del incidente. Gana el primero: o se aplica el relevo y luego se cierra, o se cierra y la aceptación falla con `INCIDENTE_CERRADO`. |
| Asumir (HU-39) contra relevo | `treksafe_asumir_coordinacion` solo inserta si no hay incidente no cerrado, así que no compite con el relevo. |

Sin interbloqueos: cada RPC mantiene un único bloqueo de fila (el incidente). La lectura previa del relevo en la aceptación (paso 5) no bloquea y su `incidente_id` es inmutable.

## 6. Capas del backend (Command y DAO, SRP y DIP)

| Pieza | Responsabilidad |
|---|---|
| `ComandoProponerRelevo` | Inmutable: valida con zod y `Object.freeze`. Lleva `operacionId`, `destinatarioId`, `motivo`, `versionIncidente` (del cuerpo) y `rescatistaId`, `expedicionId` (JWT y ruta). |
| `ComandoAceptarRelevo` | Igual, sin versión: `operacionId` (cuerpo), `relevoId`, `expedicionId` (ruta), `rescatistaId` (JWT). |
| `ProponerRelevo`, `AceptarRelevo` | Implementan `IEjecutorComando`. Solo delegan en el DAO y traducen `ErrorCoordinacion` a `ErrorAplicacion` (sin 401). No repiten reglas de la RPC. |
| `IIncidenteDAO` | Se amplía con `proponerRelevo` y `aceptarRelevo`, y `leerCoordinaciones` devuelve `relevoPendiente`. Las reglas siguen en la RPC. |
| `IncidenteDAOSupabase` / `IncidenteDAOMemoria` | Adaptador de la RPC por constructor (DIP) y DAO en memoria que replica las reglas para las pruebas de caso de uso y HTTP. |
| `ErrorCoordinacion` | Se reutiliza ampliando el conjunto de códigos y los datos de detalle (`versionActual`, `relevoPendiente`). La tabla HTTP de HU-39 (`RESPUESTAS_COORDINACION`) se conserva; los códigos nuevos tienen su propia tabla para no romper su tipado. |
| `controladorCoordinacion` | Se agregan dos manejadores finos. `crearRutasRescate` sigue siendo el único sitio que construye DAO y casos de uso. |

## 7. Contrato para HU-41 y HU-50 (Sebastian)

No se tocan sus historias. Lo que deben leer es esto:

| Qué | Dónde | Garantía |
|---|---|---|
| Responsable vigente | `incidentes.responsable_id` (no cerrado) | Solo cambia al aceptar un relevo, nunca al proponer. Mientras el relevo está pendiente sigue siendo el anterior. |
| "Coordina desde" | `incidentes.asumido_en` | Se reinicia en cada relevo. |
| Cambio de responsable | `incidentes.version` | Sube en 1 con cada relevo aplicado. |
| Historial de transferencias | `transferencias_coordinacion` (solo anexar) | Una fila por relevo con anterior, nuevo, motivo, versiones y hora. |
| No leer | `relevos_coordinacion` | Es estado de trabajo, no contrato. `motivo` no debe mostrarse a terceros. |

HU-41 y HU-50 no necesitan cambios para seguir funcionando: HU-50 sigue autorizando contra `incidentes.responsable_id`.

## 8. Alcance de frontend (mínimo viable)

Dentro del alcance, porque sin interfaz el relevo no se puede usar ni demostrar. Sin pantallas nuevas: todo en `BloqueCoordinacion`, que ya está en el monitor, la lista de alertas y el detalle.

- **Responsable (`esMia`) sin relevo pendiente:** botón "Transferir coordinación". Abre un formulario corto: destinatario, motivo (máx. 280, con la advertencia "No incluyas datos médicos") y confirmar. Envía la `version` que ya tiene `coordinacion`.
- **Responsable con relevo pendiente:** "Relevo pendiente a <nombre> desde HH:MM. Sigues coordinando tú". Sin acción (cancelar queda como pendiente del PO).
- **Destinatario (`esParaMi`):** "<responsable> te propone relevarlo: <motivo>" con botón "Aceptar relevo". Tras aceptar, la pantalla se relee y muestra "Tú coordinas esta alerta".
- **Otros rescatistas:** ven "Relevo pendiente a <nombre>", sin motivo.
- **Lógica fuera del componente** (SRP), en `lib/coordinacionRescate.ts`: textos, reglas de visibilidad y el `operacionId` por intento con `generarUuid()`. Se reutiliza hasta tener un resultado definitivo, como en HU-39. Ante `VERSION_DESACTUALIZADA` (al proponer), `RELEVO_PENDIENTE` o `NO_ES_RESPONSABLE` se muestra el motivo y se relee la pantalla.
- **Necesita un endpoint de apoyo:** `GET /api/rescate/rescatistas` con `{id, nombreCompleto}` de los rescatistas validados (excluye al que consulta), para elegir destinatario. Solo nombre, sin datos médicos ni de contacto. Se implementaría en la Fase 2 junto con las otras rutas; no existe hoy.

Queda fuera: notificaciones o avisos al destinatario (hoy se entera al abrir la consola), cancelar o rechazar, y pantalla de historial de transferencias.

## 9. Migración y registro

| Archivo | Contenido |
|---|---|
| `019_hu40_transferir_coordinacion.sql` | `relevos_coordinacion`, `transferencias_coordinacion` y sus triggers de solo anexar, `GRANT UPDATE` por columna sobre `incidentes`, `treksafe_resultado_relevo`, `treksafe_proponer_relevo` y `treksafe_aceptar_relevo`. Requiere la 017 (e indirectamente la 002). Aplicar una sola vez; registra en `treksafe_migraciones` solo si existe. |

- Se agrega la fila 019 en `backend/migrations/README.md`. Puede haber un conflicto trivial con la fila 018 de HU-27 al hacer merge.
- No se editan migraciones existentes. La 015 sigue reservada para HU-45.
- Ariana aplica la 019 en DEV antes del merge. No se vuelve a ejecutar `init_schema.sql` en DEV.

## 10. Plan de verificación (Fase 2)

- **Pruebas automáticas:** comandos, `ProponerRelevo`, `AceptarRelevo`, `IncidenteDAOMemoria`, `IncidenteDAOSupabase` (cliente simulado), `coordinacion.relevoPendiente` en las lecturas, HTTP con JWT real y frontend (lógica y bloque).
- **Suite SQL** en PostgreSQL desechable (Docker `postgres:18`, puerto 55432, solo `127.0.0.1`/`localhost` y base con "desechable" en el nombre), con las migraciones hasta la 019. Casos: aceptación feliz y atómica; rechazo por actor incorrecto (propone un no responsable, acepta un no destinatario); destinatario igual al actor o sin perfil; incidente inexistente y cerrado; relevo duplicado; versión desactualizada; relevo ya resuelto; idempotencia de ambas RPC; evento de transferencia inmutable; rollback si falla un paso.
- **Concurrencia con sesiones reales** (como `test-hu39-postgres.mjs`): dos propuestas, proponer contra aceptar, aceptar dos veces, con barrera de bloqueo y rondas repetidas.
- **Prueba manual solo en el Supabase personal** (`wwan…`). Nunca el DEV del equipo (`ibnw…`). Se verifica el destino antes de escribir. Debe confirmar, como en HU-39: que el código del `RAISE EXCEPTION` llega en `error.message` y el JSON en `error.details`, y que los embeds de `perfiles_rescatista` funcionan con `service_role` con el esquema recargado.

## 11. Preguntas abiertas para el Product Owner

1. **Rechazar o cancelar un relevo pendiente: el CA no lo define y no se inventa.** Hoy el relevo solo termina en `aceptado`. Con un solo pendiente por incidente, un destinatario que nunca acepta **bloquea el caso**: el responsable no puede proponer a otra persona, y no puede salir de ese estado. Opciones a decidir con el PO: (a) el destinatario rechaza; (b) el responsable cancela; (c) vencimiento automático; (d) ninguna, y se acepta el bloqueo. Cualquiera añade estados (`rechazado`, `cancelado`, `vencido`) y una RPC; el modelo ya lo admite (el `CHECK` de `estado` se amplía sin tocar `transferencias_coordinacion`).
2. **Relevo pendiente y cierre del caso.** Si HU-42 cierra el incidente con un relevo pendiente, este queda `pendiente` para siempre (inofensivo, pero sucio). ¿Debe el cierre resolverlo como cancelado?
3. **¿Se exige `alerta` para relevar?** Se decidió solo "no cerrado", porque HU-39 deja pendiente quién cierra el incidente cuando la expedición sale de `alerta`. Si el PO prefiere exigir `alerta`, es un paso más de la RPC.
4. **Motivo.** ¿Obligatorio (como está) y con máximo de 280 caracteres? ¿Se muestra solo a las dos partes (propuesta) o a todos?
5. **Aviso al destinatario.** Hoy se entera al abrir la consola. ¿Se necesita notificarlo (fuera de este alcance)?
6. **Versión.** Decidido: proponer la compara; aceptar no (razón en 2.2). Confirmar con Sebastian y HU-42 que todo cambio relevante del incidente (por ejemplo `localizado`) sube `version`, para que la comparación al proponer sea útil.
7. **Nombre y alcance de `transferencias_coordinacion`.** Confirmar con Sebastian que HU-41 no define una bitácora propia que deba absorberla.
8. **Operaciones entre tablas.** Se mantiene la nota de HU-39: la unicidad de `operacion_id` es por tabla. Las RPC nuevas revisan `eventos_plan` e `incidentes`; las RPC antiguas no revisan las tablas nuevas.

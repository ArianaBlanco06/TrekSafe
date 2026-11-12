# HU-40: Transferir la coordinación de una alerta

Como rescatista responsable quiero solicitar y confirmar el relevo por otro rescatista validado, para mantener continuidad en un cambio de turno.

**Criterios de aceptación**

1. **CA-01 Propuesta autorizada:** solo el responsable actual propone a un nuevo responsable validado.
2. **CA-02 Aceptación explícita:** el relevo se aplica cuando el destinatario lo acepta. Mientras esté pendiente, el responsable anterior conserva el caso.
3. **CA-03 Registro y bloqueo:** guarda ambos responsables, el motivo y la hora. Impide relevos simultáneos y relevos en casos cerrados.

Este documento nació como diseño (Fase 1) y ahora también describe lo implementado: migración 021, RPC, DAO, casos de uso, rutas y frontend mínimo (estado en la sección 12). El PO (Marko) aprobó después un alcance adicional, que está integrado en todo el documento y se resume aquí. Parte de HU-39, que ya está en `develop` (migración 017): reutiliza `incidentes`, `IIncidenteDAO`, `ErrorCoordinacion`, el objeto `coordinacion` y `BloqueCoordinacion`.

**Alcance adicional aprobado por el PO (Marko)**

- El destinatario puede **rechazar** el relevo y quien lo propuso puede **cancelarlo**, mientras siga pendiente. Ambas acciones liberan la posibilidad de proponer otro relevo. **Sin vencimiento automático.**
- El responsable actual conserva la coordinación hasta que el destinatario acepte.
- Al cerrar el incidente, el relevo pendiente **queda invalidado** y ya no puede aceptarse (implementado como estado derivado, sección 2.4).
- Se usan los estados de incidente abierto que permite HU-39, pero se conserva la regla de HU-40: solo el responsable vigente propone a otro rescatista validado.
- **Sin notificación adicional:** el destinatario ve el relevo al abrir el caso.
- **Se conserva el historial:** se registra quién aceptó, rechazó o canceló, y cuándo.
- La aceptación simultánea con cancelación, con rechazo y con cierre se prueba con sesiones reales: solo una operación se impone y nunca queda una transferencia aplicada sobre un caso cerrado (sección 5).
- Rechazar y cancelar **no llevan motivo**: solo quién, qué y cuándo.
- El historial queda guardado, **sin endpoint ni pantalla nueva** para consultarlo.

## Reglas

| Regla | Decisión |
|---|---|
| Quién propone | Solo el `responsable_id` vigente del incidente. |
| A quién | Un rescatista validado (fila en `perfiles_rescatista`) distinto del actor. |
| Qué caso | Un incidente no cerrado de la expedición. No se exige que la expedición siga en `alerta`: HU-39 deja abierto quién cierra el incidente (ver pendientes). |
| Mientras está pendiente | `incidentes.responsable_id` y `version` no cambian: el responsable anterior conserva el caso (CA-02). Proponer **no sube la versión**. |
| Cuándo se aplica | Solo cuando el destinatario acepta. En esa misma transacción cambia el responsable y sube la versión. |
| Rechazar | Solo el destinatario, mientras el relevo esté pendiente. Solo resuelve el relevo: no cambia el responsable ni la versión y libera el índice único para proponer otro. |
| Cancelar | Solo quien propuso, mientras el relevo esté pendiente. Mismos efectos que rechazar. |
| Sin vencimiento | Un relevo pendiente sigue así hasta que alguien lo resuelva; no hay caducidad automática. |
| Un solo relevo | Índice único parcial: a lo sumo un relevo `pendiente` por incidente (CA-03). |
| Caso cerrado | No se propone, acepta, rechaza ni cancela sobre un incidente `cerrado`: las cuatro RPC responden `INCIDENTE_CERRADO` sin escribir. Un relevo pendiente de un caso cerrado queda inerte (estado derivado, sección 2.4). |
| Historial | Cada relevo resuelto conserva `estado`, `resuelto_por_id` y `resuelto_en`; la transferencia aceptada, además, el evento append-only. Rechazar y cancelar no llevan motivo. |
| Aviso | Sin notificación adicional: el destinatario lo ve al abrir el caso. |
| Control optimista | **Regla de versión:** proponer compara la `versionIncidente` del cliente con la del incidente (`VERSION_DESACTUALIZADA`, 409); aceptar no compara versión, solo exige que el relevo siga pendiente y que quien acepta sea el destinatario. Justificación en 2.2. |
| Idempotencia | `operacionId` (UUID del cliente, uno por intento) en cada comando, igual que HU-39. Una misma operación solo puede resolver un relevo (`operacion_resolucion_id` única). |
| Bloqueo | `SELECT … FOR UPDATE` sobre la fila de `incidentes`. Cada RPC toma **un solo** bloqueo, así no hay interbloqueos. |
| Datos médicos | Ninguno en tabla, RPC, lecturas ni respuestas. El motivo es texto libre y solo lo ven las dos partes (ver API). |
| Errores | Nunca 401 en errores de negocio (400/403/404/409). |

## 1. Modelo de datos (migración `021_hu40_transferir_coordinacion.sql`)

### 1.1 `public.relevos_coordinacion` (estado y historial del relevo, mutable solo por la RPC)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | UUID | PK, `gen_random_uuid()` |
| `incidente_id` | UUID | FK a `incidentes(id)`, `ON DELETE CASCADE` |
| `estado` | TEXT | `pendiente`, `aceptado`, `rechazado` o `cancelado` (`CHECK`). No hay estado `invalidado`: ver 2.4 |
| `responsable_anterior_id` | UUID | FK a `perfiles_rescatista(usuario_id)`, `ON DELETE RESTRICT`. Quien propone. |
| `destinatario_id` | UUID | FK a `perfiles_rescatista(usuario_id)`, `ON DELETE RESTRICT` |
| `motivo` | TEXT | `NOT NULL`, 1 a 280 caracteres tras `btrim` |
| `solicitado_en` | TIMESTAMPTZ | `NOW()` del servidor al proponer |
| `resuelto_en` | TIMESTAMPTZ | Nulo mientras esté pendiente. Hora del servidor en que se aceptó, rechazó o canceló |
| `resuelto_por_id` | UUID | FK a `perfiles_rescatista(usuario_id)`, `ON DELETE RESTRICT`. Quién aceptó, rechazó o canceló. Nulo mientras esté pendiente |
| `version_incidente` | INTEGER | Versión del incidente en la que se propuso |
| `operacion_id` | UUID | `NOT NULL UNIQUE`: operación de la propuesta |
| `operacion_resolucion_id` | UUID | `UNIQUE`, nulo mientras esté pendiente: operación que aceptó, rechazó o canceló (antes `operacion_aceptacion_id`) |

Restricciones:

- `uq_relevo_pendiente_por_incidente`: `UNIQUE (incidente_id) WHERE estado = 'pendiente'`. Es la garantía de "impide relevos simultáneos", independiente de la lógica de la RPC.
- `chk_relevos_distintos`: `responsable_anterior_id <> destinatario_id`.
- Resolución completa o ausente: `chk_relevos_resuelto_en`, `chk_relevos_resuelto_por` y `chk_relevos_op_resolucion` exigen que `resuelto_en`, `resuelto_por_id` y `operacion_resolucion_id` existan los tres si `estado <> 'pendiente'` y ninguno si es `pendiente`.
- `chk_relevos_quien_resuelve`: `aceptado` y `rechazado` los resuelve el destinatario (`resuelto_por_id = destinatario_id`); `cancelado`, quien propuso (`resuelto_por_id = responsable_anterior_id`).
- Al salir de `pendiente`, la fila sale del índice único parcial: por eso se puede proponer otro relevo tras rechazar o cancelar.
- Índice por `destinatario_id` (WHERE `estado = 'pendiente'`) para que la consola encuentre los relevos dirigidos a quien consulta.
- RLS activo con `treksafe_deny_anon_authenticated`. `service_role`: `SELECT`, `INSERT` y `UPDATE (estado, resuelto_en, resuelto_por_id, operacion_resolucion_id)`. Sin `DELETE`, y sin `UPDATE` de `motivo` ni de ninguna otra columna.

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

Se mantienen las dos tablas porque tienen ciclos de vida distintos: el relevo ya tiene los estados `rechazado` y `cancelado`, y esos no son transferencias. El evento solo existe cuando el responsable cambió de verdad. El historial de lo rechazado y cancelado vive en `relevos_coordinacion` (`estado`, `resuelto_por_id`, `resuelto_en`), que no se borra.

### 1.3 Cambios sobre `incidentes` (tabla de HU-39)

- Permiso nuevo: `GRANT UPDATE (responsable_id, version, asumido_en) ON public.incidentes TO service_role`. Es a nivel de columna: no abre `estado` ni `cerrado_en` (eso es de HU-42). `anon` y `authenticated` siguen sin ningún acceso (RLS con `treksafe_deny_anon_authenticated` y `REVOKE ALL` de HU-39); la migración no les concede nada y la suite SQL lo comprueba.
- Sin columnas nuevas ni cambios de restricciones.
- **Semántica de `asumido_en` (declarada):** pasa a significar "desde cuándo coordina el responsable actual". En la asunción de HU-39 vale lo mismo que antes (la hora en que asumió); tras un relevo se actualiza con la hora de aceptación. `abierto_en` conserva la apertura original. Así el "desde HH:MM" de la consola sigue siendo verdadero para el responsable actual.
- **HU-39 no cambia:** es una aclaración de significado, no de esquema ni de código. Los tests de HU-39 (SQL, backend y frontend) deben pasar sin modificarlos; se comprueba en la verificación (sección 10).

### 1.4 Cómo se cumple "se registran ambos responsables, el motivo y la hora"

| Dato | Dónde queda | Cuándo |
|---|---|---|
| Responsable anterior | `relevos_coordinacion.responsable_anterior_id` y `transferencias_coordinacion.responsable_anterior_id` | Al proponer / al aplicar |
| Nuevo responsable (destinatario) | `relevos_coordinacion.destinatario_id` y `transferencias_coordinacion.responsable_nuevo_id`; además queda en `incidentes.responsable_id` | Al proponer / al aplicar |
| Motivo | `relevos_coordinacion.motivo` y copia inmutable en `transferencias_coordinacion.motivo` | Al proponer / al aplicar |
| Hora | `solicitado_en` (propuesta), `resuelto_en` (aceptación, rechazo o cancelación) y `ocurrido_en` (evento) | Hora del servidor, nunca del cliente |
| Quién aceptó, rechazó o canceló | `relevos_coordinacion.resuelto_por_id` junto con `estado` y `resuelto_en` | Al resolver |

Aunque el relevo cambie después de estado, el evento append-only conserva la trazabilidad completa de lo aceptado; lo rechazado y cancelado queda en la propia fila del relevo, que no se actualiza ni se borra después de resolverse (`service_role` solo puede escribir las cuatro columnas de la resolución, y una vez fuera de `pendiente` ninguna RPC vuelve a tocarla).

## 2. Las cuatro RPC

Proponer y aceptar son `LANGUAGE plpgsql`; rechazar y cancelar son envoltorios `LANGUAGE sql` de una función común `treksafe_resolver_relevo` (`plpgsql`). Todas son `SECURITY INVOKER`, `SET search_path = ''`, con `REVOKE` a `PUBLIC/anon/authenticated` y `EXECUTE` solo para `service_role`. Los errores de negocio son `RAISE EXCEPTION '<CODIGO>'` con el código en `MESSAGE` y, cuando hace falta, JSON en `DETAIL`. Resultado `JSONB` armado por una función auxiliar única `treksafe_resultado_relevo` (DRY, como `treksafe_resultado_coordinacion` en 017).

### 2.1 `treksafe_proponer_relevo(p_expedicion_id, p_actor_id, p_destinatario_id, p_motivo, p_version_incidente, p_operacion_id)`

Orden de validaciones (cada paso solo se evalúa si el anterior pasó):

| # | Paso | Falla con |
|---|---|---|
| 1 | Algún parámetro nulo, o `p_motivo` vacío o de más de 280 caracteres | `DATOS_INVALIDOS` |
| 2 | Operación ya registrada en `relevos_coordinacion.operacion_id`: mismo actor e incidente de la expedición → devuelve el mismo relevo (`repetido: true`) sin escribir. Otro actor u otra expedición → no se revela nada ajeno | `INCIDENTE_NO_ENCONTRADO` |
| 3 | La operación ya se usó en otro tipo de operación (`eventos_plan`, `incidentes`, `operacion_resolucion_id`) | `DATOS_INVALIDOS` |
| 4 | El actor tiene perfil en `perfiles_rescatista` | `NO_ES_RESCATISTA` |
| 5 | **Bloqueo**: incidente no cerrado de la expedición, `FOR UPDATE`. Si no existe ninguno para esa expedición → `INCIDENTE_NO_ENCONTRADO`. Si solo hay cerrados → `INCIDENTE_CERRADO` | ver columna |
| 5b | **Repetición tras el bloqueo.** Con el incidente ya bloqueado se vuelve a buscar la operación: si otra sesión registró el mismo `operacion_id` mientras esta esperaba (dos envíos simultáneos del mismo comando), es una repetición segura (`repetido: true`), no un relevo duplicado. Si la operación es de otro actor u otro incidente → `INCIDENTE_NO_ENCONTRADO`. Sin este paso, el segundo envío vería el pendiente del primero y recibiría `RELEVO_PENDIENTE` | `INCIDENTE_NO_ENCONTRADO` |
| 6 | `incidentes.responsable_id = p_actor_id` | `NO_ES_RESPONSABLE` |
| 7 | `p_destinatario_id <> p_actor_id` | `DESTINATARIO_INVALIDO` |
| 8 | El destinatario tiene perfil en `perfiles_rescatista` | `DESTINATARIO_NO_VALIDADO` |
| 9 | `p_version_incidente = incidentes.version`. `DETAIL` lleva `{"versionActual": n}` | `VERSION_DESACTUALIZADA` |
| 10 | No hay un relevo `pendiente` del incidente. `DETAIL` lleva el relevo pendiente (id, destinatario, solicitado_en) | `RELEVO_PENDIENTE` |
| 11 | `INSERT` del relevo con `version_incidente = incidentes.version`. Si salta `uq_relevo_pendiente_por_incidente` (otra vía sin bloqueo), se relee el pendiente y se responde `RELEVO_PENDIENTE`. Si colisiona `operacion_id`, se resuelve como en el paso 2 | resultado `repetido: false` |

Decisiones de orden: el paso 2 resuelve las repeticiones que ya estaban confirmadas antes de empezar y el 5b las que se confirman mientras se espera el bloqueo; juntos cubren toda repetición idempotente. La identidad del actor (4 y 6) va antes de validar al destinatario o la versión, para que quien no es responsable no obtenga información del caso. El 5 distingue "no existe" de "cerrado" porque el CA-03 pide expresamente rechazar relevos en casos cerrados.

### 2.2 `treksafe_aceptar_relevo(p_expedicion_id, p_actor_id, p_relevo_id, p_operacion_id)`

| # | Paso | Falla con |
|---|---|---|
| 1 | Algún parámetro nulo | `DATOS_INVALIDOS` |
| 2 | `operacion_resolucion_id = p_operacion_id` ya registrada: mismo destinatario y mismo relevo, y el relevo quedó `aceptado` → resultado ya aplicado (`repetido: true`) sin escribir. Si esa operación lo rechazó, es de otro tipo (`DATOS_INVALIDOS`). Otro actor o relevo → no se revela nada ajeno | `RELEVO_NO_ENCONTRADO` |
| 3 | La operación ya se usó como propuesta o en otro tipo de operación | `DATOS_INVALIDOS` |
| 4 | El actor tiene perfil de rescatista | `NO_ES_RESCATISTA` |
| 5 | Localiza el relevo por `p_relevo_id` y su incidente (lectura sin bloqueo del `incidente_id`, que es inmutable) y exige que el incidente sea de `p_expedicion_id`. Si no, `RELEVO_NO_ENCONTRADO` | `RELEVO_NO_ENCONTRADO` |
| 6 | **Bloqueo** del incidente `FOR UPDATE` y **relectura** del relevo (pudo cambiar mientras se esperaba el bloqueo) | — |
| 7 | `destinatario_id = p_actor_id` | `NO_ES_DESTINATARIO` |
| 8 | `estado = 'pendiente'`. Si ya no lo está, la misma operación que lo aceptó repite el resultado; otra recibe `RELEVO_YA_RESUELTO` con `DETAIL {"estado": "aceptado" \| "rechazado" \| "cancelado"}` | `RELEVO_YA_RESUELTO` |
| 9 | El incidente no está `cerrado`. Cubre el caso cerrado **después** de la propuesta: el relevo sigue `pendiente`, pero un caso cerrado no se transfiere | `INCIDENTE_CERRADO` |
| 9b | El destinatario sigue siendo un rescatista validado (perfil vigente en `perfiles_rescatista`, releído con el incidente bloqueado, no el de la propuesta) | `DESTINATARIO_NO_VALIDADO` |
| 10 | Aplica el relevo (sección 3) | resultado `repetido: false` |

Decisiones de orden y de significado:

- El 7 va antes que el 8: un tercero no averigua si el relevo ya se resolvió.
- `RELEVO_YA_RESUELTO` también responde cuando el destinatario reenvía con **otra** `operacionId` un relevo ya aceptado (o que otro ya rechazó o canceló: el `DETAIL` dice cómo quedó). A diferencia de HU-39 (mismo responsable con otra operación = 200), aquí es una transición de estado con consecuencias sobre el responsable, y se prefiere no confirmar en silencio con una operación distinta. Con la misma `operacionId` sigue siendo 200 idempotente.
- **Regla de versión (una frase):** proponer compara la versión del cliente con la del incidente (`VERSION_DESACTUALIZADA`, 409); aceptar no compara versión, solo que el relevo siga pendiente y que quien acepta sea el destinatario.
- **Por qué, frente a la orientación del backlog** ("modelar ProponerRelevo y AceptarRelevo con la versión del incidente"): la versión sigue siendo el eje de ambos comandos, pero actúa donde protege. Al proponer, la versión evita que el responsable decida sobre un estado que ya no ve. Al aceptar, el destinatario no decide sobre el estado del incidente sino sobre una propuesta concreta (`relevoId`), cuya vigencia ya garantizan el estado `pendiente` y el bloqueo de la fila; la versión en la que se propuso queda guardada (`relevos_coordinacion.version_incidente`) y la que resulta queda en el evento (`version_nueva`). Exigir una versión al aceptar dejaría un relevo imposible de aceptar si el incidente cambia de versión después de la propuesta (por ejemplo, un `localizado` de HU-42) y, con un solo pendiente por incidente, bloquearía el caso. Aceptar sigue subiendo la versión, y eso es lo que fuerza el control optimista de HU-41, HU-42 y HU-50.

### 2.3 `treksafe_rechazar_relevo` y `treksafe_cancelar_relevo`

Ambas con los mismos parámetros que aceptar: `(p_expedicion_id, p_actor_id, p_relevo_id, p_operacion_id)`. Sin motivo y sin versión. Son un envoltorio de `treksafe_resolver_relevo(…, p_estado_final)` con `rechazado` o `cancelado`: una sola implementación, DRY. La función común no admite otro estado final (`DATOS_INVALIDOS`).

| # | Paso | Falla con |
|---|---|---|
| 1 | Algún parámetro nulo o estado final distinto de `rechazado` y `cancelado` | `DATOS_INVALIDOS` |
| 2 | `operacion_resolucion_id = p_operacion_id` ya registrada: mismo actor (`resuelto_por_id`), relevo y expedición **y mismo tipo** → resultado ya aplicado (`repetido: true`) sin escribir. Mismo actor pero el relevo se resolvió con otro tipo (por ejemplo, la operación aceptó) → `DATOS_INVALIDOS`. Otro actor, relevo o expedición → no se revela nada ajeno | `RELEVO_NO_ENCONTRADO` |
| 3 | La operación ya se usó como propuesta (`relevos_coordinacion.operacion_id`) o en otro tipo de operación (`eventos_plan`, `incidentes`) | `DATOS_INVALIDOS` |
| 4 | El actor tiene perfil de rescatista | `NO_ES_RESCATISTA` |
| 5 | El relevo existe y su incidente es de `p_expedicion_id` (lectura sin bloqueo) | `RELEVO_NO_ENCONTRADO` |
| 6 | **Bloqueo** del incidente `FOR UPDATE` y **relectura** del relevo | — |
| 7 | **Rol.** Rechazar: `destinatario_id = p_actor_id`. Cancelar: `responsable_anterior_id = p_actor_id` (quien propuso) | `NO_ES_DESTINATARIO` / `NO_ES_PROPONENTE` |
| 8 | `estado = 'pendiente'`. Si ya no lo está: la misma operación y el mismo tipo repiten el resultado; cualquier otra recibe el rechazo con `DETAIL {"estado": …}` | `RELEVO_YA_RESUELTO` |
| 9 | El incidente no está `cerrado`. **No se escribe nada**: el relevo queda `pendiente` pero inerte (2.4) | `INCIDENTE_CERRADO` |
| 10 | `UPDATE relevos_coordinacion SET estado, resuelto_en = NOW(), resuelto_por_id = p_actor_id, operacion_resolucion_id = p_operacion_id` | resultado `repetido: false` |

Decisiones:

- **Solo cambia el relevo.** No se toca `incidentes`: el responsable, la versión y `asumido_en` siguen igual (el responsable actual conserva la coordinación), y no se inserta ninguna transferencia (eso solo ocurre al aceptar). Por eso no compara versión.
- **El rol va antes que el estado (7 antes que 8)**, como al aceptar: un tercero no averigua cómo terminó el relevo.
- **La repetición idempotente va antes de comprobar el cierre.** Reenviar con la misma operación algo que ya se aplicó devuelve el resultado aunque el caso se haya cerrado después, igual que aceptar.
- **Caso cerrado:** rechazar y cancelar devuelven `INCIDENTE_CERRADO` (409) y no escriben. Aceptar lo había hecho ya así.
- **Tras resolver, se puede proponer otro relevo:** la fila sale del índice único parcial. Una propuesta nueva no tiene relación con la anterior.
- **Sin vencimiento.** Nada resuelve un relevo salvo estas tres acciones.
- Una misma `operacionId` resuelve a lo sumo un relevo (`uq_relevos_operacion_resolucion`).

### 2.4 Al cerrar el incidente: estado derivado (sin trigger, sin tocar el cierre)

**Cómo se cierra hoy un incidente.** En `develop` no existe código de cierre: ni RPC, ni caso de uso, ni ruta (`feat/hu-42-cerrar-incidente` no tiene commits propios). Lo único que existe es el esquema de la 017: `incidentes.estado = 'cerrado'` y `cerrado_en` van juntos en un solo `UPDATE` (`chk_incidentes_cierre`), y la 021 **no** concede a `service_role` `UPDATE` sobre `estado` ni `cerrado_en`, así que HU-42 tendrá que pedirlo. Las pruebas de concurrencia simulan el cierre con ese `UPDATE` desde el superusuario. Este diseño no modifica el código ni las RPC del cierre (es de HU-42).

| | (1) Trigger sobre `incidentes` que marca el relevo como `invalidado` | (2) Estado derivado (**adoptada**) |
|---|---|---|
| Qué hace | `AFTER UPDATE OF estado` pasa el relevo pendiente a `invalidado` | Nada se escribe: las cuatro RPC devuelven `INCIDENTE_CERRADO` y las lecturas ya excluyen los casos cerrados (`.neq('estado', 'cerrado')`), así que `relevoPendiente` no aparece |
| Permisos | La RPC de cierre necesitaría `UPDATE` sobre `relevos_coordinacion`, o el trigger sería `SECURITY DEFINER` | Ninguno |
| Efecto en el cierre de HU-42 | Gana una escritura, un caso de prueba y un `resuelto_por_id` nulo que obliga a relajar los `CHECK` | Ninguno |
| Historial | Queda `invalidado` explícito | Un relevo `pendiente` de un incidente `cerrado` se interpreta como invalidado |
| Riesgo | Acopla HU-40 con HU-42 | Un caso **reabierto** reviviría el relevo pendiente (abajo) |

**Qué debe saber HU-42 (para coordinarlo con Sebastian):** el cierre no cambia por HU-40. Solo debe (a) pedir el permiso `UPDATE (estado, cerrado_en)` sobre `incidentes` para `service_role`, (b) tomar el bloqueo de la fila del incidente, que cualquier `UPDATE` de esa fila ya toma, y (c) saber que un relevo pendiente queda inerte, y que aceptar, rechazar, cancelar y proponer ya respetan el cierre (con pruebas de carrera, sección 5).

**Riesgo del caso reabierto.** La 017 menciona que reabrir exige limpiar `cerrado_en` en el mismo `UPDATE`. Si HU-42 o una historia posterior reabre un incidente, su relevo `pendiente` volvería a ser visible y aceptable, porque nunca se marcó como invalidado. Con estado derivado eso es un efecto, no un error: la historia que implemente reabrir **debe decidir** qué hace con ese relevo (por ejemplo, cancelarlo en la misma operación de reabrir, o aceptar que revive). Hasta entonces no hay reapertura en el sistema. Si se prefiere cerrar el riesgo desde ya, el cambio es el trigger de la opción (1) más el estado `invalidado` en el `CHECK`; el modelo lo admite.

## 3. Aplicación del relevo (todo en una transacción)

Dentro de `treksafe_aceptar_relevo`, con el incidente bloqueado, en este orden y en la misma transacción de la RPC:

1. `UPDATE incidentes SET responsable_id = <destinatario>, version = version + 1, asumido_en = NOW() WHERE id = <incidente>`.
2. `UPDATE relevos_coordinacion SET estado = 'aceptado', resuelto_en = NOW(), resuelto_por_id = p_actor_id, operacion_resolucion_id = p_operacion_id WHERE id = <relevo>`.
3. `INSERT INTO transferencias_coordinacion (…)` con anterior, nuevo, motivo, `version_anterior`, `version_nueva`, `ocurrido_en = NOW()`.
4. Devuelve el resultado con el incidente ya actualizado.

Si cualquiera falla, PL/pgSQL revierte todo: no puede quedar un responsable cambiado sin evento, ni un evento sin cambio. Rechazar y cancelar solo hacen el segundo paso (resolver el relevo) y no producen evento de transferencia.

## 4. API

Las cuatro rutas cuelgan de `/api/rescate`, exigen token de rescatista y usan los mismos middlewares que `/alertas/:expedicionId/coordinacion`. El actor sale siempre del JWT, nunca del cuerpo.

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

Cuerpo: `{ "operacionId": "<uuid>" }` (sin versión). Respuesta `200` (aplicado o repetición) con `{ "coordinacion": {…} }`: el responsable ya es quien aceptó (`esMia: true`), la `version` subió y no hay clave `relevoPendiente`.

### 4.2b `POST …/relevos/:relevoId/rechazar` y `POST …/relevos/:relevoId/cancelar`

- `POST /api/rescate/alertas/:expedicionId/coordinacion/relevos/:relevoId/rechazar`: lo ejecuta el destinatario.
- `POST /api/rescate/alertas/:expedicionId/coordinacion/relevos/:relevoId/cancelar`: lo ejecuta quien propuso.

Cuerpo: `{ "operacionId": "<uuid>" }`, sin motivo ni versión (un motivo en el cuerpo se ignora). Respuesta `200` tanto si se resolvió como si fue una repetición de la misma operación, con `{ "coordinacion": {…} }` vista por quien actúa: **mismo responsable, misma `version`, sin clave `relevoPendiente`**. El actor sale del JWT. Un relevo ya resuelto responde 409 `RELEVO_YA_RESUELTO` con `estadoRelevo` en el cuerpo.

### 4.3 Códigos de error

| Estado | Código | Cuándo |
|---|---|---|
| 400 | Sin código (`ErrorValidacion`, con `detalles`) | Ids que no son UUID, motivo vacío o de más de 280 caracteres, versión no entera |
| 400 | `DATOS_INVALIDOS` | La operación ya se usó en otro tipo de operación (también al rechazar o cancelar con la operación de la propuesta o con una que resolvió de otra manera) |
| 400 | `DESTINATARIO_INVALIDO` | El destinatario es el propio actor |
| 400 | `DESTINATARIO_NO_VALIDADO` | El destinatario no tiene perfil de rescatista |
| 403 | `PROHIBIDO` | Token de senderista |
| 403 | `NO_ES_RESCATISTA` | Token de rescatista sin perfil validado |
| 403 | `NO_ES_RESPONSABLE` | Propone alguien que no es el responsable vigente |
| 403 | `NO_ES_DESTINATARIO` | Acepta o rechaza alguien que no es el destinatario del relevo |
| 403 | `NO_ES_PROPONENTE` | Cancela alguien que no propuso el relevo |
| 404 | `INCIDENTE_NO_ENCONTRADO` | La expedición no tiene incidente, o la operación es ajena |
| 404 | `RELEVO_NO_ENCONTRADO` | El relevo no existe, no es de esa expedición, o la operación es ajena |
| 409 | `INCIDENTE_CERRADO` | El caso está cerrado (proponer, aceptar, rechazar y cancelar) |
| 409 | `RELEVO_PENDIENTE` | Ya hay un relevo pendiente. El cuerpo incluye `relevoPendiente` (sin motivo) |
| 409 | `VERSION_DESACTUALIZADA` | Solo al proponer. El cuerpo incluye `versionActual` |
| 409 | `RELEVO_YA_RESUELTO` | El relevo ya no está pendiente (aceptado, rechazado o cancelado) y la operación es distinta. El cuerpo incluye `estadoRelevo` (`aceptado`, `rechazado` o `cancelado`) |

Solo la falta de token o un token inválido responden 401 (lo interpreta el frontend como sesión vencida).

### 4.4 Cambio en `coordinacion` de las lecturas (sin cambios al rechazar y cancelar)

`GET /rescate/expediciones`, `/alertas` y `/alertas/:expedicionId` agregan a `coordinacion` el campo `relevoPendiente`: el objeto de arriba. **La clave solo existe mientras haya un relevo pendiente** (sin relevo no aparece, en lugar de ir en `null`): así la forma de `coordinacion` sin relevo es exactamente la de HU-39 y sus pruebas, que comprueban el conjunto exacto de claves, siguen pasando sin modificarse. Cambio aditivo y retrocompatible. El frontend trata la ausencia de la clave como "sin relevo pendiente".

- Lo ve todo rescatista autorizado, igual que el responsable (HU-39 CA-03): `relevoId`, `destinatarioId`, `nombreDestinatario`, `solicitadoEn` y `esParaMi` (si quien consulta es el destinatario).
- `motivo` solo se incluye si quien consulta es el responsable (`esMia`) o el destinatario (`esParaMi`). Es texto libre y podría contener información sensible; los demás rescatistas no lo necesitan.
- Sin lecturas adicionales: los relevos van embebidos en la misma consulta de `incidentes` que ya hace `leerCoordinaciones` (una por lista, sin N+1). Como `relevos_coordinacion` tiene dos claves foráneas a `perfiles_rescatista`, el embebido del destinatario lleva la pista `perfiles_rescatista!fk_relevos_destinatario`. Pendiente de la prueba manual contra Supabase real, como el embebido de HU-39.
- Un relevo rechazado o cancelado **no** aparece: solo se muestra el pendiente. Tampoco el pendiente de un caso cerrado (las lecturas excluyen los incidentes cerrados).
- No se expone ningún dato médico en ningún camino. Una prueba lo comprueba, como en HU-39.

## 5. Concurrencia

Todas las RPC toman el bloqueo de la fila del incidente, así que las operaciones sobre un mismo caso se serializan y el que llega segundo evalúa sus reglas ya con el resultado del primero.

| Escenario | Resultado |
|---|---|
| **Dos propuestas simultáneas** (el responsable desde dos sesiones, a B y a C) | La primera inserta el relevo pendiente. La segunda espera el bloqueo, ve el pendiente y recibe `RELEVO_PENDIENTE` con quién es el destinatario. Si algo escribiera sin bloquear, `uq_relevo_pendiente_por_incidente` lo impide y la RPC relee y responde lo mismo. |
| **Proponer contra aceptar** (A propone a C mientras B acepta el relevo de A) | Si gana la aceptación: el responsable pasa a B, la versión sube y la propuesta de A falla con `NO_ES_RESPONSABLE` (ya no lo es). Si gana la propuesta: falla con `RELEVO_PENDIENTE` y la aceptación sigue su curso. En ningún orden hay dos relevos pendientes ni un responsable ambiguo. |
| **Aceptar dos veces** | Misma `operacionId`: la segunda devuelve el mismo resultado sin escribir (200). Otra `operacionId`: `RELEVO_YA_RESUELTO`. El evento de transferencia es único por `relevo_id`, así que ni una condición de carrera puede duplicarlo. |
| Otro rescatista intenta aceptar | `NO_ES_DESTINATARIO`, sin importar el estado del relevo. |
| **Aceptar contra cancelar** | Gana el primero que toma el bloqueo. Si cancela: la aceptación recibe `RELEVO_YA_RESUELTO` con estado `cancelado`, no hay transferencia y el responsable y la versión no cambian (y se puede proponer otro relevo). Si acepta: la cancelación recibe `RELEVO_YA_RESUELTO` con estado `aceptado` y queda una transferencia. |
| **Aceptar contra rechazar** | Igual que la anterior, con estado `rechazado`. |
| **Rechazar contra cancelar** | Gana uno solo; el otro recibe `RELEVO_YA_RESUELTO` con el estado ganador. |
| **Rechazar o cancelar dos veces** | Misma `operacionId`: una escribe y la otra repite el resultado. Otra `operacionId`: `RELEVO_YA_RESUELTO` con el estado. |
| **Aceptar contra el cierre del caso** (HU-42) | HU-42 toma el mismo `FOR UPDATE` del incidente (basta un `UPDATE` de la fila). Si gana el cierre: la aceptación recibe `INCIDENTE_CERRADO`, no hay transferencia, el responsable es el mismo y el relevo queda pendiente e inerte. Si gana la aceptación: se transfiere y después se cierra, lo cual es legítimo. **Nunca queda una transferencia aplicada sobre un caso ya cerrado.** |
| **Rechazar o cancelar contra el cierre** | Si gana el cierre: `INCIDENTE_CERRADO` y el relevo no cambia. Si gana la resolución: el relevo queda `rechazado` o `cancelado` y luego se cierra. |
| Asumir (HU-39) contra relevo | `treksafe_asumir_coordinacion` solo inserta si no hay incidente no cerrado, así que no compite con el relevo. |

Sin interbloqueos: cada RPC mantiene un único bloqueo de fila (el incidente). La lectura previa del relevo en aceptar, rechazar y cancelar (paso 5) no bloquea y su `incidente_id` es inmutable. Un cierre que tome el mismo bloqueo (un `UPDATE` del incidente) respeta el mismo orden.

### Resultado real de las pruebas de carrera (ejecutadas el 2026-11-11)

`node backend/scripts/test-hu40-postgres.mjs` contra PostgreSQL 18.6 desechable en Docker (`127.0.0.1:55432`, base `treksafe_desechable`): **61 casos, 61 pasan, 0 fallan** (regresión SQL de HU-39 12 de 12, suite SQL de HU-40 23 de 23, concurrencia con sesiones reales 26 casos). Cada pareja se prueba en dos formas: en **barrera** (una sesión retiene el bloqueo, la otra se lanza y se espera a verla bloqueada en `pg_stat_activity`, y recién entonces se confirma la primera; el orden queda fijado) y en **25 rondas** con `Promise.all` (el orden lo decide el servidor).

| Pareja | Qué se comprueba | Distribución observada en 25 rondas (una ejecución) |
|---|---|---|
| Aceptar contra rechazar | Gana una sola; la otra `RELEVO_YA_RESUELTO` con el estado ganador; transferencia solo si gana aceptar; si gana rechazar, se puede proponer otro | aceptar 21, rechazar 4 |
| Aceptar contra cancelar | Ídem | aceptar 17, cancelar 8 |
| Rechazar contra cancelar | Ídem; `resuelto_por_id` coincide con quien ganó | una sola gana en las 25 |
| Rechazar o cancelar dos veces | Misma operación: una escribe y la otra repite; otra operación: `RELEVO_YA_RESUELTO` | 25 rondas de cada una |
| Rechazar o cancelar contra el cierre | Cierre primero: `INCIDENTE_CERRADO` y relevo pendiente e inerte; resolución primero: relevo resuelto y luego cierre | rechazar llegó antes del cierre en 6, cancelar en 2 |
| Aceptar contra el cierre | Cierre primero: `INCIDENTE_CERRADO`, sin transferencia, mismo responsable y versión; aceptar primero: una transferencia, el cierre espera y después todo devuelve el estado final | aceptar llegó antes en 3 rondas y después en 22 |

Invariantes comprobados al final: un solo pendiente por incidente, resolución completa o ausente, y una transferencia por cada relevo `aceptado` y ninguna por los demás. La distribución de quién gana varía entre ejecuciones; lo que se afirma es la exclusión, no los porcentajes. El orden se fija con la barrera, no comparando `now()` (que es el inicio de la transacción).

Además, en memoria (`IncidenteDAOMemoria`, cola por expedición) y por HTTP se repiten las carreras aceptar contra rechazar, aceptar contra cancelar y rechazar contra cancelar; esas pruebas no sustituyen a las de PostgreSQL.

## 6. Capas del backend (Command y DAO, SRP y DIP)

| Pieza | Responsabilidad |
|---|---|
| `ComandoProponerRelevo` | Inmutable: valida con zod y `Object.freeze`. Lleva `operacionId`, `destinatarioId`, `motivo`, `versionIncidente` (del cuerpo) y `rescatistaId`, `expedicionId` (JWT y ruta). |
| `ComandoAceptarRelevo`, `ComandoRechazarRelevo`, `ComandoCancelarRelevo` | Igual, sin versión ni motivo: `operacionId` (cuerpo), `relevoId`, `expedicionId` (ruta), `rescatistaId` (JWT). Rechazar y cancelar comparten el esquema zod de aceptar. |
| `ProponerRelevo`, `AceptarRelevo`, `RechazarRelevo`, `CancelarRelevo` | Implementan `IEjecutorComando`. Solo delegan en el DAO y traducen `ErrorCoordinacion` a `ErrorAplicacion` (sin 401). No repiten reglas de la RPC. |
| `IRelevoDAO` | Interfaz nueva, junto a `IIncidenteDAO`, con `proponerRelevo`, `aceptarRelevo`, `rechazarRelevo` y `cancelarRelevo`. `IIncidenteDAO` no cambia (segregación de interfaces): quien solo asume o lee coordinaciones no depende del relevo, y no se rompe ningún implementador ni prueba de HU-39. `leerCoordinaciones`, que sigue en `IIncidenteDAO`, devuelve `relevoPendiente`. Las reglas siguen en la RPC. |
| `IncidenteDAOSupabase` / `IncidenteDAOMemoria` | Ambos implementan `IIncidenteDAO` e `IRelevoDAO`. El de Supabase es el adaptador de la RPC por constructor (DIP); el de memoria replica las reglas para las pruebas de caso de uso y HTTP. |
| `controladorRelevo`, `coordinacionDesdeRelevo` | El controlador solo adapta HTTP (201/200 al proponer, 200 al aceptar, rechazar y cancelar). El mapeo de la respuesta (la coordinación vista por quien actúa, con el motivo porque es parte del relevo) está aparte, en una función pura. |
| `RESPUESTAS_RELEVO` | Definición única del estado HTTP y el mensaje de cada código (incluido `NO_ES_PROPONENTE`, 403); la usan los cuatro casos de uso. `traducirErrorRelevo` conserva `versionActual`, `relevoPendiente` y `estadoRelevo`. |
| `ErrorCoordinacion` | Se reutiliza haciéndola genérica en el tipo del código (`ErrorCoordinacion<C extends string = CodigoErrorCoordinacion>`): HU-39 sigue usando el tipo por defecto sin cambios y HU-40 usa `ErrorCoordinacion<CodigoErrorRelevo>`, con un campo `detalle` (`versionActual`, `relevoPendiente`, `estadoRelevo`). La tabla HTTP de HU-39 (`RESPUESTAS_COORDINACION`) se conserva; los códigos nuevos tienen su propia tabla. |
| `IRescatistasDAO`, `controladorRescatistas` | Catálogo de rescatistas validados para elegir destinatario (`GET /api/rescate/rescatistas`): solo `{id, nombreCompleto}`, sin el actor. Interfaz propia: no mezcla catálogo con coordinación. |
| `controladorCoordinacion` | Se agregan manejadores finos. `crearRutasRescate` sigue siendo el único sitio que construye DAO y casos de uso. |

## 7. Contrato para HU-41 y HU-50 (Sebastian)

No se tocan sus historias. Lo que deben leer es esto:

| Qué | Dónde | Garantía |
|---|---|---|
| Responsable vigente | `incidentes.responsable_id` (no cerrado) | Solo cambia al aceptar un relevo, nunca al proponer. Mientras el relevo está pendiente sigue siendo el anterior. |
| "Coordina desde" | `incidentes.asumido_en` | Se reinicia en cada relevo. |
| Cambio de responsable | `incidentes.version` | Sube en 1 con cada relevo aplicado. |
| Historial de transferencias | `transferencias_coordinacion` (solo anexar) | Una fila por relevo con anterior, nuevo, motivo, versiones y hora. |
| No leer | `relevos_coordinacion` | Es estado de trabajo, no contrato. `motivo` no debe mostrarse a terceros. Rechazar y cancelar no cambian `responsable_id`, `version` ni `asumido_en`. |
| Relevo y cierre | `incidentes.estado` | Un relevo pendiente de un incidente cerrado queda inerte (estado derivado, 2.4); no se invalida con una escritura. |

HU-41 y HU-50 no necesitan cambios para seguir funcionando: HU-50 sigue autorizando contra `incidentes.responsable_id`.

## 8. Alcance de frontend (mínimo viable)

Dentro del alcance, porque sin interfaz el relevo no se puede usar ni demostrar. Sin pantallas nuevas: todo en `BloqueCoordinacion`, que ya está en el monitor, la lista de alertas y el detalle.

- **Responsable (`esMia`) sin relevo pendiente:** botón "Transferir coordinación". Abre un formulario corto: destinatario, motivo (máx. 280, con la advertencia "No incluyas datos médicos") y confirmar. Envía la `version` que ya tiene `coordinacion`.
- **Responsable con relevo pendiente (quien propuso):** "Relevo pendiente a <nombre> desde HH:MM. Sigues coordinando tú" y el botón "Cancelar relevo". Pide confirmación ("¿Cancelar el relevo? Seguirás coordinando tú y podrás proponer otro."). Tras cancelar, avisa "Cancelaste el relevo. Sigues coordinando tú y puedes proponer otro." y vuelve a ofrecer "Transferir coordinación".
- **Destinatario (`esParaMi`):** "<responsable> te propone relevarlo: <motivo>" con los botones "Aceptar relevo" y "Rechazar". Rechazar pide confirmación ("¿Rechazar el relevo? Seguirá coordinando quien lo propuso.") y avisa "Rechazaste el relevo. Sigue coordinando quien lo propuso." Tras aceptar, la pantalla se relee y muestra "Tú coordinas esta alerta".
- **Relevo que cambió:** si el relevo ya no estaba pendiente, el mensaje dice cómo quedó ("El relevo ya fue aceptado / rechazado / cancelado.", a partir de `estadoRelevo`) y la pantalla se relee. Con el caso cerrado: "El caso está cerrado y no admite relevos".
- **Sin vencimiento:** el relevo pendiente mantiene sus botones hasta que alguien lo resuelva.
- **Otros rescatistas:** ven "Relevo pendiente a <nombre>", sin motivo.
- **Lógica fuera del componente** (SRP), en `lib/coordinacionRescate.ts`: textos, reglas de visibilidad y el `operacionId` por intento con `generarUuid()`. Se reutiliza hasta tener un resultado definitivo, como en HU-39. Ante `VERSION_DESACTUALIZADA` (al proponer), `RELEVO_PENDIENTE`, `NO_ES_RESPONSABLE`, `RELEVO_YA_RESUELTO`, `NO_ES_DESTINATARIO`, `NO_ES_PROPONENTE`, `RELEVO_NO_ENCONTRADO` o `INCIDENTE_CERRADO` se muestra el motivo y se relee la pantalla. Rechazar y cancelar usan su propio `operacionId` por intento, con la misma política: se conserva solo si el resultado es incierto (red o 5xx).
- **Necesita un endpoint de apoyo:** `GET /api/rescate/rescatistas` con `{id, nombreCompleto}` de los rescatistas validados (excluye al que consulta), para elegir destinatario. Solo nombre, sin datos médicos ni de contacto. Implementado: `RescatistasDAOSupabase` (interfaz `IRescatistasDAO`) consulta `perfiles_rescatista` con el mismo criterio de "validado" que las RPC (existe la fila) y excluye al actor; la ruta exige token de rescatista.

Queda fuera: notificaciones o avisos al destinatario (decidido: sin notificación adicional; se entera al abrir el caso), y cualquier pantalla o endpoint de historial de relevos o transferencias (decidido: el historial solo se guarda).

## 9. Migración y registro

| Archivo | Contenido |
|---|---|
| `021_hu40_transferir_coordinacion.sql` | `relevos_coordinacion` (estados, historial de quién resolvió y cuándo), `transferencias_coordinacion` y sus triggers de solo anexar, `GRANT UPDATE` por columna sobre `incidentes`, `treksafe_resultado_relevo`, `treksafe_proponer_relevo`, `treksafe_aceptar_relevo`, `treksafe_resolver_relevo`, `treksafe_rechazar_relevo` y `treksafe_cancelar_relevo`. Requiere la 017 (e indirectamente la 002). Aplicar una sola vez; registra en `treksafe_migraciones` solo si existe. |

- La fila 021 está en `backend/migrations/README.md`, entre la 019 (HU-41) y la 022 (DEP-04), todas ya en `develop` salvo la 021.
- **Numeración.** La migración se llamó `019_hu40_transferir_coordinacion.sql` hasta el merge con `develop` (2026-11-11), cuando HU-41 ya había usado la 019 y la había aplicado en DEV (17:46 UTC). Pasó a la **021** porque la 020 la usa la rama `feat/hu-49-sincronizacion-offline` (`020_hu49_creacion_plan_idempotente.sql`) y de la 022 a la 024 es DEP-04. `develop` dice que la 020 y la 021 «no forman parte de esta entrega» (DEP-04): significa que DEP-04 las dejó sin usar y pide comprobar su disponibilidad contra las ramas pendientes antes de asignarlas; no las reserva para nadie. La 021 estaba libre en todas las ramas remotas. El proyecto personal de pruebas la tiene registrada todavía con el número anterior (`019`, nombre `hu40_transferir_coordinacion`); ver `evidencias/reinicio-021-personal.sql`.
- **La migración de HU-40 se corrigió en sitio para ampliar el relevo (rechazar y cancelar), igual que se hizo con la 018 en HU-27.** Se eligió así, y no una migración nueva encima, porque nunca llegó a `develop` ni a un entorno compartido (no está en `origin/develop` ni en `REGISTRO_APLICACION.md`): una migración adicional habría dejado en el historial una versión con el `CHECK` y las columnas anteriores y habría obligado a reescribir tablas y funciones en caliente. **El PR queda pendiente de que Ariana confirme que la migración de HU-40 (ni como 019 ni como 021) no está aplicada en DEV.** Mientras tanto no se aplica en ningún entorno compartido.
- El único entorno que tuvo la versión anterior es el proyecto Supabase personal de pruebas. Para ese caso existe [`evidencias/reinicio-021-personal.sql`](evidencias/reinicio-021-personal.sql): borra solo los objetos de HU-40 (funciones y las dos tablas, con sus datos de prueba), devuelve a `incidentes` los permisos de la 017 (sin tocar `UPDATE (version)` de la 019 de HU-41) y quita el asiento de HU-40 (`019` o `021`, siempre filtrado por el nombre `hu40_transferir_coordinacion`), para reaplicar la 021 corregida una sola vez. **No es una migración y no se ejecuta en DEV ni en producción.** Validado en PostgreSQL desechable: 021 anterior, reinicio, 021 nueva y suite SQL de 23 casos (23 de 23).
- No se editan otras migraciones. La 021 es **aditiva** sobre `incidentes`: no hace `REVOKE ALL`, solo quita a `service_role` el `UPDATE`, `DELETE` y `TRUNCATE` de tabla completa (los que Supabase concede por defecto y la 017 no retiró; sin quitarlos, la suite SQL falla: `service_role` podría cambiar `estado` y borrar incidentes) y vuelve a conceder `UPDATE (responsable_id, version, asumido_en)`, de modo que conserva el `UPDATE (version)` de la 019 de HU-41 (probado aplicando develop completo y después la 021).
- Ariana aplica la 021 en DEV, después de la 019 (HU-41) y de las migraciones de DEP-04 ya aplicadas, una vez confirmado lo anterior. No se vuelve a ejecutar `init_schema.sql` en DEV.

## 10. Plan de verificación

- **Regresión de HU-39:** sus pruebas (suite SQL, concurrencia, backend y frontend) se ejecutan sin modificarlas.
- **Pruebas automáticas:** comandos, `ProponerRelevo`, `AceptarRelevo`, `RechazarRelevo`, `CancelarRelevo`, `IncidenteDAOMemoria`, `IncidenteDAOSupabase` (cliente simulado), `coordinacion.relevoPendiente` en las lecturas, HTTP con JWT real y frontend (lógica y bloque).
- **Suite SQL** en PostgreSQL desechable (Docker `postgres:18`, puerto 55432, solo `127.0.0.1`/`localhost` y base con "desechable" en el nombre), con las migraciones hasta la 021. Casos: aceptación feliz y atómica; rechazo por actor incorrecto (propone un no responsable, acepta un no destinatario); destinatario igual al actor o sin perfil; incidente inexistente y cerrado; relevo duplicado; versión desactualizada; relevo ya resuelto; idempotencia de ambas RPC; evento de transferencia inmutable; rollback si falla un paso; rechazar y cancelar (quién puede, idempotencia, `RELEVO_YA_RESUELTO` con estado, caso cerrado, historial de quién y cuándo, y restricciones de la base).
- **Concurrencia con sesiones reales** (como `test-hu39-postgres.mjs`): dos propuestas, proponer contra aceptar, aceptar dos veces, aceptar contra rechazar, aceptar contra cancelar, rechazar contra cancelar y aceptar, rechazar y cancelar contra el cierre, con barrera de bloqueo y rondas repetidas (sección 5).
- **Prueba manual solo en el Supabase personal** (`wwan…`). Nunca el DEV del equipo (`ibnw…`). Se verifica el destino antes de escribir. Debe confirmar, como en HU-39: que el código del `RAISE EXCEPTION` llega en `error.message` y el JSON en `error.details` (también el `DETAIL {"estado": …}` de `RELEVO_YA_RESUELTO`), y que los embeds de `perfiles_rescatista` funcionan con `service_role` con el esquema recargado. Antes de ejecutar el reinicio de la 021 se confirma con quien prueba la referencia del proyecto; quien prueba lo ejecuta en el panel.

## 11. Decisiones del Product Owner y preguntas abiertas

### Decididas por el PO (Marko)

| Tema | Decisión |
|---|---|
| Rechazar o cancelar un relevo pendiente | Sí: el destinatario rechaza y quien propuso cancela, mientras esté pendiente. Ambas liberan proponer otro. **Sin vencimiento automático.** |
| Quién conserva el caso | El responsable actual hasta que el destinatario acepte. |
| Relevo pendiente y cierre del caso | Queda invalidado y ya no puede aceptarse. Implementado como estado derivado (sin trigger): sección 2.4. |
| Estados de incidente | Los de incidente abierto que permite HU-39; se conserva la regla de HU-40 (solo el responsable vigente propone a otro rescatista validado). |
| Aviso al destinatario | Sin notificación adicional: lo ve al abrir el caso. |
| Historial | Se registra quién aceptó, rechazó o canceló, y cuándo. Sin endpoint ni pantalla nueva. |
| Motivo al rechazar o cancelar | Ninguno: solo quién, qué y cuándo. |
| Pruebas | La aceptación simultánea con cancelación, con rechazo y con cierre: solo una se impone y nunca queda una transferencia sobre un caso cerrado. |

### Siguen abiertas

1. **Caso reabierto.** Con estado derivado, un incidente que se reabra haría revivir su relevo pendiente. Quien implemente reabrir (HU-42 u otra) debe decidir si lo cancela en la misma operación (sección 2.4). Hoy no existe reapertura.
2. **Destinatario que pierde el perfil validado.** La clave foránea `fk_relevos_destinatario` es `ON DELETE RESTRICT`, así que mientras exista el relevo no se puede borrar su perfil; el paso 9b de aceptar es una defensa adicional. Si en el futuro se permite revocar o quitar perfiles, hay que decidir si los relevos pendientes de esa persona se cancelan o invalidan solos. Mientras tanto no se cambia nada.
3. **Permiso de cierre.** HU-42 debe pedir `UPDATE (estado, cerrado_en)` sobre `incidentes` para `service_role`; la 021 no lo concede (coordinar con Sebastian).
4. **¿Se exige `alerta` para relevar?** Se decidió solo "no cerrado" (los estados de incidente abierto de HU-39). Si el PO prefiere exigir `alerta`, es un paso más de la RPC.
5. **Versión.** Decidido: proponer la compara; aceptar, rechazar y cancelar no (razón en 2.2 y 2.3). Confirmar con Sebastian y HU-42 que todo cambio relevante del incidente (por ejemplo `localizado`) sube `version`, para que la comparación al proponer sea útil.
6. **Nombre y alcance de `transferencias_coordinacion`.** Confirmar con Sebastian que HU-41 no define una bitácora propia que deba absorberla.
7. **Operaciones entre tablas.** Se mantiene la nota de HU-39: la unicidad de `operacion_id` es por tabla. Las RPC de HU-40 revisan `eventos_plan` e `incidentes` y `relevos_coordinacion`; las RPC antiguas no revisan las tablas nuevas.
8. **Confirmación de Ariana** de que la 021 no está aplicada en DEV (sección 9).

## 12. Estado de implementación

Resultados reales de lo ya ejecutado (2026-11-11), incluida la prueba manual de la API contra el Supabase personal; queda pendiente la del navegador y la aplicación en DEV.

| Parte | Estado | Dónde / resultado |
|---|---|---|
| Migración 021 corregida (relevo con rechazar y cancelar) y suite SQL | Hecho; **no aplicada en ningún entorno** (pendiente de que Ariana confirme DEV) | `backend/migrations/021_hu40_transferir_coordinacion.sql`, `backend/migrations/tests/hu40_transferir_coordinacion.test.sql`. Con develop completo y la 021 (PostgreSQL 17.11): suite SQL de HU-40 23 de 23; regresión SQL de HU-39 12 de 12; suite SQL de HU-41 16 de 16 |
| SQL de reinicio para el Supabase personal | Hecho y validado en Docker; **sin ejecutar** en Supabase | `docs/hu-40/evidencias/reinicio-021-personal.sql` |
| Concurrencia con sesiones reales (incluidas aceptar contra rechazar, cancelar y cierre) | Hecho | `backend/scripts/test-hu40-postgres.mjs --imagen postgres:17`: 26 casos de concurrencia, 77 casos en total (con las tres suites SQL), 77 pasan, 0 fallan |
| Backend: comandos, casos de uso, DAO (memoria y Supabase) y rutas de proponer, aceptar, rechazar y cancelar | Hecho | `backend/src/application/`, `backend/src/infrastructure/repositories/`, `backend/src/presentation/http/`. `npx tsc --noEmit` sin errores; `npm test` del backend tras el merge con `develop`: 879 pruebas, 878 pasan; la que falla es `importaciones.test.ts` (aviso DEP0169 de Node 24.14 que emite `bcrypt`, ajeno a HU-40; con `NODE_OPTIONS=--no-deprecation` pasa) |
| `relevoPendiente` en las lecturas | Hecho | `IncidenteDAOSupabase.leerCoordinaciones` (no muestra relevos resueltos) |
| `GET /api/rescate/rescatistas` | Hecho | `RescatistasDAOSupabase`, `controladorRescatistas` |
| Frontend: transferir, aceptar, rechazar y cancelar | Hecho (sección 8) | `frontend/src/components/rescate/BloqueRelevo.tsx`, `frontend/src/lib/coordinacionRescate.ts`, `frontend/src/services/rescate.ts`. `npm run test:equipo` tras el merge: 209 pruebas, 207 pasan, 0 fallan, 2 omitidas (HU-30 y HU-31, que requieren PostgreSQL) |
| Prueba manual contra Supabase real | API y Supabase real **ejecutados** el 2026-11-11 contra la versión corregida (entonces numerada 019): los 20 escenarios, RC1–RC23 y V1–V12, todo PASS. **Pendiente** la parte del navegador (N1–N13) y repetirla si cambia el SQL | [`evidencias/prueba-manual.md`](evidencias/prueba-manual.md) |
| Aplicar la 021 en DEV y registrarla | Pendiente (Ariana, tras confirmar que no estaba aplicada) | `backend/migrations/REGISTRO_APLICACION.md` |
| Invalidar el relevo al cerrar el caso | Resuelto como estado derivado, sin tocar el cierre de HU-42 | Sección 2.4 |
| Aviso al destinatario, historial en pantalla o endpoint | No hay: decidido por el PO | — |

Cambio sobre HU-39: `BloqueCoordinacion` ahora incluye `BloqueRelevo`, así que el responsable ve "Transferir coordinación". La prueba de HU-39 "esMia muestra Tú coordinas…" exigía cero botones y se ajustó para exigir solo que no aparezca "Asumir coordinación". El resto de las pruebas de HU-39 no se modificó.

Pruebas de HU-40 que cambiaron con el merge con `develop` (2026-11-11): `servicioRescate.relevo.test.ts` usa filas en camelCase (`senderista`, `horaRetornoEstimada`…), como las de `servicioRescate.coordinacion.test.ts` de HU-39, porque `ServicioRescate` ya no recibe filas de persistencia; `hu40_transferir_coordinacion.test.sql` y `test-hu40-postgres.mjs` dan a cada expedición su propio senderista (DEP-04, migración 022, impide dos expediciones bloqueantes de un mismo senderista); ninguna aserción se quitó ni se debilitó.

Pruebas de HU-40 existentes que cambiaron con esta ampliación (detalle en [prueba-manual.md](evidencias/prueba-manual.md)): tres de `BloqueRelevo.test.tsx` por los botones nuevos, y en el backend las que fijaban el contrato anterior (el estado `cancelado` ya es válido, `RELEVO_YA_RESUELTO` lleva `estadoRelevo`, el relevo lleva `resueltoPorId` y `NO_ES_PROPONENTE` es un código más).

# HU-40 · Prueba manual contra Supabase real (proyecto personal)

**Estado:** la parte de API y de Supabase real (preparación, 20 escenarios y V1–V6) se ejecutó el 2026-11-10/11 contra la **versión anterior** de la migración 019, que solo tenía proponer y aceptar. Esos resultados se conservan tal cual, como antecedente. **La 019 se corrigió en sitio para ampliar el relevo (rechazar y cancelar) y esa versión todavía no se ha probado en Supabase real:** la sección "Rechazar, cancelar y caso cerrado" y las filas marcadas "Pendiente (Bloque 5)" están **en blanco a propósito** hasta que se ejecuten. Tampoco se ha ejecutado la parte del navegador (N1–N13).

Los resultados de las columnas que no dicen "Pendiente" son los obtenidos en la ejecución anterior (hora UTC de las migraciones: 2026-11-11 00:11–00:16); no se resumieron de memoria.

Plantilla y criterios tomados de [HU-39](../../hu-39/evidencias/prueba-manual.md).

- Fecha de ejecución: 2026-11-11 00:11–00:20 UTC (tarde del 2026-11-10, hora local)
- Ejecuta: el autor de la rama, con el guion de este documento (scripts locales fuera del repositorio, como en HU-39)
- Destino: proyecto personal `wwan….supabase.co`. **Nunca el DEV del equipo** (el ref `ibnw…` está en la lista de bloqueo). Se verifica el destino antes de escribir.
- Backend local con `CRON_ENABLED=false`, sin SMTP/Brevo y sin `DATABASE_URL`. Claves y tokens enmascarados (`Bearer ***`, `***`); el ref, con 4 caracteres.

## Evidencia automática previa (PostgreSQL desechable en Docker, no es Supabase)

Obtenida el 2026-11-11 con `node backend/scripts/test-hu40-postgres.mjs` sobre la **019 corregida** (`postgres:18`, `127.0.0.1:55432`, base `treksafe_desechable`; `init_schema.sql`, migraciones 000–016, 017 y 019):

- Regresión SQL de HU-39 con la 019 aplicada: 12 de 12.
- Suite SQL de HU-40: 23 de 23 (proponer, aceptar, rechazar, cancelar, caso cerrado y restricciones del historial).
- Concurrencia con sesiones reales: 26 casos, 26 pasan (incluidas aceptar contra rechazar, aceptar contra cancelar, rechazar contra cancelar y aceptar, rechazar y cancelar contra el cierre; ver sección 5 del [diseño](../diseno.md)).
- Resumen del script: 61 casos, 61 pasan, 0 fallan.
- Reinicio validado: 019 anterior → `reinicio-019-personal.sql` → 019 corregida → suite SQL de 23 casos, 23 de 23.
- Backend: `npx tsc --noEmit` sin errores; `npm test` 787 de 787. Frontend: `npm run typecheck` sin errores; `npm run test:equipo` 182 pruebas, 180 pasan, 0 fallan, 2 omitidas (HU-30 y HU-31, que requieren PostgreSQL).

(La ejecución anterior, sobre la 019 sin rechazar ni cancelar, había dado 40 de 40: 12 + 16 + 12.)

Esto no sustituye la prueba manual: no pasa por PostgREST ni por el esquema de Supabase.

## Qué debe confirmar esta prueba (y no se puede ver en la base desechable)

1. **Errores de la RPC por PostgREST:** el código del `RAISE EXCEPTION` llega en `error.message` y el JSON en `error.details` (`RELEVO_PENDIENTE` con el relevo vigente; `VERSION_DESACTUALIZADA` con `{"versionActual": n}`).
2. **Embeds con `service_role`:** `perfiles_rescatista ( nombre_completo )` del responsable y `perfiles_rescatista!fk_relevos_destinatario ( nombre_completo )` del destinatario, con el esquema recargado. `relevos_coordinacion` tiene dos claves foráneas a `perfiles_rescatista`: sin la pista, el embebido sería ambiguo.
3. **`GET /api/rescate/rescatistas`:** la consulta `perfiles_rescatista` con `service_role` devuelve solo `{id, nombreCompleto}` y excluye al actor.
4. **Permisos por columna:** `service_role` actualiza `responsable_id`, `version` y `asumido_en` de `incidentes` (la RPC de aceptar funciona), pero no `estado` ni `cerrado_en`. En `relevos_coordinacion` actualiza solo `estado`, `resuelto_en`, `resuelto_por_id` y `operacion_resolucion_id` (no `motivo`).
5. **`DETAIL` de `RELEVO_YA_RESUELTO` por PostgREST:** llega en `error.details` como `{"estado": "aceptado" | "rechazado" | "cancelado"}` y el backend lo devuelve como `estadoRelevo`.
6. **Rechazar y cancelar con la 019 corregida:** las dos RPC nuevas se ven por PostgREST tras recargar el esquema, no cambian el responsable ni la versión, dejan quién y cuándo, y devuelven `INCIDENTE_CERRADO` sin escribir en un caso cerrado.

## Preparación

| # | Paso | Resultado |
|---|---|---|
| P1 | Verificar el destino: URL, `--ref-personal` y lista de bloqueo (como `verificar-destino.mjs` de HU-39). Si falla, no se arranca nada | OK. `verificar-destino.mjs` con `--ref-personal` de `wwan…`: destino personal, fuera de la lista de bloqueo (`ibnw…`). Clave `sb_secret_` (el ref no es verificable en la clave; se valida URL, ref y lista de bloqueo) |
| P2 | Comprobar en `treksafe_migraciones` que están la 017 y la 019; si falta la 019, aplicarla **una sola vez** con el SQL Editor | `treksafe_migraciones` en `wwan…`: 017 (2026-11-10 16:03 UTC), 018 (2026-11-11 00:11:25 UTC) y 019 (2026-11-11 00:12:02 UTC). Ver la nota sobre el primer intento |
| P3 | Recargar el esquema de PostgREST (`NOTIFY pgrst, 'reload schema';`) | `NOTIFY pgrst, 'reload schema'` ejecutado desde el SQL Editor; `relevos_coordinacion` y `transferencias_coordinacion` pasaron a responder HTTP 200 |
| P4 | Arrancar el backend local contra el proyecto personal con `CRON_ENABLED=false` | OK. Backend desde una copia limpia del commit `9f30027` (solo archivos versionados, sin `.env`), con `CRON_ENABLED=false`, sin SMTP/Brevo y sin `DATABASE_URL`. Arranque: "Supabase wwan….supabase.co · cron desactivado · sin SMTP/Brevo"; `/api/salud` 200 |
| P5 | Datos con marca `HU40-PRUEBA`: A (responsable, ya con perfil), B y C (rescatistas validados), un rescatista sin perfil, un senderista, y expediciones en `alerta` (una por escenario). A asume cada alerta con la API de HU-39 | OK. Ver "Datos creados" |

### Reinicio y reaplicación de la 019 corregida (solo proyecto personal)

La 019 anterior ya está en el proyecto personal y no es re-ejecutable, así que antes de probar lo nuevo hay que reiniciarla. **El reinicio lo ejecuta el autor de la rama en el SQL Editor; quien prueba con asistencia no toca la base hasta que se le indique.** Antes de ejecutarlo se muestra la referencia del proyecto y se espera confirmación. Nada de esto va al DEV del equipo ni a producción.

| # | Paso | Resultado |
|---|---|---|
| R1 | Mostrar la referencia del proyecto (URL y `--ref-personal`, 4 caracteres) y confirmarla: debe ser `wwan…` y no `ibnw…` | Pendiente (Bloque 5) |
| R2 | Ejecutar [`reinicio-019-personal.sql`](reinicio-019-personal.sql) en el SQL Editor. Borra solo las funciones y las tablas de HU-40 (con sus relevos y transferencias de prueba), devuelve a `incidentes` los permisos de la 017 y quita el asiento `019`. No toca incidentes, expediciones ni usuarios | Pendiente (Bloque 5) |
| R3 | Aplicar `019_hu40_transferir_coordinacion.sql` corregida, **una sola vez** | Pendiente (Bloque 5) |
| R4 | `NOTIFY pgrst, 'reload schema';` y comprobar que `relevos_coordinacion`, `transferencias_coordinacion` y las RPC `treksafe_rechazar_relevo` y `treksafe_cancelar_relevo` responden | Pendiente (Bloque 5) |
| R5 | Comprobar en `treksafe_migraciones` el asiento `019` nuevo | Pendiente (Bloque 5) |
| R6 | Arrancar el backend local con `CRON_ENABLED=false`, sin SMTP/Brevo y sin `DATABASE_URL`, desde una copia limpia del commit probado | Pendiente (Bloque 5) |

Tras el reinicio se conservan las expediciones `HU40-PRUEBA` y sus incidentes (E1 con B como responsable en versión 2, E2 con A, E3 cerrado); desaparecen los relevos y la transferencia de la ejecución anterior. Para los escenarios nuevos se usan alertas `HU40-PRUEBA` nuevas en `alerta` con A como responsable.

## Guion de la API (proponer y aceptar): resultados contra la 019 anterior

Estos 20 escenarios se ejecutaron contra la versión anterior de la 019. **Deben repetirse contra la 019 corregida** (columna siguiente en la ejecución del Bloque 5); los resultados de la derecha son los de entonces, y las menciones a `operacion_aceptacion_id` corresponden a esa versión (hoy `operacion_resolucion_id`). Repetición contra la 019 corregida: Pendiente (Bloque 5).

Cada fila se anota con el estado HTTP y el código del cuerpo. `V` es `coordinacion.version` antes del paso.

| # | Actor | Acción | Esperado | Resultado |
|---|---|---|---|---|
| 1 | A | Proponer a B con motivo `Cambio de turno` y `versionIncidente = V` | 201; `relevoPendiente` con B y `esParaMi: false`; `version` sigue en `V`; A sigue con `esMia: true` | **PASS.** 201. `relevoPendiente` con B (`Lucía Fernández Ríos`), `esParaMi:false` y el motivo; `version` 1 sin cambio; `esMia:true`; 7 claves |
| 2 | A | Repetir el mismo `operacionId` | 200; mismo `relevoId`; sin segundo relevo | **PASS.** 200, mismo `relevoId`; 1 sola fila en `relevos_coordinacion` |
| 3 | A | Proponer a C con otro `operacionId` | 409 `RELEVO_PENDIENTE` con el relevo vigente y sin `motivo` | **PASS.** 409 `RELEVO_PENDIENTE`; el cuerpo trae `relevoPendiente` (`relevoId`, `destinatarioId`, `nombreDestinatario`, `solicitadoEn`) sin `motivo` |
| 4 | B | Proponer a C (B no es responsable) | 403 `NO_ES_RESPONSABLE` | **PASS.** 403 `NO_ES_RESPONSABLE` |
| 5 | A, B, C | Lecturas `GET /rescate/expediciones`, `/alertas` y `/alertas/:id` | `relevoPendiente` presente en las tres; `motivo` solo para A y B; C no lo ve | **PASS.** Con A, B y C las tres lecturas dieron 200 y `relevoPendiente` en 3 apariciones de E1, con `nombreDestinatario` resuelto. `motivo` visible para A y B, oculto para C. Sin claves de aspecto médico en `coordinacion` |
| 6 | C | Aceptar el relevo de B | 403 `NO_ES_DESTINATARIO` | **PASS.** 403 `NO_ES_DESTINATARIO`. Además: relevo inexistente 404 `RELEVO_NO_ENCONTRADO`; relevo de E1 con la alerta E2 404 `RELEVO_NO_ENCONTRADO` |
| 7 | B | Aceptar el relevo | 200; `esMia: true`; `version = V + 1`; sin `relevoPendiente` | **PASS.** 200; `esMia:true`, responsable B, `version` 1 → 2, sin `relevoPendiente`. Base: `incidentes` responsable B, versión 2, `asumido_en` nuevo; 1 fila en `transferencias_coordinacion` (anterior A, nuevo B, versiones 1→2, motivo, `ocurrido_en`); relevo `aceptado` con `resuelto_en` y `operacion_aceptacion_id` |
| 8 | B | Repetir el mismo `operacionId` de aceptar | 200 con el mismo resultado | **PASS.** 200 con el mismo cuerpo; sigue 1 transferencia y la versión en 2 |
| 9 | B | Aceptar de nuevo con otro `operacionId` | 409 `RELEVO_YA_RESUELTO` | **PASS.** 409 `RELEVO_YA_RESUELTO`; sin efectos nuevos |
| 10 | A | Proponer de nuevo (ya no es responsable) | 403 `NO_ES_RESPONSABLE` | **PASS.** 403 `NO_ES_RESPONSABLE` (A ya no es responsable) |
| 11 | B | Proponer a C con `versionIncidente` vieja | 409 `VERSION_DESACTUALIZADA` con `versionActual` | **PASS.** 409 `VERSION_DESACTUALIZADA` con `versionActual: 2` |
| 12 | B | Proponer a sí mismo | 400 `DESTINATARIO_INVALIDO` | **PASS.** 400 `DESTINATARIO_INVALIDO` |
| 13 | B | Proponer al rescatista sin perfil | 400 `DESTINATARIO_NO_VALIDADO` | **PASS.** 400 `DESTINATARIO_NO_VALIDADO` |
| 14 | Sin perfil | Proponer o aceptar | 403 `NO_ES_RESCATISTA` | **PASS.** 403 `NO_ES_RESCATISTA` al proponer y al aceptar |
| 15 | Senderista | Cualquiera de las dos rutas y `GET /rescate/rescatistas` | 403 `PROHIBIDO` | **PASS.** 403 `PROHIBIDO` en proponer, aceptar y `GET /rescate/rescatistas` |
| 16 | Sin token | Cualquiera de las rutas | 401 (única respuesta 401) | **PASS.** 401 en las tres rutas; ningún error de negocio respondió 401 |
| 17 | B | Proponer con cuerpo inválido (`{}`, motivo vacío, motivo de 281 caracteres, `operacionId` no UUID) | 400 de validación | **PASS.** 400 en 6 cuerpos: `{}`, `operacionId` no UUID, motivo vacío, motivo de 281 caracteres, `destinatarioId` no UUID y `versionIncidente` no entera |
| 18 | B | Con el caso cerrado desde el SQL Editor (`estado = 'cerrado'`): proponer | 409 `INCIDENTE_CERRADO` | **PASS.** Con el incidente de E3 cerrado desde el SQL Editor (tenía un relevo pendiente de A a B): proponer (A) 409 `INCIDENTE_CERRADO`; aceptar (B) 409 `INCIDENTE_CERRADO`. El relevo sigue `pendiente` y no hay transferencia |
| 19 | A y B | Dos propuestas simultáneas de A a B y a C sobre otra alerta | Exactamente un 201 y un 409; un solo relevo pendiente en `relevos_coordinacion` | **PASS.** A→B 201 y A→C 409 `RELEVO_PENDIENTE` con el destinatario del ganador; 1 solo relevo pendiente en la base |
| 20 | A | `GET /rescate/rescatistas` | 200; lista sin A; solo `id` y `nombreCompleto`; sin datos médicos | **PASS.** 200; `[Lucía Fernández Ríos, Marco Antonio Vargas Silva]` (sin A); solo `id` y `nombreCompleto`; sin datos médicos, de contacto ni de credencial. Como B: excluye a B e incluye a A. El rescatista sin perfil no aparece |

Comprobación en la base tras el paso 7: una fila en `transferencias_coordinacion` (anterior A, nuevo B, motivo, `version_nueva = V + 1`, hora del servidor) y `incidentes.asumido_en` actualizado.

## Guion de la API (rechazar, cancelar y caso cerrado): 019 corregida

Todos los resultados están **en blanco a propósito** hasta el Bloque 5. Cada fila se anota con el estado HTTP y el código del cuerpo. `V` es `coordinacion.version` antes del paso. Alertas `HU40-PRUEBA` nuevas en `alerta`, con A responsable; A, B y C son rescatistas validados; "sin perfil" tiene rol rescatista sin perfil; "senderista" tiene rol senderista.

| # | Actor | Acción | Esperado | Resultado |
|---|---|---|---|---|
| RC1 | A | Proponer a B con motivo `Cambio de turno` y `versionIncidente = V` | 201; `relevoPendiente` con B; `version` sigue en `V` | Pendiente (Bloque 5) |
| RC2 | C | Rechazar el relevo de B (tercero) | 403 `NO_ES_DESTINATARIO` | Pendiente (Bloque 5) |
| RC3 | A | Rechazar el relevo (quien propuso no es el destinatario) | 403 `NO_ES_DESTINATARIO` | Pendiente (Bloque 5) |
| RC4 | B | Cancelar el relevo (el destinatario no propuso) | 403 `NO_ES_PROPONENTE` | Pendiente (Bloque 5) |
| RC5 | C | Cancelar el relevo (tercero) | 403 `NO_ES_PROPONENTE` | Pendiente (Bloque 5) |
| RC6 | Sin perfil | Rechazar y cancelar | 403 `NO_ES_RESCATISTA` en ambas | Pendiente (Bloque 5) |
| RC7 | B y A | Rechazar y cancelar con un `relevoId` inexistente, y con el relevo de otra alerta | 404 `RELEVO_NO_ENCONTRADO` en los cuatro | Pendiente (Bloque 5) |
| RC8 | B | Rechazar con `operacionId = o1` | 200; `coordinacion` sin `relevoPendiente`; responsable A (`esMia: false` para B); `version = V`. Base: relevo `rechazado`, `resuelto_por_id` = B, `resuelto_en` con hora del servidor, `operacion_resolucion_id = o1`; `incidentes` sin cambios; 0 transferencias | Pendiente (Bloque 5) |
| RC9 | B | Repetir el mismo `operacionId o1` | 200 con el mismo resultado; `resuelto_en` no cambia; 1 sola fila resuelta con esa operación | Pendiente (Bloque 5) |
| RC10 | B | Rechazar con otro `operacionId` | 409 `RELEVO_YA_RESUELTO` con `estadoRelevo: rechazado` | Pendiente (Bloque 5) |
| RC11 | B | Aceptar el relevo ya rechazado | 409 `RELEVO_YA_RESUELTO` con `estadoRelevo: rechazado`; sin transferencia | Pendiente (Bloque 5) |
| RC12 | A | Proponer a C (la posibilidad quedó liberada) | 201; relevo nuevo `pendiente`; el rechazado se conserva como historial | Pendiente (Bloque 5) |
| RC13 | A | Cancelar con `operacionId = o2` | 200; sin `relevoPendiente`; responsable A; `version = V`. Base: relevo `cancelado`, `resuelto_por_id` = A, `resuelto_en`, `operacion_resolucion_id = o2` | Pendiente (Bloque 5) |
| RC14 | A | Repetir `o2`, y cancelar con otra operación | 200 con el mismo resultado; 409 `RELEVO_YA_RESUELTO` con `estadoRelevo: cancelado` | Pendiente (Bloque 5) |
| RC15 | C | Aceptar el relevo cancelado | 409 `RELEVO_YA_RESUELTO` con `estadoRelevo: cancelado`; sin transferencia | Pendiente (Bloque 5) |
| RC16 | A y B | A propone a B de nuevo; B acepta; A intenta cancelar ese relevo | 200 al aceptar (`version = V + 1`, 1 transferencia); 409 `RELEVO_YA_RESUELTO` con `estadoRelevo: aceptado` al cancelar | Pendiente (Bloque 5) |
| RC17 | A, B y C | `GET /rescate/expediciones`, `/alertas` y `/alertas/:id` tras RC8 y RC13 | Sin `relevoPendiente` en las tres lecturas (los resueltos no se muestran) | Pendiente (Bloque 5) |
| RC18 | A y B | En otra alerta, A propone a B; **A y B resuelven a la vez** (B acepta, A cancela, simultáneos) | Exactamente un 200 y un 409 `RELEVO_YA_RESUELTO`; si gana aceptar, 1 transferencia y `version = V + 1`; si gana cancelar, 0 transferencias y `version = V` | Pendiente (Bloque 5) |
| RC19 | A y B | Con un relevo pendiente A→B, cerrar el caso desde el SQL Editor (como lo haría HU-42). B rechaza, A cancela y B acepta | 409 `INCIDENTE_CERRADO` en las tres; el relevo sigue `pendiente` (`resuelto_*` nulos); 0 transferencias; responsable y versión sin cambio | Pendiente (Bloque 5) |
| RC20 | A y B | Tras RC19, leer la alerta cerrada | Sin `relevoPendiente`; el relevo queda inerte | Pendiente (Bloque 5) |
| RC21 | Senderista y sin token | Rechazar y cancelar | 403 `PROHIBIDO` y 401 (única respuesta 401) | Pendiente (Bloque 5) |
| RC22 | B y A | Rechazar y cancelar con cuerpo inválido (`{}`, `operacionId` no UUID) y con `relevoId` o alerta que no son UUID | 400 de validación en todos | Pendiente (Bloque 5) |
| RC23 | B | Rechazar con un `motivo` en el cuerpo | 200; el motivo se ignora y no se guarda | Pendiente (Bloque 5) |

## Verificaciones de Supabase real (rechazar, cancelar y caso cerrado)

| # | Verificación | Esperado | Resultado |
|---|---|---|---|
| V7 | Llamada cruda a `treksafe_rechazar_relevo` por PostgREST sobre un relevo ya resuelto | HTTP 400, `code` `P0001`, `message = RELEVO_YA_RESUELTO`, `details = {"estado": "…"}` | Pendiente (Bloque 5) |
| V8 | Llamada cruda a `treksafe_cancelar_relevo` hecha por quien no propuso | `message = NO_ES_PROPONENTE` | Pendiente (Bloque 5) |
| V9 | `service_role` intenta `PATCH` del `motivo` de `relevos_coordinacion` y `DELETE` de relevos | Rechazados (403 `42501`); el `motivo` no cambió | Pendiente (Bloque 5) |
| V10 | `service_role` actualiza `estado`, `resuelto_en`, `resuelto_por_id` u `operacion_resolucion_id` de un relevo (fuera de las RPC) | Permitido solo para esas cuatro columnas (se verifica con una lectura y se revierte; no se usa para probar el negocio) | Pendiente (Bloque 5) |
| V11 | Historial: `select estado, resuelto_por_id, resuelto_en from relevos_coordinacion` de una alerta con rechazo, cancelación y aceptación | Una fila por relevo, con quién y cuándo; ninguna borrada | Pendiente (Bloque 5) |
| V12 | Embed de `incidentes` con `relevos_coordinacion ( … )` | El pendiente aparece solo si existe; los resueltos no se muestran como pendientes | Pendiente (Bloque 5) |


## Verificaciones de Supabase real (proponer y aceptar): resultados contra la 019 anterior

| # | Verificación | Esperado | Resultado |
|---|---|---|---|
| V1 | Llamada cruda a `treksafe_proponer_relevo` por PostgREST cuando ya hay un relevo pendiente | HTTP 400, `code` `P0001`, `message = RELEVO_PENDIENTE`, `details` con el JSON del relevo vigente | **PASS.** HTTP 400, `code` `P0001`, `message` `RELEVO_PENDIENTE`, `details` `{"relevoId", "solicitadoEn", "destinatarioId", "nombreDestinatario"}` del relevo vigente |
| V2 | Llamada cruda con versión vieja | `message = VERSION_DESACTUALIZADA`, `details = {"versionActual": n}` | **PASS.** HTTP 400, `P0001`, `message` `VERSION_DESACTUALIZADA`, `details` `{"versionActual": 2}` |
| V3 | Embed de `incidentes` con `perfiles_rescatista ( nombre_completo )` y `relevos_coordinacion ( …, perfiles_rescatista!fk_relevos_destinatario ( nombre_completo ) )` | HTTP 200; nombre del responsable y del destinatario resueltos; coinciden con la API | **PASS.** HTTP 200; `perfiles_rescatista` del responsable y `perfiles_rescatista!fk_relevos_destinatario` del destinatario devuelven `Lucía Fernández Ríos`. Contraste: sin la pista, HTTP 300 `PGRST201` (ambiguo entre `fk_relevos_anterior` y `fk_relevos_destinatario`) |
| V4 | `select usuario_id, nombre_completo from perfiles_rescatista where usuario_id <> A` | HTTP 200; mismas personas que `GET /rescate/rescatistas` | **PASS.** HTTP 200; solo `usuario_id` y `nombre_completo`; mismas personas que `GET /rescate/rescatistas` |
| V5 | `service_role` intenta `PATCH` de `estado` en `incidentes` | Rechazado (permiso por columna) | **PASS.** HTTP 403 `42501` "permission denied for table incidentes" al cambiar `estado` y también `cerrado_en` |
| V6 | `service_role` intenta `UPDATE` o `DELETE` sobre `transferencias_coordinacion` | Rechazado con `TRANSFERENCIA_INMUTABLE` o por permisos | **PASS.** `UPDATE` y `DELETE` de `transferencias_coordinacion`: HTTP 403 `42501` (los rechazan los permisos, antes de llegar al trigger `TRANSFERENCIA_INMUTABLE`). `UPDATE` del `motivo` y `DELETE` de `relevos_coordinacion`: 403; el motivo no cambió |

## Datos creados en el proyecto personal (para borrarlos después)

Esta lista es de la ejecución anterior. Tras el reinicio de la 019 desaparecen los relevos y la transferencia; las expediciones e incidentes se conservan. Los datos de la ejecución nueva: Pendiente (Bloque 5).

- **Usuario nuevo:** C = `Marco Antonio Vargas Silva` (`hu40-marco@example.invalid`), registrado por `POST /api/auth/registrar-rescatista` con la credencial `MIN-RS-2019-00441` del padrón sembrado. A (Carlos Mendoza Quispe), B (Lucía Fernández Ríos), el rescatista sin perfil y el senderista ya existían de HU-39 y se reutilizaron.
- **Expediciones** `HU40-PRUEBA` en `alerta`: `40404040-0000-4000-8000-000000000001` (E1, flujo principal), `…0002` (E2, propuestas simultáneas) y `…0003` (E3, caso cerrado).
- **Incidentes** (uno por expedición, creados al asumir A). E1 quedó con B como responsable y versión 2; E2 con A y un relevo pendiente a B; E3 cerrado (desde el SQL Editor) con un relevo pendiente.
- **Relevos:** 3 (uno `aceptado` en E1 y dos `pendiente`, en E2 y E3). **Transferencias:** 1 (E1).
- La prueba no envió correos ni avisos (cron desactivado, sin SMTP/Brevo).

## Notas de la ejecución

- **Primer intento de migrar.** La 018 y la 019 se habían ejecutado primero en otro proyecto: una lectura de `wwan…` mostró el registro sin 018 ni 019 y las dos tablas nuevas ausentes en PostgREST (`PGRST205`, `PGRST202`). Se aplicaron después en `wwan…` y se verificaron (filas 018 y 019 en `treksafe_migraciones`, tablas con HTTP 200). El 019 no es re-ejecutable: debe aplicarse una sola vez por entorno y confirmar el proyecto antes de ejecutar el SQL Editor.
- **201 al proponer.** Proponer responde 201 cuando crea el relevo y 200 solo al repetir el mismo `operacionId`, como dice el diseño.
- **Cierre desde el SQL Editor.** `service_role` no puede cambiar `estado` ni `cerrado_en` (V5), así que el cierre de E3 se hizo con un `UPDATE` desde el SQL Editor, como lo haría HU-42.
- **Rechazos por permisos.** Los `UPDATE` y `DELETE` sobre `transferencias_coordinacion` se rechazan por permisos (403 `42501`); el trigger `TRANSFERENCIA_INMUTABLE` queda cubierto por la suite SQL, no por esta prueba.
- Nada de lo observado difiere del diseño ni exigió cambiar el código.

## Navegador (lo ejecuta quien prueba la interfaz)

| # | Pantalla | Esperado | Resultado |
|---|---|---|---|
| N1 | Responsable ve "Transferir coordinación" en monitor, lista de alertas y detalle | Botón visible solo para quien tiene `esMia` y no hay relevo pendiente | No ejecutado: lo hace quien prueba la interfaz |
| N2 | Formulario | Lista de rescatistas sin el propio; aviso "No incluyas datos médicos"; motivo con tope de 280 y contador | No ejecutado: lo hace quien prueba la interfaz |
| N3 | Confirmar | Aparece "Relevo pendiente a <nombre> desde HH:MM. Sigues coordinando tú" | No ejecutado: lo hace quien prueba la interfaz |
| N4 | Destinatario | Ve "<responsable> te propone relevarlo: <motivo>" y el botón "Aceptar relevo" | No ejecutado: lo hace quien prueba la interfaz |
| N5 | Aceptar | La pantalla se relee y muestra "Tú coordinas esta alerta" | No ejecutado: lo hace quien prueba la interfaz |
| N6 | Tercer rescatista | Ve "Relevo pendiente a <nombre>", sin motivo ni botones | No ejecutado: lo hace quien prueba la interfaz |
| N7 | Versión desactualizada o relevo ya resuelto | Se muestra el mensaje y la pantalla se relee | No ejecutado: lo hace quien prueba la interfaz |
| N8 | Destinatario | Ve "Aceptar relevo" y "Rechazar" | No ejecutado: lo hace quien prueba la interfaz |
| N9 | Destinatario pulsa "Rechazar" | Pide confirmación ("¿Rechazar el relevo? Seguirá coordinando quien lo propuso."); "No, volver" no envía nada; "Sí, rechazar" avisa "Rechazaste el relevo…" y relee la pantalla sin relevo pendiente | No ejecutado: lo hace quien prueba la interfaz |
| N10 | Quien propuso | Ve "Cancelar relevo" mientras el relevo esté pendiente | No ejecutado: lo hace quien prueba la interfaz |
| N11 | Quien propuso pulsa "Cancelar relevo" | Pide confirmación; "Sí, cancelar relevo" avisa "Cancelaste el relevo. Sigues coordinando tú y puedes proponer otro." y vuelve a mostrar "Transferir coordinación" | No ejecutado: lo hace quien prueba la interfaz |
| N12 | Relevo ya resuelto por la otra parte | El mensaje dice "El relevo ya fue aceptado / rechazado / cancelado." y la pantalla se relee | No ejecutado: lo hace quien prueba la interfaz |
| N13 | Caso cerrado con un relevo pendiente | Al rechazar o cancelar: "El caso está cerrado y no admite relevos"; la pantalla se relee y no muestra relevo pendiente | No ejecutado: lo hace quien prueba la interfaz |

## Notas

- **Prueba de HU-39 modificada.** La prueba de `BloqueCoordinacion` de HU-39 "esMia muestra «Tú coordinas esta alerta» sin comparar nombres" exigía que el responsable no tuviera ningún botón y que el texto fuera exacto. Con HU-40 el responsable ve el botón "Transferir coordinación", así que esa prueba se ajustó: ahora exige que el texto empiece igual y que el único botón sea "Transferir coordinación" (nunca "Asumir coordinación"). Es el único cambio a una prueba de HU-39; las demás se ejecutan sin tocarlas.
- `fichaMedica` sigue en el detalle de la alerta hasta HU-50; `coordinacion` y `relevoPendiente` no llevan campos médicos.
- **Limpieza (pendiente).** `transferencias_coordinacion` es de solo anexar y no se borra fila a fila: solo desaparece por la cascada al borrar la expedición de prueba. Los incidentes y relevos también caen por esa cascada. Requiere confirmación antes de ejecutarse.
- Rechazar, cancelar y el cierre del caso con un relevo pendiente **sí** están dentro del alcance (aprobado por el PO): se prueban en las secciones RC y V7–V12 de arriba. No hay avisos al destinatario (decidido: sin notificación adicional) ni pantalla ni endpoint de historial.

### Pruebas existentes que se modificaron con la ampliación (rechazar y cancelar)

Para que quien revise no las confunda con una regresión:

**Frontend, `frontend/src/components/rescate/BloqueRelevo.test.tsx` (tres pruebas existentes, por los botones nuevos).** Las dos primeras comprobaban que no había botones; la tercera, que el único botón era "Aceptar relevo":

1. "confirma con destinatario, motivo y la versión de la coordinación; muestra el relevo pendiente y actualiza": tras proponer, quien propuso ahora ve el botón "Cancelar relevo" (antes, ninguno).
2. "con relevo pendiente propio no ofrece transferir de nuevo" (ahora "…, sino cancelar"): la lista de botones pasó de vacía a `['Cancelar relevo']`.
3. "el destinatario ve quién propone y el motivo, con «Aceptar relevo»" (ahora "…con «Aceptar relevo» y «Rechazar»"): los botones pasaron de `['Aceptar relevo']` a `['Aceptar relevo', 'Rechazar']`.

El resto de las pruebas existentes de HU-40 y de HU-39 en el frontend no cambió.

**Backend, solo por el contrato ampliado** (no cambian reglas ya probadas): en `Relevo.test.ts`, `rutasRelevo.test.ts` y `IncidenteDAOMemoria.relevos.test.ts`, la expectativa de `RELEVO_YA_RESUELTO` ahora incluye `estadoRelevo`; en `IncidenteDAOSupabase.relevos.test.ts`, los fixtures llevan `resueltoPorId`, el estado inventado pasó de `cancelado` (ya válido) a `invalidado`, y `RELEVO_YA_RESUELTO` salió de la lista de códigos sin detalle (ahora exige el `DETAIL`); en `Relevo.test.ts`, el doble del DAO y la tabla de estados HTTP incluyen las operaciones y el código `NO_ES_PROPONENTE` nuevos. Ninguna prueba se borró ni se debilitó.

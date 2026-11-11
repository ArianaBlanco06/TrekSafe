# HU-40 · Prueba manual contra Supabase real (proyecto personal)

**Estado: ejecutada la parte de API y de Supabase real (preparación, 20 escenarios y V1–V6); pendiente la parte del navegador (N1–N7).** Los resultados de las columnas son los obtenidos en la ejecución del 2026-11-10/11 (hora UTC de las migraciones: 2026-11-11 00:11–00:16); no se resumieron de memoria.

Plantilla y criterios tomados de [HU-39](../../hu-39/evidencias/prueba-manual.md).

- Fecha de ejecución: 2026-11-11 00:11–00:20 UTC (tarde del 2026-11-10, hora local)
- Ejecuta: el autor de la rama, con el guion de este documento (scripts locales fuera del repositorio, como en HU-39)
- Destino: proyecto personal `wwan….supabase.co`. **Nunca el DEV del equipo** (el ref `ibnw…` está en la lista de bloqueo). Se verifica el destino antes de escribir.
- Backend local con `CRON_ENABLED=false`, sin SMTP/Brevo y sin `DATABASE_URL`. Claves y tokens enmascarados (`Bearer ***`, `***`); el ref, con 4 caracteres.

## Evidencia automática previa (PostgreSQL desechable en Docker, no es Supabase)

Obtenida el 2026-11-10 con `node backend/scripts/test-hu40-postgres.mjs` (`postgres:18`, `127.0.0.1:55432`, base `treksafe_desechable`; `init_schema.sql`, migraciones 000–016, 017, 018 y 019):

- Regresión SQL de HU-39 con la 019 aplicada: 12 de 12.
- Suite SQL de HU-40: 16 de 16.
- Concurrencia con sesiones reales: 12 de 12.
- Resumen del script: 40 casos, 40 pasan, 0 fallan.

Esto no sustituye la prueba manual: no pasa por PostgREST ni por el esquema de Supabase.

## Qué debe confirmar esta prueba (y no se puede ver en la base desechable)

1. **Errores de la RPC por PostgREST:** el código del `RAISE EXCEPTION` llega en `error.message` y el JSON en `error.details` (`RELEVO_PENDIENTE` con el relevo vigente; `VERSION_DESACTUALIZADA` con `{"versionActual": n}`).
2. **Embeds con `service_role`:** `perfiles_rescatista ( nombre_completo )` del responsable y `perfiles_rescatista!fk_relevos_destinatario ( nombre_completo )` del destinatario, con el esquema recargado. `relevos_coordinacion` tiene dos claves foráneas a `perfiles_rescatista`: sin la pista, el embebido sería ambiguo.
3. **`GET /api/rescate/rescatistas`:** la consulta `perfiles_rescatista` con `service_role` devuelve solo `{id, nombreCompleto}` y excluye al actor.
4. **Permisos por columna:** `service_role` actualiza `responsable_id`, `version` y `asumido_en` de `incidentes` (la RPC de aceptar funciona), pero no `estado` ni `cerrado_en`.

## Preparación

| # | Paso | Resultado |
|---|---|---|
| P1 | Verificar el destino: URL, `--ref-personal` y lista de bloqueo (como `verificar-destino.mjs` de HU-39). Si falla, no se arranca nada | OK. `verificar-destino.mjs` con `--ref-personal` de `wwan…`: destino personal, fuera de la lista de bloqueo (`ibnw…`). Clave `sb_secret_` (el ref no es verificable en la clave; se valida URL, ref y lista de bloqueo) |
| P2 | Comprobar en `treksafe_migraciones` que están la 017 y la 019; si falta la 019, aplicarla **una sola vez** con el SQL Editor | `treksafe_migraciones` en `wwan…`: 017 (2026-11-10 16:03 UTC), 018 (2026-11-11 00:11:25 UTC) y 019 (2026-11-11 00:12:02 UTC). Ver la nota sobre el primer intento |
| P3 | Recargar el esquema de PostgREST (`NOTIFY pgrst, 'reload schema';`) | `NOTIFY pgrst, 'reload schema'` ejecutado desde el SQL Editor; `relevos_coordinacion` y `transferencias_coordinacion` pasaron a responder HTTP 200 |
| P4 | Arrancar el backend local contra el proyecto personal con `CRON_ENABLED=false` | OK. Backend desde una copia limpia del commit `9f30027` (solo archivos versionados, sin `.env`), con `CRON_ENABLED=false`, sin SMTP/Brevo y sin `DATABASE_URL`. Arranque: "Supabase wwan….supabase.co · cron desactivado · sin SMTP/Brevo"; `/api/salud` 200 |
| P5 | Datos con marca `HU40-PRUEBA`: A (responsable, ya con perfil), B y C (rescatistas validados), un rescatista sin perfil, un senderista, y expediciones en `alerta` (una por escenario). A asume cada alerta con la API de HU-39 | OK. Ver "Datos creados" |

## Guion de la API

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

## Verificaciones de Supabase real

| # | Verificación | Esperado | Resultado |
|---|---|---|---|
| V1 | Llamada cruda a `treksafe_proponer_relevo` por PostgREST cuando ya hay un relevo pendiente | HTTP 400, `code` `P0001`, `message = RELEVO_PENDIENTE`, `details` con el JSON del relevo vigente | **PASS.** HTTP 400, `code` `P0001`, `message` `RELEVO_PENDIENTE`, `details` `{"relevoId", "solicitadoEn", "destinatarioId", "nombreDestinatario"}` del relevo vigente |
| V2 | Llamada cruda con versión vieja | `message = VERSION_DESACTUALIZADA`, `details = {"versionActual": n}` | **PASS.** HTTP 400, `P0001`, `message` `VERSION_DESACTUALIZADA`, `details` `{"versionActual": 2}` |
| V3 | Embed de `incidentes` con `perfiles_rescatista ( nombre_completo )` y `relevos_coordinacion ( …, perfiles_rescatista!fk_relevos_destinatario ( nombre_completo ) )` | HTTP 200; nombre del responsable y del destinatario resueltos; coinciden con la API | **PASS.** HTTP 200; `perfiles_rescatista` del responsable y `perfiles_rescatista!fk_relevos_destinatario` del destinatario devuelven `Lucía Fernández Ríos`. Contraste: sin la pista, HTTP 300 `PGRST201` (ambiguo entre `fk_relevos_anterior` y `fk_relevos_destinatario`) |
| V4 | `select usuario_id, nombre_completo from perfiles_rescatista where usuario_id <> A` | HTTP 200; mismas personas que `GET /rescate/rescatistas` | **PASS.** HTTP 200; solo `usuario_id` y `nombre_completo`; mismas personas que `GET /rescate/rescatistas` |
| V5 | `service_role` intenta `PATCH` de `estado` en `incidentes` | Rechazado (permiso por columna) | **PASS.** HTTP 403 `42501` "permission denied for table incidentes" al cambiar `estado` y también `cerrado_en` |
| V6 | `service_role` intenta `UPDATE` o `DELETE` sobre `transferencias_coordinacion` | Rechazado con `TRANSFERENCIA_INMUTABLE` o por permisos | **PASS.** `UPDATE` y `DELETE` de `transferencias_coordinacion`: HTTP 403 `42501` (los rechazan los permisos, antes de llegar al trigger `TRANSFERENCIA_INMUTABLE`). `UPDATE` del `motivo` y `DELETE` de `relevos_coordinacion`: 403; el motivo no cambió |

## Datos creados en el proyecto personal (para borrarlos después)

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

## Notas

- **Prueba de HU-39 modificada.** La prueba de `BloqueCoordinacion` de HU-39 "esMia muestra «Tú coordinas esta alerta» sin comparar nombres" exigía que el responsable no tuviera ningún botón y que el texto fuera exacto. Con HU-40 el responsable ve el botón "Transferir coordinación", así que esa prueba se ajustó: ahora exige que el texto empiece igual y que el único botón sea "Transferir coordinación" (nunca "Asumir coordinación"). Es el único cambio a una prueba de HU-39; las demás se ejecutan sin tocarlas.
- `fichaMedica` sigue en el detalle de la alerta hasta HU-50; `coordinacion` y `relevoPendiente` no llevan campos médicos.
- **Limpieza (pendiente).** `transferencias_coordinacion` es de solo anexar y no se borra fila a fila: solo desaparece por la cascada al borrar la expedición de prueba. Los incidentes y relevos también caen por esa cascada. Requiere confirmación antes de ejecutarse.
- No se prueban rechazar o cancelar un relevo, el cierre del caso con un relevo pendiente ni avisos al destinatario: esas reglas esperan al PO (sección 11 del [diseño](../diseno.md)).

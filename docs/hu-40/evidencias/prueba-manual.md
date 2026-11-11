# HU-40 · Prueba manual contra Supabase real (proyecto personal)

**Estado: pendiente de ejecutar.** Este documento fija los pasos y lo que se debe comprobar; las columnas de resultado están vacías a propósito y se completan al ejecutar la prueba. Nada de lo que sigue es un resultado ya obtenido, salvo la sección "Evidencia automática previa".

Plantilla y criterios tomados de [HU-39](../../hu-39/evidencias/prueba-manual.md).

- Fecha de ejecución: _pendiente_
- Ejecuta: _pendiente_
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
| P1 | Verificar el destino: URL, `--ref-personal` y lista de bloqueo (como `verificar-destino.mjs` de HU-39). Si falla, no se arranca nada | |
| P2 | Comprobar en `treksafe_migraciones` que están la 017 y la 019; si falta la 019, aplicarla **una sola vez** con el SQL Editor | |
| P3 | Recargar el esquema de PostgREST (`NOTIFY pgrst, 'reload schema';`) | |
| P4 | Arrancar el backend local contra el proyecto personal con `CRON_ENABLED=false` | |
| P5 | Datos con marca `HU40-PRUEBA`: A (responsable, ya con perfil), B y C (rescatistas validados), un rescatista sin perfil, un senderista, y expediciones en `alerta` (una por escenario). A asume cada alerta con la API de HU-39 | |

## Guion de la API

Cada fila se anota con el estado HTTP y el código del cuerpo. `V` es `coordinacion.version` antes del paso.

| # | Actor | Acción | Esperado | Resultado |
|---|---|---|---|---|
| 1 | A | Proponer a B con motivo `Cambio de turno` y `versionIncidente = V` | 201; `relevoPendiente` con B y `esParaMi: false`; `version` sigue en `V`; A sigue con `esMia: true` | |
| 2 | A | Repetir el mismo `operacionId` | 200; mismo `relevoId`; sin segundo relevo | |
| 3 | A | Proponer a C con otro `operacionId` | 409 `RELEVO_PENDIENTE` con el relevo vigente y sin `motivo` | |
| 4 | B | Proponer a C (B no es responsable) | 403 `NO_ES_RESPONSABLE` | |
| 5 | A, B, C | Lecturas `GET /rescate/expediciones`, `/alertas` y `/alertas/:id` | `relevoPendiente` presente en las tres; `motivo` solo para A y B; C no lo ve | |
| 6 | C | Aceptar el relevo de B | 403 `NO_ES_DESTINATARIO` | |
| 7 | B | Aceptar el relevo | 200; `esMia: true`; `version = V + 1`; sin `relevoPendiente` | |
| 8 | B | Repetir el mismo `operacionId` de aceptar | 200 con el mismo resultado | |
| 9 | B | Aceptar de nuevo con otro `operacionId` | 409 `RELEVO_YA_RESUELTO` | |
| 10 | A | Proponer de nuevo (ya no es responsable) | 403 `NO_ES_RESPONSABLE` | |
| 11 | B | Proponer a C con `versionIncidente` vieja | 409 `VERSION_DESACTUALIZADA` con `versionActual` | |
| 12 | B | Proponer a sí mismo | 400 `DESTINATARIO_INVALIDO` | |
| 13 | B | Proponer al rescatista sin perfil | 400 `DESTINATARIO_NO_VALIDADO` | |
| 14 | Sin perfil | Proponer o aceptar | 403 `NO_ES_RESCATISTA` | |
| 15 | Senderista | Cualquiera de las dos rutas y `GET /rescate/rescatistas` | 403 `PROHIBIDO` | |
| 16 | Sin token | Cualquiera de las rutas | 401 (única respuesta 401) | |
| 17 | B | Proponer con cuerpo inválido (`{}`, motivo vacío, motivo de 281 caracteres, `operacionId` no UUID) | 400 de validación | |
| 18 | B | Con el caso cerrado desde el SQL Editor (`estado = 'cerrado'`): proponer | 409 `INCIDENTE_CERRADO` | |
| 19 | A y B | Dos propuestas simultáneas de A a B y a C sobre otra alerta | Exactamente un 201 y un 409; un solo relevo pendiente en `relevos_coordinacion` | |
| 20 | A | `GET /rescate/rescatistas` | 200; lista sin A; solo `id` y `nombreCompleto`; sin datos médicos | |

Comprobación en la base tras el paso 7: una fila en `transferencias_coordinacion` (anterior A, nuevo B, motivo, `version_nueva = V + 1`, hora del servidor) y `incidentes.asumido_en` actualizado.

## Verificaciones de Supabase real

| # | Verificación | Esperado | Resultado |
|---|---|---|---|
| V1 | Llamada cruda a `treksafe_proponer_relevo` por PostgREST cuando ya hay un relevo pendiente | HTTP 400, `code` `P0001`, `message = RELEVO_PENDIENTE`, `details` con el JSON del relevo vigente | |
| V2 | Llamada cruda con versión vieja | `message = VERSION_DESACTUALIZADA`, `details = {"versionActual": n}` | |
| V3 | Embed de `incidentes` con `perfiles_rescatista ( nombre_completo )` y `relevos_coordinacion ( …, perfiles_rescatista!fk_relevos_destinatario ( nombre_completo ) )` | HTTP 200; nombre del responsable y del destinatario resueltos; coinciden con la API | |
| V4 | `select usuario_id, nombre_completo from perfiles_rescatista where usuario_id <> A` | HTTP 200; mismas personas que `GET /rescate/rescatistas` | |
| V5 | `service_role` intenta `PATCH` de `estado` en `incidentes` | Rechazado (permiso por columna) | |
| V6 | `service_role` intenta `UPDATE` o `DELETE` sobre `transferencias_coordinacion` | Rechazado con `TRANSFERENCIA_INMUTABLE` o por permisos | |

## Navegador (lo ejecuta quien prueba la interfaz)

| # | Pantalla | Esperado | Resultado |
|---|---|---|---|
| N1 | Responsable ve "Transferir coordinación" en monitor, lista de alertas y detalle | Botón visible solo para quien tiene `esMia` y no hay relevo pendiente | |
| N2 | Formulario | Lista de rescatistas sin el propio; aviso "No incluyas datos médicos"; motivo con tope de 280 y contador | |
| N3 | Confirmar | Aparece "Relevo pendiente a <nombre> desde HH:MM. Sigues coordinando tú" | |
| N4 | Destinatario | Ve "<responsable> te propone relevarlo: <motivo>" y el botón "Aceptar relevo" | |
| N5 | Aceptar | La pantalla se relee y muestra "Tú coordinas esta alerta" | |
| N6 | Tercer rescatista | Ve "Relevo pendiente a <nombre>", sin motivo ni botones | |
| N7 | Versión desactualizada o relevo ya resuelto | Se muestra el mensaje y la pantalla se relee | |

## Notas

- **Prueba de HU-39 modificada.** La prueba de `BloqueCoordinacion` de HU-39 "esMia muestra «Tú coordinas esta alerta» sin comparar nombres" exigía que el responsable no tuviera ningún botón y que el texto fuera exacto. Con HU-40 el responsable ve el botón "Transferir coordinación", así que esa prueba se ajustó: ahora exige que el texto empiece igual y que el único botón sea "Transferir coordinación" (nunca "Asumir coordinación"). Es el único cambio a una prueba de HU-39; las demás se ejecutan sin tocarlas.
- `fichaMedica` sigue en el detalle de la alerta hasta HU-50; `coordinacion` y `relevoPendiente` no llevan campos médicos.
- **Limpieza.** `transferencias_coordinacion` es de solo anexar y no se borra fila a fila: solo desaparece por la cascada al borrar la expedición de prueba. Los incidentes y relevos también caen por esa cascada. Requiere confirmación antes de ejecutarse.
- No se prueban rechazar o cancelar un relevo, el cierre del caso con un relevo pendiente ni avisos al destinatario: esas reglas esperan al PO (sección 11 del [diseño](../diseno.md)).

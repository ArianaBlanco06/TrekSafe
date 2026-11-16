# HU-42 · Prueba manual del cierre del incidente

Estado: **pendiente**. Se ejecuta en DEV **después** de que Ariana aplique la migración 025 (no se aplicó en ningún entorno remoto durante el desarrollo). Hasta entonces la única evidencia es la local: `resultado-postgres.md` y `resultado-suites.md`.

## Antes de empezar (Ariana, solo lectura)

1. Confirmar que `025` sigue libre (020 = HU-49, 021 = HU-40) y aplicarla una sola vez, **después de la 021** si existe. Anotarlo en `REGISTRO_APLICACION.md`.
2. Consulta de solo lectura: `SELECT has_column_privilege('service_role','public.incidentes','estado','UPDATE'), has_column_privilege('service_role','public.incidentes','cerrado_en','UPDATE'), has_column_privilege('service_role','public.incidentes','version','UPDATE');`. Las tres deben ser verdaderas tras la 025.
3. Recargar el esquema de PostgREST para que se expongan `treksafe_cerrar_incidente`, `treksafe_marcar_incidente_localizado` y `treksafe_leer_ultimo_cierre_incidente`.

## Cuentas y datos

- Dos cuentas de rescatista validadas: A y B. Una cuenta de senderista con una expedición de prueba en estado `alerta`.
- Un cliente HTTP o la aplicación contra DEV. No pegar tokens en la evidencia (`Bearer ***`). Sin datos médicos reales en las notas ni en el resumen.

## Pasos

| # | Paso | Resultado esperado | Captura |
|---|---|---|---|
| 1 | A abre el detalle de la alerta y pulsa "Asumir coordinación" (HU-39) | "Tú coordinas esta alerta"; aparecen la "Bitácora del incidente" y el bloque "Cierre del incidente" con "Marcar persona localizada" | |
| 2 | A escribe una nota en la bitácora (HU-41) | La nota aparece con "Tú" y la hora del servidor | |
| 3 | B abre la misma alerta | Ve la bitácora y, en "Cierre del incidente", "Solo A (responsable vigente) puede cerrar el incidente." sin botones | |
| 4 | `POST /api/rescate/incidentes/:id/cierre` de A con el incidente aún `abierto` | 409 `INCIDENTE_NO_LOCALIZADO` | |
| 5 | A pulsa "Marcar persona localizada" y luego "Confirmar localización" | "Persona marcada como localizada"; la bitácora gana una nota "Persona localizada. El incidente pasa a estado localizado."; aparece el formulario de cierre | |
| 6 | `POST …/cierre` de B | 403 `NO_ES_RESPONSABLE` con `responsableVigente` = A | |
| 7 | A lee el aviso de privacidad y la nota "Cerrar el rescate no confirma el retorno del senderista…", deja el resultado sin elegir y pulsa "Cerrar incidente" | "Elige el resultado del rescate" y no se envía nada | |
| 8 | A elige "Evacuado", escribe un resumen y pulsa "Cerrar incidente" y luego "Confirmar cierre" | "Incidente cerrado"; la página muestra "Rescate cerrado (cierre operativo)" con resultado, resumen, "Cerrado por Tú" y "Retorno aún no confirmado por el senderista" | |
| 9 | Bajo la tarjeta, la bitácora | Todas las entradas previas intactas, la entrada "Cierre" al final y "Incidente cerrado: la bitácora es de solo lectura." | |
| 10 | `POST …/bitacora` de A | 409 `INCIDENTE_CERRADO`; el `GET` sigue dando 200 | |
| 11 | Repetir el `POST …/cierre` de A con el mismo `comandoId` y los mismos datos | 200 con el cuerpo idéntico y sin duplicar nada. Con otro `comandoId`: 409 `INCIDENTE_CERRADO`. Con el mismo `comandoId` y otro resumen: 409 `OPERACION_YA_REGISTRADA` | |
| 12 | Consulta de solo lectura de la expedición | `estado` sigue en `alerta`; `version` y `actualizado_en` sin cambio respecto a antes del cierre | |
| 13 | El senderista confirma su retorno desde su aplicación (HU-10) | La expedición pasa a `completada` por su acción; el detalle de la alerta deja de estar disponible para el rescatista (404), pero `GET /api/rescate/alertas/:expedicionId/cierre` devuelve el informe con `retornoConfirmadoPorSenderista: true` | |
| 14 | Cortar la red en el navegador de A y cerrar otro incidente de prueba | Error de conexión; el formulario queda de solo lectura; "Reintentar" al volver la red crea un solo informe; "Descartar" permite editar de nuevo | |
| 15 | Resumen vacío, de 2001 caracteres, resultado fuera del catálogo (por API) o con claves extra (`estadoExpedicion`, `confirmarRetorno`) | 400 `ErrorValidacion` | |
| 16 | Relevo (solo cuando exista HU-40): B asume antes de que A cierre | A recibe 403, ve "Ahora coordina B…" y se oculta su formulario; B cierra | |

El paso 16 depende de HU-40; mientras no exista, la evidencia equivalente es el caso (a) de la suite de concurrencia con Postgres real.

## Pendiente de verificar solo en DEV

- Que el código del `RAISE EXCEPTION` llegue en `error.message` y el JSON del responsable en `error.details` a través de PostgREST (como en HU-41).
- Que `treksafe_leer_ultimo_cierre_incidente` devuelva `null` cuando no hay cierres (PostgREST responde `null` y supabase-js lo entrega como `data: null`).
- Que el orden de aplicación 021 → 025 deje a `service_role` con `UPDATE (estado, cerrado_en, version)` (consulta del paso 2 de "Antes de empezar").

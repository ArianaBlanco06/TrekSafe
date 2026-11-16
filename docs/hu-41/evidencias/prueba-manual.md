# HU-41 · Prueba manual de la bitácora del incidente

Estado: **pendiente**. Se ejecuta en DEV **después** de que Ariana aplique la migración 019 (no se aplicó en ningún entorno remoto durante el desarrollo). Hasta entonces la única evidencia es la local: `resultado-postgres.md` y `resultado-suites.md`.

## Antes de empezar (Ariana, solo lectura)

1. Confirmar que `019` sigue libre y aplicarla una sola vez. Anotarlo en `REGISTRO_APLICACION.md`.
2. Consulta de solo lectura: `SELECT has_table_privilege('service_role','public.incidentes','UPDATE'), has_column_privilege('service_role','public.incidentes','version','UPDATE');`. La segunda debe ser verdadera tras la 019.
3. Recargar el esquema de PostgREST si hace falta para que el embed `perfiles_rescatista(nombre_completo)` de `entradas_bitacora_incidente` funcione.

## Cuentas y datos

- Dos cuentas de rescatista validadas: A y B. Una expedición de prueba en estado `alerta`.
- Un cliente HTTP o la aplicación contra DEV. No pegar tokens en la evidencia (`Bearer ***`).

## Pasos

| # | Paso | Resultado esperado | Captura |
|---|---|---|---|
| 1 | A abre el detalle de la alerta y pulsa "Asumir coordinación" (HU-39) | "Tú coordinas esta alerta" y aparece la sección "Bitácora del incidente" con "Aún no hay entradas." | |
| 2 | A lee el aviso de privacidad y escribe una nota; pulsa "Añadir entrada" | "Entrada añadida"; la nota aparece con "Tú", fecha y hora del servidor | |
| 3 | B abre la misma alerta | Ve "Coordinada por A" y la bitácora con la nota de A, **sin** formulario y con "Solo A (responsable vigente) puede añadir entradas." | |
| 4 | A pulsa "Corregir" en su nota, escribe el texto corregido y envía | Nueva entrada de tipo "Corrección" que cita la original; la original no cambia | |
| 5 | `POST` de B a `/api/rescate/incidentes/:id/bitacora` | 403 `NO_ES_RESPONSABLE` con `responsableVigente` = A | |
| 6 | Repetir el `POST` de A con el mismo `operacionId` y mismo texto | 200 con el mismo cuerpo; la lista no duplica la entrada | |
| 7 | Cortar la red en el navegador de A y enviar una nota | Error de conexión; el cuadro queda de solo lectura; "Reintentar envío" al volver la red guarda una sola entrada; "Descartar" permite editar de nuevo | |
| 8 | Texto de más de 2000 caracteres o vacío | 400 `ErrorValidacion` (y mensaje en pantalla) | |
| 9 | Relevo (solo cuando exista HU-40): B asume; A intenta escribir | A recibe 403, ve el aviso "Ahora coordina B…" y se oculta su formulario; B escribe; las entradas de A conservan su autor | |
| 10 | Cierre (solo cuando exista HU-42) | Las entradas se conservan, el `GET` sigue devolviendo todo y el `POST` da 409 `INCIDENTE_CERRADO` | |

Los pasos 9 y 10 dependen de HU-40 y HU-42; mientras no existan, la evidencia equivalente son los casos (a), (b) y (c) de la suite de concurrencia con Postgres real.

## Pendiente de verificar solo en DEV

- Que el código del `RAISE EXCEPTION` llegue en `error.message` y el JSON del responsable en `error.details` a través de PostgREST.
- Que el orden `registrada_en, secuencia` se respete con `order=registrada_en.asc,secuencia.asc` en PostgREST.

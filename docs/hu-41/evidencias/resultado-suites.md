# HU-41 · Resultado de las suites de backend y frontend

Fecha: 2026-11-10. Base `origin/develop` en 3b61042 más los cambios de HU-41 (sin commit). Windows 11, Node 22.21.0. Los comandos del frontend se ejecutaron desde PowerShell (Git Bash rompe `VITE_API_URL=/api`).

## Backend

| Comando | Resultado |
|---|---|
| `npm run typecheck --prefix backend` | Pasa, sin errores |
| `npm test --prefix backend` | 600 pruebas, 106 suites: **600 pasan, 0 fallan, 0 canceladas, 0 omitidas** |
| `npm run build --prefix backend` | Pasa |

La suite de integración `hu41Postgres.integration.test.ts` se omite sin `HU41_TEST_DATABASE_URL`; sus 15 pruebas se ejecutaron contra PostgreSQL 17.6 desechable (ver `resultado-postgres.md`).

Pruebas nuevas de HU-41 en el backend (47 en los seis archivos unitarios y 13 en el de rutas HTTP):

| Archivo | Cubre |
|---|---|
| `entradaBitacora.test.ts` | `admiteEntradas` y coherencia de tipos, límite y estados con la migración 019 |
| `ComandoAgregarEntradaBitacora.test.ts` | Inmutabilidad, texto recortado, `corrigeEntradaId` nulo, ZodError (cuerpo, UUID, 2001 caracteres, claves extra `tipo`/`autorId`) |
| `AgregarEntradaBitacora.test.ts` | Delegación exacta, estado y código por cada error, ningún 401, extras de `NO_ES_RESPONSABLE` |
| `ConsultarBitacoraIncidente.test.ts` | 404, `puedeEscribir` y `esResponsable`, `esMia`, forma de la vista, ZodError |
| `BitacoraIncidenteDAOSupabase.test.ts` | RPC y parámetros exactos, mapeo, códigos, DETAIL, 500 sin filtrar mensajes, columnas y orden de `listar` |
| `BitacoraIncidenteDAOMemoria.test.ts` + `contratoBitacoraIncidenteDAO.ts` | Contrato LSP de 13 casos (memoria y Postgres) y apoyo para HU-42 |
| `rutasBitacoraIncidente.test.ts` | HTTP con JWT real: 401, 403, 400, 404, CA-01, CA-03, corrección, relevo, cierre, idempotencia, sin datos médicos |

## Frontend

| Comando | Resultado |
|---|---|
| `npm run typecheck --prefix frontend` | Pasa |
| `npm run typecheck:tests --prefix frontend` | Pasa |
| `npm run typecheck:ui --prefix frontend` | Pasa |
| `npm run test:equipo --prefix frontend` | 154 pruebas: **152 pasan, 0 fallan, 2 omitidas** (las 2 omitidas son HU-30 y HU-31 sobre Postgres, anteriores a HU-41) |
| `npm run build --prefix frontend` | Pasa (PWA generada) |
| `npm run test:ui --prefix frontend` | 13 de 13 pasan |
| `npm run test:pwa:privacidad --prefix frontend` | 14 pasan y 5 **fallan** (`HU-26`, `HU-30`, `medicina, contactos…`, `shell, plantillas…`, `dos cuentas…`, `expiracion 401…`): el inicio de sesión simulado no llega a `/senderista` (queda en `/iniciar-sesion`) |

El fallo de `test:pwa:privacidad` **es anterior a HU-41**: se reprodujo en `origin/develop` limpio (con los cambios guardados con `git stash -u`) ejecutando `privacidad.spec.ts:132`, que falla igual. Ninguna de esas pruebas toca la bitácora del incidente. Debe revisarlo quien mantenga esa suite (posible dependencia del entorno local de pruebas).

Pruebas nuevas de HU-41 en el frontend: `lib/bitacoraIncidente.test.ts` (validación, fecha, "Tú", corrección, solo lectura, política de `operacionId`) y `components/rescate/BitacoraIncidente.test.tsx` (13 casos: lista en orden, vacía, solo lectura, cerrado, aviso de privacidad, envío, corrección, error incierto con reintento y descarte, 403, 409, error de carga).

# HU-42 · Resultado de las suites de backend y frontend

Fecha: 2026-11-11. Base `origin/develop` en 8468edf más los commits de HU-42 de la rama `feat/hu-42-cerrar-incidente`. Windows 11, Node 22.21.0. Los comandos del frontend se ejecutaron desde PowerShell (Git Bash rompe `VITE_API_URL=/api`).

## Backend

| Comando | Resultado |
|---|---|
| `npm run typecheck --prefix backend` | Pasa, sin errores |
| `npm test --prefix backend` | 705 pruebas, 119 suites: **705 pasan, 0 fallan, 0 canceladas, 0 omitidas** |
| `npm run build --prefix backend` | Pasa |
| `node --import tsx --test src/presentation/http/routes/rutasCierreIncidente.test.ts` (desde `backend`) | 16 pruebas: **16 pasan, 0 fallan** |

La suite de integración `hu42Postgres.integration.test.ts` se omite sin `HU42_TEST_DATABASE_URL`; sus 20 pruebas se ejecutaron contra PostgreSQL 17.6 desechable (ver `resultado-postgres.md`).

Pruebas nuevas de HU-42 en el backend:

| Archivo | Cubre |
|---|---|
| `cierreIncidente.test.ts` (dominio) | `admiteCierre`/`admiteLocalizar`; coherencia con la 025: catálogo en el `CHECK` y en la RPC, 2000 caracteres, `'localizado'` y el texto fijo; la 025 no contiene `UPDATE`/`ALTER` sobre `expediciones`, ni `REVOKE` sobre `incidentes`, ni una FK hacia la bitácora |
| `cierreIncidente.dto.test.ts` | `tipoCierre: 'operativo'`; `retornoConfirmadoPorSenderista` falso con `alerta` y verdadero solo con `completada`; `esMio`; claves exactas de la vista |
| `ComandoCerrarIncidente.test.ts` | Inmutabilidad, `comandoId` = `operacionId`, resumen recortado, ZodError (cuerpo, UUID, catálogo, vacío, blancos, 2001, claves extra `rescatistaId`/`estadoExpedicion`/`confirmarRetorno`) |
| `ComandoMarcarIncidenteLocalizado.test.ts` | Inmutabilidad y ZodError |
| `CerrarIncidente.test.ts` | Delegación exacta, `tipo` según `repetido`, estado y código por cada error, ningún 401, extras solo en el 403 |
| `MarcarIncidenteLocalizado.test.ts`, `ConsultarCierreIncidente.test.ts` | Delegación, traducción, `null`, ZodError |
| `CierreIncidenteDAOSupabase.test.ts` | Nombre de RPC y parámetros exactos, mapeo y normalización ISO, cada código, `DETAIL` mal formado (500), error desconocido (500 sin el mensaje y sin `details`, resumen ni solicitud en el log), forma inesperada, `null` en la lectura |
| `CierreIncidenteDAOMemoria.test.ts` + `contratoCierreIncidenteDAO.ts` | Contrato LSP de 18 casos (memoria y Postgres); la expedición nunca se modifica |
| `rutasCierreIncidente.test.ts` | HTTP con JWT real: 401, 403 `PROHIBIDO`, 400, 404, 403 con `responsableVigente`, 409, 201/200, bitácora tras el cierre, lectura por expedición, relevo, sin datos médicos |

## Frontend

| Comando | Resultado |
|---|---|
| `npm run typecheck --prefix frontend` | Pasa |
| `npm run typecheck:tests --prefix frontend` | Pasa |
| `npm run typecheck:ui --prefix frontend` | Pasa |
| `npm run test:equipo --prefix frontend` | 176 pruebas: **174 pasan, 0 fallan, 2 omitidas** (las 2 omitidas son HU-30 y HU-31 sobre Postgres, anteriores a HU-42) |
| `npm run build --prefix frontend` | Pasa (PWA generada) |
| `npm run test:ui --prefix frontend` | 13 de 13 pasan |
| `npm run test:pwa:privacidad --prefix frontend` | En el directorio del proyecto: 16 pasan y **6 fallan** (ver abajo). En un directorio sin tilde: **22 de 22 pasan** |

### `test:pwa:privacidad`: no es una regresión

Los 6 fallos son siempre los mismos (`HU-26`, `HU-30`, `medicina, contactos…`, `shell, plantillas…`, `dos cuentas…` y `expiracion 401…`): el inicio de sesión simulado no llega a `/senderista` (queda en `/iniciar-sesion`). Comprobación comparando con `develop`:

| Código | Carpeta | Resultado |
|---|---|---|
| `develop` limpio (8468edf) | `…\ING SOFT 2\ContextoProyecto\TrekSafe` (con tilde en la ruta) | 16 pasan, **6 fallan** (los mismos 6) |
| Rama de HU-42 (7ca2539) | la misma carpeta | 16 pasan, **6 fallan** (los mismos 6) |
| `develop` limpio (8468edf) | worktree temporal en una ruta sin tilde | 22 de 22 pasan |
| Rama de HU-42 (7ca2539) | worktree temporal en una ruta sin tilde | 22 de 22 pasan |

Conclusión: el fallo depende de la ruta del proyecto (el carácter `á` de `Sebastián`) y no de HU-42; el plan esperaba 5 fallos y aquí son 6, pero idénticos en `develop` limpio. Ninguna de esas pruebas toca el cierre del incidente. Debe revisarlo quien mantenga esa suite.

Pruebas nuevas de HU-42 en el frontend: `lib/cierreIncidente.test.ts` (validación, texto de retorno, política de `comandoId`/`operacionId` ante 403, 409, 0, 5xx y 400), `components/rescate/CierreIncidente.test.tsx` (10 casos: botón de localizar con confirmación en dos pasos, formulario con select sin valor por defecto, contador, aviso y nota del cierre operativo, no responsable, cerrado, validación, dos pasos con una sola llamada, cancelar, reintento con el mismo `comandoId` y descarte con otro nuevo, 403/409), `components/rescate/InformeCierreIncidente.test.tsx` (4 casos) y un caso nuevo de `alCargar` en `BitacoraIncidente.test.tsx`.

## Comprobaciones estáticas

| Comprobación | Resultado |
|---|---|
| `grep -n -i "update public\.expediciones\|update expediciones"` en la 025 | Sin coincidencias |
| `grep -n -i "revoke"` en la 025 | Solo sobre `informes_cierre_incidente` y funciones; ninguno `ON public.incidentes` |
| `grep -rn -E "supabase\|express\|infrastructure/"` en los tres casos de uso nuevos y en `ICierreIncidenteDAO.ts` | Sin coincidencias |
| `git log origin/develop..HEAD --format=%B` buscando `co-authored`, `claude` o `anthropic` | Sin coincidencias |

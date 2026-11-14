# HU-50 · Resultado de las suites de backend y frontend

Fecha: 2026-11-13. Base `origin/develop` en 34deec7 más los commits de HU-50 de la rama `feat/hu-50-ficha-medica-responsable`. Windows 11, Node 22. Los comandos del frontend se ejecutaron desde PowerShell (Git Bash rompe `VITE_API_URL=/api`).

## Backend

| Comando | Resultado |
|---|---|
| `npm run typecheck --prefix backend` | Pasa, sin errores |
| `npm test --prefix backend` | 1075 pruebas, 172 suites: **1075 pasan, 0 fallan, 0 canceladas, 0 omitidas** |
| `npm run build --prefix backend` | Pasa |

La suite de integración `hu50Postgres.integration.test.ts` se omite sin `HU50_TEST_DATABASE_URL`; sus 17 pruebas se ejecutaron contra PostgreSQL 17.6 desechable (ver `resultado-postgres.md`).

Pruebas nuevas de HU-50 en el backend:

| Archivo | Cubre |
|---|---|
| `domain/services/AutorizadorFichaIncidente.test.ts` | Un caso por motivo, las tres precedencias, localizado permitido, relevo (anterior y nuevo), el catálogo alcanzado excluye `CONTEXTO_CAMBIADO`, solo las claves `permitido`, `motivo` e `incidenteId`, entrada no modificada |
| `domain/value-objects/accesoFichaMedica.test.ts` | Cada motivo figura en el `CHECK` y en la RPC de registro de la 029 y en el frontend; la 029 no modifica `expediciones` ni `fichas_medicas` |
| `application/services/FachadaFichaMedicaIncidente.test.ts` | Orden exacto `contexto, auditar:permitido, leerCifrada, descifrar`; cada denegación sin lectura ni descifrado y con `extras = {motivo}` y sin valores médicos; 503 fail-closed; 403 que sobrevive a un fallo de auditoría; `CONTEXTO_CAMBIADO`; 500 `FICHA_ILEGIBLE` sin datos en el log; ZodError sin auditoría; 20 consultas de un no responsable; relevo, cierre y consentimiento con el DAO en memoria |
| `infrastructure/repositories/FichaMedicaIncidenteDAOSupabase.test.ts` | Nombres y parámetros de las RPC, parseo, normalización ISO, formas inválidas (500 sin detalles) y que el log no contiene `details`, `data` ni el texto cifrado |
| `infrastructure/repositories/memoria/FichaMedicaIncidenteDAOMemoria.test.ts` + `testing/contratoFichaMedicaIncidenteDAO.ts` | Contrato LSP de 10 casos (memoria y Postgres real) y la lista `accesos` |
| `infrastructure/security/DescifradorFichaMedicaAesGcm.test.ts` | Ida y vuelta con `encriptarCargaUtilMedica`; un texto alterado lanza error |
| `application/mensajes/rescueAlertEmail.test.ts` | CA-03: ni el asunto ni el HTML ni el texto contienen etiquetas o valores médicos; llevan el aviso; `@ts-expect-error` al pasar `fichaMedica` |
| `application/services/servicioAlertaRescate.test.ts` | El mensaje encolado en la outbox no lleva etiquetas médicas y sí el aviso |
| `infrastructure/repositories/RepositorioUsuario.arcoNotas.test.ts` | La RPC ARCO se llama antes de actualizar `expediciones`, el conteo, el error 500 y la lista vacía |
| `presentation/http/routes/rutasFichaMedicaIncidente.test.ts` | HTTP con JWT real: 200 con claves exactas, 403 con `codigo`, `error`, `mensaje` y `motivo`, senderista 403, sin token 401, 404, 400 sin auditar, relevo, cerrado, consentimiento revocado, auditoría registrada y `GET /alertas/:id` sin ficha |
| `presentation/http/cachePrivada.test.ts` | La ruta nueva responde 401 con `no-store` |
| `servicioRescate.coordinacion.test.ts`, `servicioRescate.relevo.test.ts`, `rutasPrioridadRescate.test.ts` | Ajustados a la firma nueva de `ServicioRescate` |

## Frontend

| Comando | Resultado |
|---|---|
| `npm run typecheck --prefix frontend` | Pasa |
| `npm run typecheck:tests --prefix frontend` | Pasa |
| `npm run typecheck:ui --prefix frontend` | Pasa |
| `npm run test:equipo --prefix frontend` | 258 pruebas: **256 pasan, 0 fallan, 2 omitidas** (las 2 omitidas son HU-30 y HU-31 sobre Postgres, anteriores a HU-50) |
| `npm run build --prefix frontend` | Pasa (PWA generada) |
| `npm run test:ui --prefix frontend` | 13 de 13 pasan |
| `npm run test:pwa:privacidad --prefix frontend` | 19 pasan y **9 fallan**, los mismos 9 que en `develop` limpio (ver abajo) |

Pruebas nuevas de HU-50 en el frontend: `lib/fichaMedicaIncidente.test.ts` (motivos, mensajes, `mensajeErrorFicha`, campos vacíos) y `components/rescate/FichaMedicaIncidente.test.tsx` (sin ser responsable: 0 llamadas y ningún botón; el clic muestra los cuatro campos; 403 `NO_ES_RESPONSABLE` y `SIN_CONSENTIMIENTO`; 503, sin conexión y error genérico; un error tras un éxito no deja datos; "Ocultar ficha" los borra; ningún uso de almacenamiento del navegador).

### `test:pwa:privacidad`: no es una regresión

Los 9 fallos son siempre los mismos y todos fallan en el mismo punto: el inicio de sesión simulado no llega a `/senderista` (`expect(page).toHaveURL('/senderista')`), un problema de la ruta del proyecto (la tilde de `Sebastián`), no del código. Comparación en esta máquina:

| Código | Resultado |
|---|---|
| `develop` limpio (34deec7), `git checkout --detach` en la misma carpeta | 19 pasan, **9 fallan** |
| Rama de HU-50 (00f6c32), dos ejecuciones | 19 pasan, **9 fallan** (los mismos 9, las dos veces) |

Los 9 son: `compatibilidad.spec.ts` (HU-26 y HU-30), `hu49.spec.ts` (3 casos) y `privacidad.spec.ts` (4 casos). El plan esperaba unos 6; en `develop` ya son 9 porque HU-49 añadió pruebas con el mismo inicio de sesión. Ninguna toca la ficha médica del incidente.

## Comprobaciones estáticas

| Comprobación | Resultado |
|---|---|
| `fichaMedica`, `repoUsuario` o `repoAuditoria` en `servicioRescate.ts` | Sin coincidencias |
| `desencript` en `backend/src/application` y `backend/src/domain` | Sin coincidencias |
| Etiquetas médicas (`Tipo de sangre`, `Alergias`, `Condiciones`, `Medicaci`, `descifrada`, `tipoSangre`) en `rescueAlertEmail.ts` | Sin coincidencias |
| `RepositorioAuditoriaAccesoMedico` en `backend/src` | Sin coincidencias |
| `importaciones.test.ts` (aplicación y dominio no importan infraestructura) | Pasa dentro de `npm test` |

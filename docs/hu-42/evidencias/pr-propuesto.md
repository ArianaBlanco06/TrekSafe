# PR propuesto: HU-42 Cerrar un incidente con informe

Rama: `feat/hu-42-cerrar-incidente` hacia `develop`.
Título sugerido: `HU-42: cerrar un incidente con informe`

## Cuerpo

Closes #<n> (número de la issue de HU-42: **a confirmar**)

### Qué hace

El responsable vigente de un incidente lo cierra con un informe (resultado y resumen). El cierre afecta a todo el incidente, conserva la bitácora (añade una entrada `cierre` al final) y es solo operativo: **no toca la expedición ni confirma el retorno del senderista**, que sigue en `alerta` hasta que él lo confirme (HU-10). También añade "Marcar persona localizada" (`abierto → localizado`), porque hasta ahora nada en el sistema llevaba un incidente a `localizado`, estado que el CA-1 exige para cerrar.

- **SQL (025):** tabla `informes_cierre_incidente` (uno por incidente, solo anexado, hora del servidor), `GRANT UPDATE (estado, cerrado_en, version) ON incidentes TO service_role` (aditivo, **sin ningún `REVOKE`**) y las RPC `treksafe_cerrar_incidente`, `treksafe_marcar_incidente_localizado` y `treksafe_leer_ultimo_cierre_incidente`. Usa la función interna de HU-41 para la entrada `cierre`, con `FOR UPDATE` desde el principio.
- **Backend:** `POST /api/rescate/incidentes/:incidenteId/localizacion`, `POST /api/rescate/incidentes/:incidenteId/cierre` y `GET /api/rescate/alertas/:expedicionId/cierre`; dos comandos, tres casos de uso, interfaces `IRegistroCierreIncidente`/`IRegistroLocalizacionIncidente`/`ILectorCierreIncidente`, DAO de Supabase y de memoria.
- **Frontend:** en el detalle de la alerta, "Marcar persona localizada" y "Cerrar incidente" (confirmación en dos pasos, aviso de privacidad, reintento con el mismo `comandoId`) y, tras el cierre, la tarjeta "Rescate cerrado (cierre operativo)" con la bitácora en solo lectura.
- **No toca** `expediciones`, `IIncidenteDAO`, `ServicioRescate`, `BloqueCoordinacion`, la bitácora personal de HU-14, ni las migraciones 017 y 019.

### Código de otras HU que se toca (lo mínimo)

- `backend/src/infrastructure/composicion/servicios.ts` y `backend/src/presentation/http/routes/rutasRescate.ts` (HU-39/41/40): solo bloques añadidos y comentados `// HU-42`. **Favio:** HU-40 modifica los mismos dos archivos; esperar conflicto de merge en esos bloques.
- `frontend/src/components/rescate/BitacoraIncidente.tsx` (HU-41): una prop opcional `alCargar` (llamada tras cada lectura correcta).
- `frontend/src/pages/PaginaDetalleAlertaRescate.tsx` (HU-14/39/41): estado y lectura del cierre, `CierreIncidente` e `InformeCierreIncidente`.
- `backend/src/infrastructure/repositories/memoria/BitacoraIncidenteDAOMemoria.ts` (HU-41, solo doble de prueba): `anexarInterna` rechaza un `operacionId` ya usado, igual que la función SQL.
- `backend/migrations/README.md`: fila de la 025 y sección "HU-42". `REGISTRO_APLICACION.md` **no** se modifica.
- No se modificó `backend/scripts/test-dep108-postgres.mjs` (script ajeno; ver avisos).

### Decisiones provisionales (a confirmar con Marko; D1 también con Jhon)

D1 catálogo de resultados sin estado de salud (`localizado_sin_asistencia`, `asistido_en_terreno`, `evacuado`, `falsa_alarma`); D2 solo se cierra desde `localizado`; D3 nota fija al marcar localizada; D4 códigos HTTP como en HU-41; D5 el senderista no recibe nada nuevo; D6 la alerta sigue en la lista tras el cierre y asumir abre un incidente nuevo; D7 resumen de 1 a 2000 caracteres. Detalle en `docs/hu-42/diseno.md`.

### Evidencia

- Suite SQL de HU-42: 13 de 13 casos sobre PostgreSQL 17.6 desechable (`backend/migrations/tests/hu42_cerrar_incidente.test.sql`); regresión de la suite SQL de HU-41: 16 de 16.
- Concurrencia con sesiones reales (relevo, dos cierres, 10 rondas de cierres simultáneos, mismo comando, nota contra cierre en los dos sentidos y 20 rondas sin `40P01`, error forzado, "localizado" simultáneo): 9 de 9.
- Suite TypeScript sobre Postgres real: 20 de 20. `test-hu42-postgres.mjs` completo: 39 de 39. `test-hu41-postgres.mjs`: 23 de 23.
- Backend: `typecheck`, `npm test` (705 pruebas, 0 fallos) y `build` pasan.
- Frontend: `typecheck`, `typecheck:tests`, `typecheck:ui`, `test:equipo` (174 pasan, 2 omitidas anteriores), `build` y `test:ui` (13 de 13) pasan.
- `test:pwa:privacidad`: 6 fallos en esta máquina, **los mismos que en `develop` limpio** (el inicio de sesión simulado no llega a `/senderista` cuando la ruta del proyecto contiene `á`); en una ruta sin tilde pasan 22 de 22, con y sin estos cambios. No es una regresión.
- `test-dep108-postgres.mjs`: no se pudo ejecutar (exige un binario de PostgREST que no hay en esta máquina); no aplica la 025.
- Detalle en `docs/hu-42/evidencias/` (`resultado-postgres.md`, `resultado-suites.md`, `prueba-manual.md`).

### Avisos

- **Ariana:** esta PR trae la migración **025** (`025_hu42_cerrar_incidente.sql`, no re-ejecutable, requiere 017 y 019). El 021 lo usa HU-40 y el 020 HU-49; reservar el 025 y aplicarlo una sola vez, **después de la 021** si existe. Anotarlo en `REGISTRO_APLICACION.md` (no se modifica aquí) y recargar el esquema de PostgREST para las tres RPC nuevas. En DEV, consulta de solo lectura: `SELECT has_column_privilege('service_role','public.incidentes','estado','UPDATE'), has_column_privilege('service_role','public.incidentes','cerrado_en','UPDATE');`. No se aplicó en ningún entorno remoto.
- **Favio (HU-40):** su `REVOKE UPDATE ON incidentes FROM service_role` (021) también retira los privilegios de columna de la 025: aplicar la 021 antes, o recuperar con `GRANT UPDATE (estado, cerrado_en, version) ON public.incidentes TO service_role;`. Revisar el `FOR UPDATE` común (un solo bloqueo de fila, sin bloquear `expediciones`) y que `localizado` sube `version`.
- **Jhon:** privacidad (D1: el catálogo no incluye estado de salud; el resumen es texto libre con aviso fijo) y nota para HU-47 (contar desde `informes_cierre_incidente`).
- **Marko:** D1 a D7, en especial D2 (cerrar desde `abierto`), D6, D5, la confusión posible con el `estadoRescate` "cerrado" de la bitácora personal de HU-14, y el caso en que el senderista ya confirmó el retorno (el detalle de la alerta da 404 y el cierre solo es posible por API). Además: incorporar la 025 y `hu42Postgres.integration.test.ts` a `test-dep108-postgres.mjs` (lista `newMigrations` y bucle `[30, 31, 36, 41]`); es un script ajeno y no se tocó.
- **HU-50:** al cerrar, el acceso a la ficha médica debe terminar (nota en `diseno.md`).

### Prueba manual

Pendiente en DEV tras aplicar la 025 (`docs/hu-42/evidencias/prueba-manual.md`).

## División de commits sugerida

1. `feat(sql): migración 025 y pruebas del cierre del incidente (HU-42)`: `025_hu42_cerrar_incidente.sql`, `tests/hu42_cerrar_incidente.test.sql`, `scripts/test-hu42-postgres.mjs` y la fila y sección del `migrations/README.md`.
2. `feat(backend): dominio, comandos, casos de uso y DAO del cierre del incidente (HU-42)`.
3. `feat(backend): rutas, controlador y pruebas de integración del cierre (HU-42)`.
4. `feat(frontend): cierre del incidente e informe en el detalle de la alerta (HU-42)`.
5. `docs(hu-42): diseño, evidencias y bitácora`.

# PR propuesto: HU-41 Bitácora cronológica del incidente

Rama: `feat/hu-41-bitacora-incidente` hacia `develop`.
Título sugerido: `HU-41: bitácora cronológica del incidente`

## Cuerpo

Closes #42

### Qué hace

El responsable vigente de un incidente añade entradas (notas y correcciones) a una bitácora compartida; todos los rescatistas autorizados la leen en orden cronológico. Las entradas solo se anexan: no se editan ni se borran, la hora la fija el servidor y una corrección es una entrada nueva que cita la original.

- **SQL (019):** tabla `entradas_bitacora_incidente` (solo anexado por triggers, hora del servidor, orden `(registrada_en, secuencia)`, un único `cierre` por incidente), `GRANT UPDATE (version) ON incidentes TO service_role` para el bloqueo `FOR SHARE`, la función interna `treksafe_anexar_entrada_bitacora_interna` (reutilizable por HU-42) y la RPC `treksafe_agregar_entrada_bitacora`.
- **Backend:** `GET` y `POST /api/rescate/incidentes/:incidenteId/bitacora`; comando, dos casos de uso, interfaces `ILectorBitacoraIncidente`/`IRegistroBitacoraIncidente`, DAO de Supabase y de memoria.
- **Frontend:** sección "Bitácora del incidente" en el detalle de la alerta, con aviso de privacidad, corrección, y reintento con el mismo `operacionId` ante errores de red.
- **No toca** la bitácora personal de HU-14 (`bitacoras_rescate`, `PATCH /alertas/:id/bitacora`) ni `IIncidenteDAO`.

### Decisiones provisionales (a confirmar)

Estados con escritura `abierto` y `localizado`; lectura para cualquier rescatista; lectura disponible tras el cierre; direccionamiento por incidente; texto de 1 a 2000 caracteres; tipo `cierre` reservado para HU-42. Detalle en `docs/hu-41/diseno.md`.

### Evidencia

- Suite SQL: 16 de 16 casos sobre PostgreSQL 17.6 desechable (`backend/migrations/tests/hu41_bitacora_incidente.test.sql`).
- Concurrencia con sesiones reales (relevo antes y después de la escritura, cierre, 20 escrituras simultáneas, mismo `operacionId`, error forzado): 6 de 6.
- Suite TypeScript sobre Postgres real: 15 de 15.
- Backend: `typecheck`, `npm test` (600 pruebas) y `build` pasan.
- Frontend: `typecheck`, `typecheck:tests`, `typecheck:ui`, `test:equipo` (152 pasan, 2 omitidas anteriores), `build` y `test:ui` pasan.
- `test:pwa:privacidad`: 5 fallos que ya ocurren en `develop` sin estos cambios (el inicio de sesión simulado no llega a `/senderista`); no relacionados con esta HU.
- Detalle en `docs/hu-41/evidencias/` (`resultado-postgres.md`, `resultado-suites.md`, `prueba-manual.md`).

### Avisos

- **@ArianaBlanco06:** esta PR trae la migración **019** (`019_hu41_bitacora_incidente.sql`, no re-ejecutable, requiere 017 y 002). Reservar el número, aplicarla una sola vez cuando se apruebe y anotarla en `REGISTRO_APLICACION.md` (no se modifica aquí). No se aplicó en ningún entorno remoto. Además, en DEV conviene la consulta de solo lectura `SELECT has_table_privilege('service_role','public.incidentes','UPDATE')`.
- **Revisores:** Favio (incidentes y bloqueos: `FOR SHARE` frente al relevo, `UPDATE (version)`), Jhon (privacidad: texto libre y aviso, y conteo por incidente para HU-47) y Marko (validación y decisiones D1, D3, D4, D8, D9).
- **HU-42:** la función interna y el "Contrato para HU-42" de `docs/hu-41/diseno.md` dejan listo el cierre en la misma transacción.
- **HU-40:** su migración no debe quitar `UPDATE (version)` sobre `incidentes` a `service_role`.

### Prueba manual

Pendiente en DEV tras aplicar la 019 (`docs/hu-41/evidencias/prueba-manual.md`).

## División de commits sugerida

1. `feat(sql): migración 019 y pruebas de la bitácora del incidente (HU-41)`: `019_hu41_bitacora_incidente.sql`, `tests/hu41_bitacora_incidente.test.sql`, `scripts/test-hu41-postgres.mjs` y la fila y sección del `migrations/README.md`.
2. `feat(backend): dominio, casos de uso y DAO de la bitácora del incidente (HU-41)`: dominio, DTO, comando, casos de uso, DAO de Supabase y de memoria, contrato y pruebas unitarias.
3. `feat(backend): rutas, controlador y pruebas de integración de la bitácora (HU-41)`: `controladorBitacoraIncidente`, `rutasRescate.ts`, `rutasBitacoraIncidente.test.ts`, puente, contexto y `hu41Postgres.integration.test.ts`.
4. `feat(frontend): bitácora del incidente en el detalle de la alerta (HU-41)`: servicio, lib, componente, página y pruebas.
5. `docs(hu-41): diseño, contrato para HU-42 y evidencias`.

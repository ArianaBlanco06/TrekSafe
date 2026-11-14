# PR propuesto: HU-50 Restringir la ficha médica al responsable vigente

Rama: `feat/hu-50-ficha-medica-responsable` hacia `develop`.
Título sugerido: `HU-50: restringir la ficha médica al responsable vigente`

## Cuerpo

Closes #52

### Qué hace

La ficha médica de un senderista solo la consulta el **responsable vigente** de un incidente **no cerrado** (abierto o localizado), con consentimiento vigente, **bajo demanda** y con **auditoría de cada intento** (permitido o denegado). El servidor decide antes de descifrar; si no puede auditar un acceso permitido, no muestra la ficha. Un relevo o un cierre en medio de la consulta no entregan datos.

- **SQL (029):** tabla `accesos_ficha_medica` (solo anexado, hora del servidor, sin datos de salud, con cascada del ARCO), `GRANT UPDATE (version) ON incidentes` (aditivo, **sin ningún `REVOKE`**), tres RPC `SECURITY INVOKER` (`treksafe_contexto_ficha_medica`, `treksafe_leer_ficha_cifrada_responsable` con `FOR SHARE`, `treksafe_registrar_acceso_ficha_medica`) y la RPC ARCO `treksafe_anonimizar_notas_avance` (`SECURITY DEFINER`).
- **Backend:** `GET /api/rescate/incidentes/:incidenteId/ficha-medica`; `AutorizadorFichaIncidente` (dominio puro), `FachadaFichaMedicaIncidente`, interfaces de lectura de contexto, lectura cifrada y auditoría, puerto `IDescifradorFichaMedica`, DAO de Supabase y de memoria. `GET /api/rescate/alertas/:expedicionId` **ya no devuelve `fichaMedica`**.
- **Correo:** la plantilla de alerta a rescatistas ya no tiene campos médicos ni dice si existe una ficha; muestra un aviso fijo.
- **ARCO:** al anonimizar rutas se limpian también las notas libres de avance (HU-34); la respuesta añade `notasAvanceAnonimizadas`.
- **Frontend:** `FichaMedicaIncidente` ("Ver ficha médica" / "Ocultar ficha"), visible solo para el responsable; los datos viven solo en el estado del componente.
- **No toca** `REGISTRO_APLICACION.md`, la migración 021 ni la 025, ni `test-dep108-postgres.mjs`.

### Código de otras HU que se toca (lo mínimo)

- `ServicioRescate` (HU-14/39/43): firma `(repo, repoAlerta, incidentes, reloj?, estrategias?)`; se borran `RepositorioAuditoriaAccesoMedico` (puerto y adaptador) y `AuditoriaAccesoMedico` (sin otros usos).
- Pruebas de HU-39 y HU-40 (`servicioRescate.coordinacion.test.ts`, `servicioRescate.relevo.test.ts`) y de HU-43 (`rutasPrioridadRescate.test.ts`, `backend/scripts/test-hu43-integracion.mjs`): solo la firma del constructor. **`test-hu43-integracion.mjs` es JS y falla en silencio si no se actualiza.**
- `ServicioAlertaRescate` (firma sin `IRepositorioUsuario`) y `rescueAlertEmail.ts`.
- `servicios.ts` y `rutasRescate.ts`: bloques añadidos y comentados `// HU-50`.
- `RepositorioUsuario.anonimizarHistorialRutas` y su puerto; `services/usuario.ts` (frontend).
- `backend/migrations/README.md`: fila de la 029 y sección "HU-50".

### Decisiones D1 a D11 (a validar con Marko)

D1 "abierto" incluye `localizado`; D2 "consentimiento revocado" = no hay ficha (sin endpoint de revocación); D3 el 403 expone el motivo (sin datos de salud; **confirmar con Jhon**); D4 consulta bajo demanda, un clic = una fila de auditoría; D5 el estado de la expedición no influye; D6 la auditoría se borra en cascada con la cuenta; D7 sin endpoint para leer la auditoría; D8 la tabla legada `auditoria_acceso_medico` se conserva sin escribirse; D9 el ARCO cubre solo `avances_expedicion.nota` (`punto_nombre` y `puntos_ruta.nombre` quedan como hueco informado); D10 aviso del correo; D11 `tipo_sangre` en claro en el esquema base (fuera de alcance; **informar a Jhon**). Detalle en `docs/hu-50/diseno.md`.

### Evidencia

- Suite SQL de HU-50: 14 de 14 casos sobre PostgreSQL 17.6 desechable; regresión de las suites SQL de HU-42 (13 de 13) y HU-41 (16 de 16).
- Concurrencia con sesiones reales (relevo, cierre, lectura `FOR SHARE` contra relevo, 20 rondas sin `40P01`, 20 registros de auditoría desde dos sesiones, error forzado): 6 de 6.
- Suite TypeScript sobre Postgres real: 17 de 17. `test-hu50-postgres.mjs` completo: 50 de 50. `test-hu42-postgres.mjs`: 39 de 39. `test-hu41-postgres.mjs`: 23 de 23. `test-hu43-integracion.mjs`: 7 de 7.
- Backend: `typecheck`, `npm test` (1075 pruebas, 0 fallos) y `build` pasan.
- Frontend: `typecheck`, `typecheck:tests`, `typecheck:ui`, `test:equipo` (258 pruebas: 256 pasan, 2 omitidas anteriores), `build` y `test:ui` (13 de 13) pasan.
- `test:pwa:privacidad`: 9 fallos en esta máquina, **los mismos 9 que en `develop` limpio (34deec7)** (el inicio de sesión simulado no llega a `/senderista`; la ruta del proyecto contiene `á`). No es una regresión.
- `test-dep108-postgres.mjs`: no se ejecutó ni se modificó (script ajeno; ver avisos).

### Avisos

- **Ariana:** esta PR trae la migración **029** (no re-ejecutable; requiere el esquema base, 016 y 017). Aplicarla una sola vez, **después de la 021 y la 025**, y **recargar el esquema de PostgREST** (4 RPC nuevas). Anotarlo en `REGISTRO_APLICACION.md` (no se modifica aquí). Comprobación de solo lectura: `SELECT has_table_privilege('service_role','public.accesos_ficha_medica','UPDATE');` debe dar `false`. No se aplicó en ningún entorno remoto.
- **Fernando:** cambió la plantilla del correo de alerta a rescatistas y la firma de `ServicioAlertaRescate` (ya no recibe `IRepositorioUsuario`).
- **Favio (HU-40):** se ajustaron las pruebas de HU-39 y HU-40 a la firma nueva de `ServicioRescate`; el contrato de `responsable_id` se mantiene (el relevo mueve el acceso a la ficha).
- **Jhon:** se tocaron las pruebas y el script de HU-43 (solo la firma). Revisar D3 y D11. A `test-dep108-postgres.mjs` le falta la 029: es un script ajeno y no se tocó.
- **Marko:** validar D1 a D11.

### Prueba manual

Pendiente en DEV tras aplicar la 029 (`docs/hu-50/evidencias/prueba-manual.md`).

## División de commits

1. `feat(sql): migración 029 con acceso a la ficha médica, auditoría y ARCO de avances (HU-50)`: la 029, su suite SQL, `test-hu50-postgres.mjs` y la fila y sección del `migrations/README.md`.
2. `feat(backend): autorizador, auditoría y descifrado separados de la ficha médica (HU-50)`.
3. `feat(backend): ruta de ficha médica del responsable y detalle de alerta sin datos médicos (HU-50)`.
4. `fix(privacidad): correo de alerta sin datos médicos y ARCO de notas de avance (HU-50)`.
5. `feat(frontend): ficha médica bajo demanda solo para el responsable vigente (HU-50)`.
6. `docs(hu-50): diseño, decisiones y evidencias`.

# Bitácora de desarrollo — TrekSafe Release 2
**Responsable:** Sebastián Chapman
**Alcance:** HU-29, HU-36, HU-41, HU-42, HU-50
**Repositorio:** TrekSafe (`origin = github.com/ArianaBlanco06/TrekSafe`)

> Diario técnico acumulativo. Las entradas nuevas se agregan al final del registro cronológico; no se borra historial.
> No se registran claves, tokens, contraseñas, datos médicos ni datos personales reales.

## Resumen del proyecto

TrekSafe es una PWA de monitoreo pasivo para senderistas: el senderista declara su expedición y confirma su retorno; si el plazo vence sin confirmación, un cron marca la expedición en `alerta` y se avisa a contactos y rescatistas por correo. Los rescatistas usan una consola con semáforo, confirman alertas y consultan la ficha de emergencia.

Arquitectura observada en el commit `f89d6af`:

- Monorepo: `frontend/` (React 18 + Vite 6 + TypeScript + vite-plugin-pwa + Leaflet) y `backend/` (Express 4 + TypeScript, ESM/NodeNext, zod).
- Backend por capas: `presentation/http` (rutas, controladores, middleware) → `application` (servicios `servicioX.ts`, DTO zod) → `domain` (entidades, value-objects; `domain/repositories/` y `application/use-cases/` vacíos con `.gitkeep`) → `infrastructure` (repositorios Supabase, correo, cron, seguridad).
- Persistencia: PostgreSQL en Supabase vía `@supabase/supabase-js` con `service_role` (RLS deny-by-default para `anon`/`authenticated`). Existe `pg` Pool opcional (`DATABASE_URL`), no usado por los repositorios.
- Pruebas: `node --import tsx --test src/**/*.test.ts` (node:test). Solo existe `shared/utils/coordinates.test.ts`.

Alcance de esta ejecución (sección 16 del encargo): planificar las cinco HU; implementar únicamente Sprint 1 puntos 1 (contrato Factory Method con HU-28) y 2 (HU-29 completa).

## Estado inicial

- **Rama:** `Sebastian` (sigue a `origin/Sebastian`).
- **Commit inicial:** `f89d6af` — "TrekSafe Release 01 - code antiguo". `main` y `Sebastian` apuntan al mismo commit.
- **Cambios preexistentes:** árbol de trabajo limpio (`git status`: nothing to commit).
- **Ramas remotas:** `main`, `Sebastian`. **No existe `develop`** (tarea de Ariana).
- **Dependencias disponibles:** HU-07 (crear expedición) y HU-22 (plantillas/borradores locales) presentes en el código. HU-05/HU-18 presentes (ficha médica cifrada y detalle de alerta).
- **Dependencias NO presentes en el código:** HU-28 (Jhon), HU-26/HU-27/HU-35 (Favio), HU-39/HU-40 (Favio), interruptor `CRON_ENABLED` (Fernando), carpeta `backend/migrations`.
- **Bloqueos detectados:**
  - HU-36 bloqueada para integración hasta HU-26, HU-27, HU-35.
  - HU-41, HU-42, HU-50 bloqueadas hasta HU-39 (y HU-40 para HU-50).
  - Sin `CRON_ENABLED`, levantar una API local contra Supabase DEV ejecuta el cron compartido: **no se levanta el backend contra DEV** en esta ejecución.
  - No hay base desechable compartida; se usará un clúster PostgreSQL 17 local temporal (instalación existente en la máquina) para probar SQL.

## Registro cronológico

### 2026-10-26T21:05:00-05:00 — Transversal — Inicio del análisis

**Fase:** Análisis

**Objetivo:**
Localizar la raíz Git, revisar el estado de trabajo y extraer las tres fuentes de verdad.

**Estado anterior:**
Directorio de trabajo `ContextoProyecto/` con `context/` (documentos) y `TrekSafe/` (repositorio Git).

**Análisis técnico resumido:**
- Raíz Git: `ContextoProyecto/TrekSafe` (`git rev-parse --show-toplevel`).
- Se extrajo el texto de `TrekSafe_Product_Backlog_ISW2.xlsx` (hoja única *Product Backlog*), `TrekSafe_Informe_Continuidad_ISW2.docx` y `TrekSafe_Asignaciones_y_Arranque_Release2.docx` con un script de lectura de OOXML en el directorio temporal (sin modificar los documentos).
- Criterios de HU-29, HU-36, HU-41, HU-42, HU-50 copiados literalmente al plan (sección 3 del plan).

**Abstracciones propuestas o aplicadas:** Ninguna todavía.

**Principios y patrones:** —

**Alternativas evaluadas:** —

**Decisión adoptada:**
Trabajar sobre la raíz `TrekSafe/`; la bitácora y el plan se crean directamente allí.

**Cambios realizados:**
- Archivos creados: `BITACORA_SEBASTIAN_RELEASE2.md`.

**Justificación:** Requisito explícito de ubicación en la raíz del repositorio.

**Pruebas:** —

**Riesgos o bloqueos:** Ver Estado inicial.

**Estado:** En curso

**Siguiente acción:** Inspeccionar componentes relevantes.

---

### 2026-10-26T21:20:00-05:00 — Transversal — Inspección del repositorio y línea base

**Fase:** Análisis

**Objetivo:**
Comprender el comportamiento implementado y medir la línea base de verificación.

**Estado anterior:** Desconocido.

**Análisis técnico resumido:**
1. `ServicioExpedicion` instancia repositorios concretos en parámetros por defecto del constructor (DIP parcial: inyectable, pero el valor por defecto acopla a Supabase).
2. `RepositorioExpedicion.crearExpedicion` realiza tres inserciones con compensación manual (`delete` si falla un paso): **no es atómico**. No se modifica en HU-29 (es de HU-07/Favio), pero se registra como riesgo.
3. `validarPropiedadContactos` sí valida que los contactos existan y pertenezcan al senderista → base reutilizable para "contactos vigentes".
4. `contactos_emergencia` borra en cascada `vinculos_expedicion_contacto`: eliminar un contacto altera expediciones existentes. Por ello las plantillas **no** deben enlazar contactos mediante FK en cascada.
5. Frontend: `lib/offlineExpedicion.ts` guarda "plantillas de ruta frecuente" automáticas y borradores en Cache API/localStorage con claves **globales del dispositivo** (`route-templates`, `expedition-drafts`, `contacts-cache`): no están aisladas por usuario.
6. `RepositorioUsuario.obtenerFichaMedica` **descifra dentro del repositorio**, y `ServicioRescate.obtenerDetalleAlerta` audita y devuelve la ficha a cualquier rescatista validado. `servicioAlertaRescate` incluye la ficha en el correo a rescatistas. Relevante para HU-50.
7. `bitacoras_rescate` es única por (expedición, rescatista) y sobrescribe `notas` → relevante para HU-41.
8. No existe tabla `incidentes`; el "incidente" hoy es implícito (expedición en `alerta`). HU-39 (Favio) debe introducirlo.
9. `fichas_medicas` tiene `CHECK (consentimiento_firmado = TRUE)`; la revocación (HU-21) borra la ficha.

**Pruebas (línea base, Windows 11, Node v22.21.0, npm 10.9.4):**
- `npm run typecheck --prefix backend` → OK.
- `npm run typecheck --prefix frontend` → OK.
- `npm test --prefix backend` → 6 pruebas, 2 suites, 6 aprobadas, 0 fallos.
- Herramientas: PostgreSQL 17 instalado localmente (servicio en ejecución, credenciales desconocidas → se usará `initdb` en un directorio temporal con puerto propio). Docker no disponible (daemon detenido).

**Decisión adoptada:** No ejecutar el backend contra Supabase DEV (sin `CRON_ENABLED`). Probar SQL en clúster desechable local.

**Cambios realizados:** Ninguno en código.

**Estado:** Verificado localmente (línea base)

**Siguiente acción:** Elaborar `PLAN_SEBASTIAN_RELEASE2.md`.

---

### 2026-10-26T21:40:00-05:00 — HU-29/HU-36/HU-41/HU-42/HU-50 — Planificación integral

**Fase:** Diseño

**Objetivo:**
Diseñar abstracciones, contratos, migraciones, pruebas y orden de implementación de las cinco HU.

**Estado anterior:** Sin plan.

**Análisis técnico resumido:** Ver `PLAN_SEBASTIAN_RELEASE2.md` (secciones 4 a 9).

**Abstracciones propuestas (HU-29, a implementar ahora):**
- `IPlantillaDAO` (domain/repositories) — persistencia privada por propietario; todas las operaciones exigen `senderistaId`. Colaboradores: `ServicioPlantillas`, `CreadorDesdePlantilla`. Existe para aplicar DIP y permitir DAO en memoria.
- `IContactosVigentes` (domain/repositories) — filtra los ids de contactos que aún existen y pertenecen al senderista. Interfaz mínima (ISP) consumida por el creador y el servicio.
- `CreadorPlan` (application/creacion-plan, abstracta) — declara el Factory Method `crearBorrador()` y la operación común `prepararBorrador()` que impone fechas vacías y revalida contactos. Contrato compartido con HU-28.
- `IPlanEditable` (producto abstracto) y `PlanDesdePlantilla` (producto concreto).
- `CreadorDesdePlantilla` (creador concreto) — único creador implementado por Sebastián; `CreadorDesdeHistorial` queda para Jhon.
- `ServicioPlantillas` — casos de uso guardar/listar/renombrar/eliminar.
- `DAOPlantillasSupabase`, `DAOContactosVigentesSupabase` (infrastructure) y `DAOPlantillasMemoria` (pruebas).

**Principios y patrones:** SRP (validación zod / reglas en servicio / persistencia en DAO / creación en creador), OCP (nuevo origen = nueva subclase de `CreadorPlan`), DIP (servicio y creador dependen de interfaces; ensamblaje en un módulo de composición), Factory Method, DAO.

**Alternativas evaluadas:**
- Enlazar contactos de la plantilla con tabla puente y FK en cascada → descartado: la cascada ocultaría al usuario que un contacto dejó de estar vigente y requeriría inserciones múltiples no atómicas vía supabase-js. Se elige columna `uuid[]` y revalidación al crear el borrador.
- Una función `crearPlan(tipo)` con `switch` → descartada por no constituir Factory Method (el backlog e Informe lo prohíben explícitamente).
- Usar el pool `pg` para el DAO → descartado para HU-29: la convención del repositorio es supabase-js y todas las operaciones de HU-29 son de una sola fila (atómicas por sí mismas).

**Decisión adoptada:** Ver ADR-01 a ADR-05.

**Cambios realizados:** `PLAN_SEBASTIAN_RELEASE2.md` (creado).

**Estado:** Verificado (plan completo)

**Siguiente acción:** Transferir la implementación de Sprint 1 puntos 1 y 2 a un subagente configurado con el modelo Sonnet.

---

### 2026-10-26T21:45:28-05:00 — HU-29 / contrato HU-28 — Punto 1: contrato Factory Method compartido

**Fase:** Implementación (Fase B; rama `feature/HU-29-plantillas-cuenta`, sin commits; entrada consolidada al cierre de la implementación)

**Objetivo:**
Definir el contrato `CreadorPlan` / `IPlanEditable` reutilizable por HU-28 (Jhon) y su suite de contrato.

**Estado anterior:** Sin contrato ni `domain/repositories` (solo `.gitkeep`).

**Análisis técnico resumido:**
El flujo "crear plan desde un origen" debe imponer las mismas invariantes sin importar el origen (fechas vacías, solo contactos vigentes, sin datos de la expedición original). Esas invariantes viven en la clase base; cada variante solo decide cómo obtener el producto.

**Abstracciones propuestas o aplicadas:**
- `IPlanEditable` (producto abstracto) y `OrigenPlan` (`'plantilla' | 'historial'`).
- `CreadorPlan` abstracta: `prepararBorrador` (operación común) y `protected abstract crearBorrador` (Factory Method). Colaborador: `IContactosVigentes`.
- `BorradorPlan` (resultado con fechas `null` y `requiereFechasNuevas: true`).
- `verificarContratoCreadorPlan` en `contratoCreadorPlan.ts` (no termina en `.test.ts`, no corre sola).

**Principios y patrones:** Factory Method, OCP (nuevo origen = nueva subclase), LSP (suite de contrato por subclase), DIP (la base depende de `IContactosVigentes`, no de Supabase).

**Alternativas evaluadas:** `switch` por tipo de origen (descartada: no es Factory Method y obliga a modificar el código por cada origen nuevo).

**Decisión adoptada:** Contrato según sección 4.2 del plan, sin desviaciones. Los contactos duplicados en un plan se deduplican al preparar el borrador.

**Cambios realizados:**
- Creados: `backend/src/application/creacion-plan/{IPlanEditable,CreadorPlan,contratoCreadorPlan}.ts`, `backend/src/domain/repositories/IContactosVigentes.ts`.

**Justificación:** Jhon podrá crear `PlanDesdeHistorial` y `CreadorDesdeHistorial` sin tocar `CreadorPlan`.

**Pruebas:** La suite de contrato se ejecuta contra `CreadorDesdePlantilla` (5 pruebas: fechas nulas, contactos vigentes y conteo de no vigentes, claves exactas del borrador, copias independientes, origen ajeno/inexistente = 404). Ver entrada de verificación.

**Riesgos o bloqueos:** R1 (HU-28 no existe): el contrato podría necesitar ajustes cuando Jhon lo use; pendiente su revisión.

**Estado:** Implementado, verificado localmente (ver entrada de verificación)

**Siguiente acción:** HU-29 (dominio, DAO, servicio, API, migraciones, frontend).

---

### 2026-10-26T21:45:28-05:00 — HU-29 — Backend, migraciones y frontend

**Fase:** Implementación

**Objetivo:**
Gestión de plantillas personales en la cuenta (guardar, listar, renombrar, eliminar), borrador desde plantilla con fechas vacías y contactos vigentes, y caché por usuario en el frontend.

**Estado anterior:** Plantillas solo locales, automáticas y compartidas por dispositivo (HU-22). No existía carpeta de migraciones.

**Análisis técnico resumido:**
- Todas las operaciones de HU-29 son de una sola fila → no se requiere RPC ni transacción multi-sentencia.
- La concurrencia entre dispositivos se resuelve con compare-and-swap sobre `version` (trigger incrementa versión y fija hora del servidor).
- Plantilla ajena ≡ inexistente (404); `:id` no UUID → 404 en el controlador (evita `22P02`).

**Abstracciones propuestas o aplicadas:**
- Dominio: `PlantillaRuta`, `IPlantillaDAO` (resultados discriminados, sin `ErrorAplicacion`), `IContactosVigentes`.
- Aplicación: `ServicioPlantillas` (traduce a `ErrorAplicacion`: `PLANTILLA_NO_ENCONTRADA` 404, `VERSION_OBSOLETA` 409, `NOMBRE_DUPLICADO` 409, `CONTACTOS_INVALIDOS` 400), `PlanDesdePlantilla`, `CreadorDesdePlantilla`, `plantilla.dto.ts`, `ModuloPlantillas` (tipo del módulo ensamblado).
- Infraestructura: `DAOPlantillasSupabase` y `DAOContactosVigentesSupabase` (cliente por constructor con valor por defecto `getSupabaseAdmin()`, no se invoca al importar), `DAOPlantillasMemoria`, `ContactosVigentesMemoria`, `contratoIPlantillaDAO.ts`, `composicion/moduloPlantillas.ts` (único lugar con `new` de clases concretas).
- Presentación: `controladorPlantillas.ts` (fábrica que recibe el módulo), `rutasPlantillas.ts` (`middlewareAutenticacion` + `requerirRol('senderista')`), montaje en `app.ts` bajo `/plantillas`.
- Frontend: `services/plantillas.ts`, `lib/plantillasCuentaLogica.ts` (pura), `lib/cachePlantillasCuenta.ts` (E/S), `components/plantillas/{SelectorPlantillasCuenta,GuardarComoPlantilla}.tsx`, `pages/PaginaPlantillas.tsx`.

**Principios y patrones:** SRP, OCP, DIP, Factory Method, DAO. Verificación DIP: `grep` de `supabase-js`, `express` e `infrastructure/` sobre los archivos nuevos de `application/` y `domain/` sin coincidencias, salvo los dos `.test.ts` ubicados en `application/` (por indicación del plan) que importan los dobles en memoria.

**Alternativas evaluadas:**
- Reutilizar `RepositorioExpedicion.validarPropiedadContactos` para contactos vigentes: descartado, lanza `ErrorAplicacion` si falta alguno y vive en infraestructura concreta; `IContactosVigentes.filtrarVigentes` devuelve el subconjunto vigente.
- Tabla puente de contactos: descartada (ADR-02).
- Probar la lógica del frontend con un runner nuevo: descartado (sin dependencias nuevas); se usa el `tsx` del backend.

**Decisión adoptada:** Implementación según el plan. Cambios menores no previstos literalmente:
1. `ModuloPlantillas` en `application/modulos/` para que presentación e infraestructura compartan el tipo sin importarse entre sí.
2. `frontend/tsconfig.json` excluye `src/**/*.test.ts` (el frontend no tiene `@types/node`); la prueba de lógica pura se ejecuta con `npm run test:frontend-logica --prefix backend`.
3. La suite `contratoIPlantillaDAO.ts` quedó en `infrastructure/repositories/` para poder ejecutarse también contra `DAOPlantillasSupabase` cuando exista base DEV.
4. Scripts nuevos en `backend/package.json`: `test:migraciones` y `test:frontend-logica`.

**Cambios realizados:**
- Creados (backend): ver archivos listados arriba; `backend/migrations/{000_registro_migraciones.sql,001_hu29_plantillas_ruta.sql,001_hu29_plantillas_ruta.down.sql,README.md,REGISTRO_APLICACION.md}`; pruebas `CreadorDesdePlantilla.test.ts`, `DAOPlantillasMemoria.test.ts`, `servicioPlantillas.test.ts`, `rutasPlantillas.test.ts`, `migraciones.test.ts`.
- Modificados (mínimos): `usuario.dto.ts` (exporta `campoCoordenadaOpcional`), `app.ts` (monta `/plantillas`), `backend/package.json` (2 scripts), `frontend/src/app/App.tsx` (ruta `perfil/plantillas`), `PaginaPerfilSenderista.tsx` (enlace), `PaginaCrearExpedicion.tsx` (monta los dos componentes y `aplicarBorrador`; las plantillas automáticas de HU-22 quedan intactas), `frontend/tsconfig.json` (exclude de `*.test.ts`).
- Migración 001: tabla `plantillas_ruta` con CHECK, índice único `(senderista_id, lower(btrim(nombre)))`, índice de listado, trigger `BEFORE UPDATE` (versión, `actualizado_en`, propietario y `creado_en` inmutables), FK `ON DELETE CASCADE` a `perfiles_senderista`, RLS + política deny, registro en `treksafe_migraciones`; falla explícitamente si ya está registrada.

**Justificación:** Cumple C1-C3 sin acoplar aplicación a Supabase; el servidor es la fuente de verdad y la caché solo sirve lectura offline. Las mutaciones solo funcionan en línea (S2). Al aplicar una plantilla se vacían fechas, se aplican contactos vigentes y se avisa de los no vigentes (en línea lo calcula el servidor; sin conexión, contra los contactos cacheados).

**Pruebas:** Ver entrada de verificación.

**Riesgos o bloqueos:**
- `DAOPlantillasSupabase` y `DAOContactosVigentesSupabase` no se probaron contra Supabase (migración no aplicada en DEV; prohibido ejecutar contra DEV). Riesgo concreto a verificar: envío de `uuid[]`/`text[]` por PostgREST y código `23505` en la respuesta de supabase-js.
- `app.ts` ahora instancia el módulo al crear la app (`createClient` no hace red, pero el cliente Supabase se crea en `createApp`).
- Las plantillas cacheadas quedan en el dispositivo tras cerrar sesión (aisladas por `usuarioId`, no se borran al salir).
- No se implementó vaciado de caché al cerrar sesión ni la cola offline (HU-49, Andriy).

**Estado:** Implementado, verificado localmente (ver entrada de verificación)

**Siguiente acción:** Verificación completa.

---

### 2026-10-26T21:45:28-05:00 — HU-29 — Verificación local

**Fase:** Verificación

**Objetivo:** Ejecutar typecheck, pruebas y builds, incluida la suite SQL sobre un clúster PostgreSQL desechable.

**Estado anterior:** Código implementado sin ejecutar.

**Análisis técnico resumido:**
- Clúster temporal PostgreSQL 17.6 con `initdb` en el directorio scratchpad, puerto 55432, `listen_addresses=127.0.0.1`, base `treksafe_desechable`; el servicio de Windows existente no se tocó. Nota operativa: `pg_ctl start -w` desde la herramienta Bash no devolvió el control (quedó en segundo plano), pero el servidor sí arrancó (`pg_isready`: aceptando conexiones); el proceso terminó al detener el clúster.
- La suite de migraciones (guardas: host local y nombre con `desechable`) recreó el esquema `public`, aplicó `init_schema.sql`, `000` y `001` y verificó: registro de 000/001; 000 idempotente; 001 repetida falla; unicidad de nombre por usuario sin mayúsculas/espacios y permitida entre usuarios; trigger (versión +1, `actualizado_en` avanza, propietario y `creado_en` inmutables); CAS por versión; CHECK de nombre vacío/81 caracteres, tolerancia 0/481, 11 contactos, 21 acompañantes, versión 0 (y límites válidos aceptados); RLS y política en `plantillas_ruta` y `treksafe_migraciones`; sin FK entre `expediciones` y `plantillas_ruta`; borrar una plantilla no altera la expedición; cascada al borrar el usuario (no afecta a otro usuario); `.down.sql` revierte.

**Abstracciones propuestas o aplicadas:** Ninguna nueva.

**Principios y patrones:** —

**Alternativas evaluadas:** —

**Decisión adoptada:** HU-29 queda "Verificado localmente" (no Done).

**Cambios realizados:** Ninguno adicional en código tras la verificación. `backend/dist` y `frontend/dist` quedan ignorados por `.gitignore` (no aparecen en `git status`). Clúster detenido con `pg_ctl -m fast stop` (`pg_isready`: sin respuesta); el directorio `pgdata` se conserva en el scratchpad.

**Justificación:** Cumple las condiciones 1 y 2 de la sección 4.8 del plan; la 3 es esta bitácora.

**Pruebas (resultados reales):**
- `npm run typecheck --prefix backend` → exit 0.
- `npm run typecheck --prefix frontend` → exit 0.
- `npm test --prefix backend` (sin `TREKSAFE_PG_TEST_URL`) → 38 pruebas, 10 suites; 38 aprobadas, 0 fallos; la suite de migraciones aparece como omitida (`SKIP`, con motivo).
- `TREKSAFE_PG_TEST_URL=postgres://postgres@127.0.0.1:55432/treksafe_desechable npm run test:migraciones --prefix backend` → 12 pruebas, 2 suites; 12 aprobadas, 0 fallos, 0 omitidas.
- `npm run test:frontend-logica --prefix backend` (equivale a `node --import tsx --test ../frontend/src/lib/plantillasCuentaLogica.test.ts` desde `backend/`) → 9 aprobadas, 0 fallos.
- `npm run build:backend` → exit 0. `npm run build:frontend` → exit 0 (`tsc --noEmit` + `vite build`, PWA generada).
- Prueba HTTP (`rutasPlantillas.test.ts`, Express real en puerto 0 + `fetch` + JWT real firmado con `firmarToken`, DAO en memoria): C1 (201/200/400/409), C2 (dos tokens del mismo usuario), 409 `VERSION_OBSOLETA`, C3 (borrador con fechas nulas y contacto no vigente), escenario de calidad 4.9 (20 peticiones de otro usuario sobre la plantilla de A: todas 404/lista vacía, 0 respuestas con datos ajenos, plantillas de A intactas), id no UUID → 404, 401 sin token, 403 rescatista, 204 y segundo borrado 404.
- No se levantó el backend ni se ejecutó nada contra Supabase DEV; no se leyeron ni modificaron archivos `.env`.

**Riesgos o bloqueos:** Ver "Trabajo pendiente". No se probó la interfaz en navegador (solo typecheck/build).

**Estado:** Verificado localmente

**Siguiente acción:** Revisión del orquestador; aplicar 000/001 en DEV de forma coordinada.

---

### 2026-10-26T21:48:00-05:00 — HU-29 — Revisión independiente de la implementación

**Fase:** Pruebas / Integración

**Objetivo:**
Comprobar de forma independiente, sin depender del informe del subagente de implementación, que el trabajo respeta el plan y que los resultados declarados son reales.

**Estado anterior:**
Cambios sin confirmar en `feature/HU-29-plantillas-cuenta` (7 archivos modificados y archivos nuevos según `git status`).

**Análisis técnico resumido:**
- `CreadorPlan.prepararBorrador` invoca el Factory Method `crearBorrador` (protegido y abstracto) e impone las invariantes comunes: fechas nulas, contactos filtrados con `IContactosVigentes` y copias de los arreglos. `CreadorDesdePlantilla` solo redefine `crearBorrador` y devuelve `PlanDesdePlantilla`. No hay `switch` por tipo.
- `DAOPlantillasSupabase` filtra por `senderista_id` en todos sus métodos. `renombrar` es un único UPDATE condicionado por versión (compare-and-swap) y distingue `no_encontrada` de `version_obsoleta`. El error `23505` se traduce a `nombre_duplicado`. El cliente se recibe por constructor.
- Regla DIP (grep de `supabase-js`, `express` e `infrastructure/` en `application/` y `domain/`, sin contar pruebas): solo aparecen los seis servicios heredados de R1. Ningún archivo nuevo la incumple.

**Decisión adoptada:** Se aceptan las desviaciones ADR-06 y ADR-07. Queda registrado que las dos pruebas de `application/` importan dobles de `infrastructure/repositories/memoria`; solo afecta a pruebas, no a producción.

**Pruebas (ejecutadas por el orquestador, resultados reales):**
- `npm run typecheck --prefix backend` / `--prefix frontend` → OK / OK.
- `npm test --prefix backend` → 38 aprobadas, 0 fallos; la suite de migraciones se omite con motivo.
- `npm run test:frontend-logica --prefix backend` → 9/9.
- Clúster desechable reiniciado en 127.0.0.1:55432, `npm run test:migraciones --prefix backend` → 12/12 (incluye la ausencia de FK y que borrar una plantilla no altera expediciones). Clúster detenido después ("server stopped").
- `npm run build:backend` → exit 0; `npm run build:frontend` → OK (PWA generada). `dist/` ignorado por git.

**Riesgos o bloqueos:** DAO Supabase sin probar contra DEV; UI sin prueba manual en navegador.

**Estado:** Verificado localmente

**Siguiente acción:** Commit local en la rama de la HU; coordinar la aplicación de 000/001 en DEV.

---

## Matriz de criterios de aceptación

| HU | Criterio | Estado | Evidencia |
|----|----------|--------|-----------|
| HU-29 | C1. Propietario guarda, renombra y elimina una plantilla en su cuenta | Verificado localmente | `servicioPlantillas.test.ts`, `rutasPlantillas.test.ts` (DAO en memoria); SQL en `migraciones.test.ts`; DAO Supabase sin probar contra DEV |
| HU-29 | C2. Una segunda sesión del mismo usuario obtiene la plantilla guardada | Verificado localmente | `rutasPlantillas.test.ts` (dos tokens del mismo usuario); demo de dos dispositivos pendiente |
| HU-29 | C3. Crear desde plantilla pide fechas nuevas y valida contactos vigentes; borrar la plantilla no borra expediciones | Verificado localmente | `CreadorDesdePlantilla.test.ts` + contrato, `rutasPlantillas.test.ts` (borrador), `migraciones.test.ts` (sin FK; borrar plantilla no altera expediciones); creación real vía `POST /expediciones` existente |
| HU-36 | C1. Solo el propietario consulta los cambios de su plan | Planificado (bloqueado por HU-26/27/35) | — |
| HU-36 | C2. Edición, cancelación y ampliación con fecha, autor, antes/después | Planificado (bloqueado) | — |
| HU-36 | C3. Evento atómico con la operación, orden estable, sin contraseñas ni datos médicos | Planificado (bloqueado) | — |
| HU-41 | C1. Responsable vigente agrega entradas a incidente abierto | Planificado (bloqueado por HU-39) | — |
| HU-41 | C2. Entradas sin sobrescritura con autor y hora del servidor | Planificado (bloqueado) | — |
| HU-41 | C3. Rescatistas autorizados leen en orden estable; corrección = nueva entrada | Planificado (bloqueado) | — |
| HU-42 | C1. Solo el responsable cierra incidente localizado y abierto con resultado y resumen | Planificado (bloqueado por HU-39/41) | — |
| HU-42 | C2. Cierre de todo el incidente conservando bitácora | Planificado (bloqueado) | — |
| HU-42 | C3. Cierre operativo ≠ retorno confirmado; no confirma retorno | Planificado (bloqueado) | — |
| HU-50 | C1. Autoriza antes de descifrar (consentimiento, incidente abierto, responsable) | Planificado (bloqueado por HU-39/40) | — |
| HU-50 | C2. Relevo aceptado transfiere acceso; otros reciben rechazo sin ficha | Planificado (bloqueado) | — |
| HU-50 | C3. Auditoría de permitidos/denegados; correos sin datos médicos | Planificado (bloqueado) | — |

## Registro de decisiones arquitectónicas

| ID | Contexto | Alternativas | Decisión | Consecuencias |
|----|----------|--------------|----------|---------------|
| ADR-01 | Se necesita persistencia de plantillas privada por usuario | Tabla con RLS por `auth.uid()` / filtrado en backend con `service_role` | Filtrado obligatorio por `senderista_id` en cada método del DAO + RLS deny-by-default igual al resto del esquema | Coherente con el login propio (no Supabase Auth). La privacidad depende del DAO: se prueba con suite de contrato y prueba HTTP de aislamiento |
| ADR-02 | Contactos referenciados por la plantilla | Tabla puente con FK cascada / `uuid[]` sin FK | `uuid[]` + revalidación al preparar el borrador y validación del servidor al crear la expedición | Una fila por plantilla → operaciones atómicas sin RPC. Contactos borrados se reportan como no vigentes en vez de desaparecer silenciosamente |
| ADR-03 | Concurrencia entre dos dispositivos al renombrar | Último en escribir gana / versión optimista | Columna `version` incrementada por trigger; renombrar exige `versionEsperada` (compare-and-swap en un único `UPDATE ... WHERE version = $v`) → 409 `VERSION_OBSOLETA` | La caché local guarda la versión; un dispositivo desactualizado no pisa cambios |
| ADR-04 | Factory Method compartido HU-28/HU-29 | `switch` por tipo / clase creadora abstracta | `CreadorPlan` abstracta con `crearBorrador()` protegido y `prepararBorrador()` común | Jhon agrega `CreadorDesdeHistorial` sin tocar el código existente (OCP); misma suite de contrato (LSP) |
| ADR-06 | Cómo probar la lógica pura del frontend sin runner ni dependencias nuevas | Instalar vitest / probar solo con build / ejecutar con `tsx` del backend | Lógica en `plantillasCuentaLogica.ts` (sin alias `@/`), prueba `*.test.ts` junto a ella, ejecutada con `npm run test:frontend-logica --prefix backend`; `frontend/tsconfig.json` excluye `src/**/*.test.ts` | Sin dependencias nuevas; la prueba no corre en `npm test` del backend ni en el build del frontend |
| ADR-07 | Tipo compartido entre presentación y composición | Importar el tipo desde el controlador / desde infraestructura / tipo en `application` | `ModuloPlantillas` en `application/modulos/` | Presentación no importa infraestructura y la composición no importa presentación |
| ADR-05 | Registro de migraciones | Herramienta externa / SQL numerado + tabla de registro | `backend/migrations/NNN_huXX_descripcion.sql` + tabla `treksafe_migraciones` + `REGISTRO_APLICACION.md` | Sin dependencias nuevas; orden explícito revisable por Sebastián |

## Inventario de migraciones

| Archivo | Dependencia | Versión | Fecha | Entorno | Estado real |
|---------|-------------|---------|-------|---------|-------------|
| `000_registro_migraciones.sql` | `init_schema.sql` | 000 | 2026-10-26 | Solo clúster PostgreSQL 17 local desechable (aplicada y probada); NO aplicada en DEV | Escrita; verificada localmente; pendiente DEV |
| `001_hu29_plantillas_ruta.sql` (+ `.down.sql`) | 000 | 001 | 2026-10-26 | Solo clúster PostgreSQL 17 local desechable (aplicada y probada, incluida reversión); NO aplicada en DEV | Escrita; verificada localmente; pendiente DEV |

## Resultados de pruebas

| Fecha | Comando | Resultado |
|-------|---------|-----------|
| 2026-10-26 | `npm run typecheck --prefix backend` | OK (línea base) |
| 2026-10-26 | `npm run typecheck --prefix frontend` | OK (línea base) |
| 2026-10-26 | `npm test --prefix backend` | 6/6 aprobadas (línea base) |
| 2026-10-26 | `npm run typecheck --prefix backend` / `--prefix frontend` (tras HU-29) | OK / OK |
| 2026-10-26 | `npm test --prefix backend` (tras HU-29, sin `TREKSAFE_PG_TEST_URL`) | 38/38 aprobadas, 0 fallos; suite de migraciones omitida con motivo |
| 2026-10-26 | `TREKSAFE_PG_TEST_URL=postgres://postgres@127.0.0.1:55432/treksafe_desechable npm run test:migraciones --prefix backend` | 12/12 aprobadas, 0 omitidas, 0 fallos |
| 2026-10-26 | `npm run test:frontend-logica --prefix backend` | 9/9 aprobadas |
| 2026-10-26 | `npm run build:backend` / `npm run build:frontend` | OK / OK |

## Trabajo pendiente y coordinación

- **HU-29 pendiente para Done:** aplicar `000` y `001` en Supabase DEV en ventana coordinada (Marko/Ariana) y registrar en `backend/migrations/REGISTRO_APLICACION.md`; probar `DAOPlantillasSupabase`/`DAOContactosVigentesSupabase` contra DEV con datos ficticios (reutilizando `contratoIPlantillaDAO.ts`); demo de dos dispositivos (sección 4.10 del plan); probar la UI en navegador; revisión de Jhon; PR a `develop` (no existe aún); aceptación de Marko. Commits locales de la rama `feature/HU-29-plantillas-cuenta` pendientes de confirmar por el orquestador.
- **Jhon (HU-28):** revisar y aceptar el contrato `CreadorPlan` / `IPlanEditable` / suite de contrato; implementar `CreadorDesdeHistorial`.
- **Favio (HU-26/27/35, HU-39/40):** acordar contrato de eventos de plan (sección 5 del plan) e incidente/responsable/relevo (sección 6).
- **Fernando:** integrar `CRON_ENABLED`; coordinar plantilla de correo de rescate sin datos médicos (HU-50).
- **Ariana:** publicar `develop`.
- **Marko:** aplicar migraciones en DEV en ventana coordinada; aceptación funcional.

## Estado final

Cierre de la ejecución del 2026-10-26 (alcance: Sprint 1, puntos 1 y 2):

- **Implementado y verificado localmente:** contrato Factory Method compartido con HU-28 (punto 1) y HU-29 completa (punto 2). No se marca como Done.
- **Planificado, no implementado (por instrucción):** HU-36, HU-41, HU-42 y HU-50 (secciones 5 a 8 del plan).
- **Bloqueado o pendiente externo:** aplicación de las migraciones en DEV, prueba de los DAO Supabase contra DEV, `develop` inexistente, `CRON_ENABLED` sin integrar, HU-28/26/27/35/39/40 sin código.
- **Cambios compartidos realizados:** export de `campoCoordenadaOpcional` (`usuario.dto.ts`), montaje de `/plantillas` en `app.ts`, ruta en `App.tsx`, enlace en `PaginaPerfilSenderista.tsx`, montaje de componentes en `PaginaCrearExpedicion.tsx`, exclusión de `*.test.ts` en `frontend/tsconfig.json` y dos scripts en `backend/package.json`.
- **Pendiente de aceptación:** revisión de Jhon y Ariana, PR a `develop` y aceptación funcional de Marko.

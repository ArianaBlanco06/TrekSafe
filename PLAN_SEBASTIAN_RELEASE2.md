# Plan de desarrollo — TrekSafe Release 2 (Sebastián Chapman)

**Alcance planificado:** HU-29, HU-36, HU-41, HU-42, HU-50 + coordinación transversal de migraciones.
**Alcance autorizado para implementar en esta ejecución:** Sprint 1, punto 1 (contrato Factory Method compartido con HU-28) y punto 2 (HU-29 completa). **HU-36, HU-41, HU-42 y HU-50 quedan solo planificadas.**
**Base:** rama `Sebastian`, commit `f89d6af` (= `main`), 2026-10-26.
**Fuentes:** Product Backlog (F), Informe de Continuidad (I), Asignaciones R2 (A). Todo lo descrito como "propuesto" no existe aún en el código.

---

## 1. Diagnóstico del estado actual

### 1.1 Repositorio y procesos
| Aspecto | Estado verificado | Consecuencia |
|---|---|---|
| Ramas | `main`, `Sebastian` en `f89d6af`. No existe `develop` | Se trabaja en ramas locales por HU a partir de `Sebastian`; el PR a `develop` queda pendiente de que Ariana publique la rama |
| Migraciones | No existe `backend/migrations`. `sprint*_migration.sql` y `post_mvp_migration.sql` están obsoletas (README) | Sebastián crea la carpeta, la tabla de registro y la convención |
| `CRON_ENABLED` | No existe en `env.ts` ni en `main.ts` (el cron arranca siempre) | No se levanta una API local contra Supabase DEV en esta ejecución |
| Pruebas | `node --import tsx --test src/**/*.test.ts`; 6 pruebas | Las suites nuevas deben vivir en `backend/src/**` con sufijo `.test.ts` |
| Frontend | Sin runner de pruebas | Verificación por typecheck/build; lógica pura de caché probada con el `tsx` del backend si es posible sin nuevas dependencias |
| BD desechable | PostgreSQL 17 instalado localmente; Docker no disponible | Clúster temporal con `initdb` + `pg_ctl` en puerto propio para probar SQL |

### 1.2 Hallazgos de código relevantes
1. `ServicioExpedicion`/`ServicioRescate` reciben repositorios por constructor con valores por defecto concretos. Los controladores instancian servicios a nivel de módulo (no hay punto de ensamblaje).
2. `RepositorioExpedicion.crearExpedicion` hace 3 inserciones con compensación manual (no atómico) — pertenece a HU-07/Favio; no se toca.
3. `validarPropiedadContactos(senderistaId, ids)` valida existencia + propiedad → base de "contactos vigentes".
4. Borrar un contacto (`contactos_emergencia`) borra en cascada sus vínculos con expediciones.
5. Plantillas locales (`lib/offlineExpedicion.ts`): automáticas, máximo 12, clave global `route-templates` (no aisladas por usuario), sin versión, sin contactos.
6. `RepositorioUsuario.obtenerFichaMedica` descifra en el repositorio; `ServicioRescate.obtenerDetalleAlerta` devuelve la ficha a cualquier rescatista validado; `servicioAlertaRescate` + `rescueAlertEmail.ts` envían la ficha por correo.
7. `bitacoras_rescate`: única por (expedición, rescatista), `notas` se sobrescribe; estados `en_busqueda/localizados/cerrado`.
8. No hay entidad "incidente"; HU-39 debe introducirla.
9. `fichas_medicas.consentimiento_firmado` siempre TRUE (CHECK); revocar (HU-21) borra la ficha.
10. Errores: `ErrorAplicacion(codigoEstado, mensaje, codigo)` + `errorHandler` (zod → 400 con `detalles`).

---

## 2. Arquitectura y componentes relevantes

Flujo obligatorio: **Presentación → Aplicación → Dominio/contratos → Infraestructura**, con ensamblaje en un módulo de composición.

```
presentation/http/routes/rutasPlantillas.ts ──► controllers/controladorPlantillas.ts
                    │ (recibe módulo ensamblado)
                    ▼
application/services/servicioPlantillas.ts         application/creacion-plan/
   │  depende de                                     CreadorPlan (abstracta, Factory Method)
   ▼                                                 ├─ CreadorDesdePlantilla (Sebastián, HU-29)
domain/repositories/IPlantillaDAO.ts                 └─ CreadorDesdeHistorial (Jhon, HU-28 — NO implementar)
domain/repositories/IContactosVigentes.ts          IPlanEditable (producto) ◄─ PlanDesdePlantilla
                    ▲ implementan
infrastructure/repositories/DAOPlantillasSupabase.ts, DAOContactosVigentesSupabase.ts
infrastructure/repositories/memoria/DAOPlantillasMemoria.ts (pruebas)
infrastructure/composicion/moduloPlantillas.ts  (ensamblaje: único lugar que hace `new` de clases concretas)
```

Regla DIP verificable: ningún archivo de `application/` ni `domain/` nuevo importa `@supabase/supabase-js`, `express` ni `infrastructure/`.

---

## 3. Criterios de aceptación (copiados del Product Backlog, sin modificar)

- **HU-29:** 1. El propietario guarda, renombra y elimina una plantilla en su cuenta. 2. Una segunda sesión del mismo usuario obtiene la plantilla guardada. 3. Crear desde plantilla pide fechas nuevas y valida contactos vigentes. Borrar la plantilla no borra expediciones.
- **HU-36:** 1. Solo el propietario consulta los cambios de su plan. 2. Muestra edición, cancelación y ampliación con fecha, autor y valores relevantes antes y después. 3. Los eventos se registran con la operación y se ordenan de forma estable. Excluye contraseñas y datos médicos.
- **HU-41:** 1. El responsable vigente agrega entradas a un incidente abierto. 2. Las entradas se añaden sin sobrescribir las anteriores y guardan autor y hora del servidor. 3. Los rescatistas autorizados consultan la secuencia con orden estable. Una corrección se registra como otra entrada.
- **HU-42:** 1. Solo el responsable cierra un incidente localizado y abierto, con resultado y resumen no vacíos. 2. El cierre se aplica a todo el incidente y conserva su bitácora. 3. Distingue el cierre operativo del rescate del retorno confirmado por el senderista. No confirma su retorno automáticamente.
- **HU-50:** 1. El backend autoriza antes de descifrar, con consentimiento vigente, incidente abierto y responsable actual. 2. Un relevo aceptado transfiere el acceso. Los demás rescatistas reciben rechazo, sin ficha médica. 3. Audita accesos permitidos y denegados con actor, incidente, hora y motivo. Los correos de alerta ya no incluyen datos médicos en texto.

---

## 4. HU-29 — Gestionar plantillas personales entre dispositivos (IMPLEMENTAR)

**Principios:** SRP, OCP, DIP. **Patrones:** Factory Method, DAO. **Dependencias:** HU-07 (presente), HU-22 (presente), contrato HU-28 (se define aquí).

### 4.1 Problema
Las plantillas actuales son locales al dispositivo, automáticas y compartidas entre usuarios del mismo navegador. Se requiere gestión explícita en la cuenta, accesible desde otra sesión/dispositivo, privada, y una creación de plan desde plantilla que exija fechas nuevas y contactos vigentes, sin depender de la caché.

### 4.2 Punto 1 — Contrato Factory Method compartido con HU-28

**Producto abstracto** `backend/src/application/creacion-plan/IPlanEditable.ts`:
```ts
export type OrigenPlan = 'plantilla' | 'historial';
export interface IPlanEditable {
  readonly origen: OrigenPlan;
  readonly origenId: string;
  readonly lugarInicio: string;
  readonly lugarFin: string;
  readonly coordenadasInicio: string | null;
  readonly coordenadasFin: string | null;
  readonly minutosTolerancia: number;
  readonly idsContactosSugeridos: readonly string[];
  readonly nombresAcompanantes: readonly string[];
  describirOrigen(): string;            // p. ej. "Plantilla «Laguna 69»"
}
```

**Creador abstracto** `backend/src/application/creacion-plan/CreadorPlan.ts`:
```ts
export type BorradorPlan = {
  origen: OrigenPlan; origenId: string; descripcionOrigen: string;
  lugarInicio: string; lugarFin: string;
  coordenadasInicio: string | null; coordenadasFin: string | null;
  minutosTolerancia: number;
  idsContactos: string[];               // solo vigentes
  cantidadContactosNoVigentes: number;
  nombresAcompanantes: string[];
  horaInicio: null; horaRetornoEstimada: null;   // siempre vacías: "pide fechas nuevas"
  requiereFechasNuevas: true;
};
export abstract class CreadorPlan {
  constructor(protected readonly contactosVigentes: IContactosVigentes) {}
  /** Operación común (no se redefine): invoca el Factory Method y aplica invariantes. */
  async prepararBorrador(senderistaId: string, origenId: string): Promise<BorradorPlan> { ... }
  /** Factory Method: cada creador concreto decide qué producto IPlanEditable construir. */
  protected abstract crearBorrador(senderistaId: string, origenId: string): Promise<IPlanEditable>;
}
```
Invariantes que impone `prepararBorrador` para TODAS las variantes (por eso viven en la clase base y no en cada creador): fechas nulas; contactos filtrados con `IContactosVigentes`; no copia id, estado, alertas, confirmaciones, bitácora ni ficha médica (el `BorradorPlan` solo tiene los campos listados); devuelve copias de arrays (no comparte referencias con el producto).

**Suite de contrato reutilizable (LSP)** `backend/src/application/creacion-plan/contratoCreadorPlan.ts` (no termina en `.test.ts` para que no se ejecute sola): exporta `verificarContratoCreadorPlan(nombre, prepararEscenario)` donde `prepararEscenario()` devuelve `{ creador, senderistaId, origenIdPropio, origenIdAjeno, idsContactosVigentes, idsContactosNoVigentes }`. Comprueba: fechas nulas y `requiereFechasNuevas`; solo contactos vigentes y conteo de no vigentes; claves del borrador exactamente las del tipo (sin `id`, `estado`, `fichaMedica`, …); origen ajeno o inexistente → `ErrorAplicacion` 404. Jhon la ejecuta con `CreadorDesdeHistorial`.

**Para Jhon (HU-28):** crear `PlanDesdeHistorial implements IPlanEditable` y `CreadorDesdeHistorial extends CreadorPlan`, e invocar `verificarContratoCreadorPlan`. No requiere modificar `CreadorPlan` (OCP).

### 4.3 Punto 2 — Diseño de HU-29

| Clase / contrato | Archivo | Responsabilidad | Colaboradores |
|---|---|---|---|
| `PlantillaRuta` (tipo) | `domain/entities/PlantillaRuta.ts` | Datos de una plantilla de cuenta | — |
| `IPlantillaDAO` | `domain/repositories/IPlantillaDAO.ts` | Persistencia privada por propietario | — |
| `IContactosVigentes` | `domain/repositories/IContactosVigentes.ts` | `filtrarVigentes(senderistaId, ids): Promise<string[]>` (preserva el orden de entrada) | — |
| `ServicioPlantillas` | `application/services/servicioPlantillas.ts` | Reglas de guardar/listar/renombrar/eliminar; traduce resultados del DAO a `ErrorAplicacion` | `IPlantillaDAO`, `IContactosVigentes` |
| `PlanDesdePlantilla` | `application/creacion-plan/PlanDesdePlantilla.ts` | Producto concreto construido desde `PlantillaRuta` | — |
| `CreadorDesdePlantilla` | `application/creacion-plan/CreadorDesdePlantilla.ts` | Factory Method concreto: busca la plantilla del propietario y crea `PlanDesdePlantilla` | `IPlantillaDAO`, `IContactosVigentes` |
| `plantilla.dto.ts` | `application/dto/plantilla.dto.ts` | Esquemas zod de entrada | `campoCoordenadaOpcional` (exportar desde `usuario.dto.ts`, cambio mínimo DRY) |
| `DAOPlantillasSupabase` | `infrastructure/repositories/DAOPlantillasSupabase.ts` | Implementación supabase-js | `getSupabaseAdmin()` (recibir el cliente por constructor, con valor por defecto) |
| `DAOContactosVigentesSupabase` | `infrastructure/repositories/DAOContactosVigentesSupabase.ts` | Consulta `contactos_emergencia` por propietario | supabase |
| `DAOPlantillasMemoria` | `infrastructure/repositories/memoria/DAOPlantillasMemoria.ts` | Doble de prueba con la misma semántica (versión, unicidad sin mayúsculas, orden) | — |
| `ensamblarModuloPlantillas` | `infrastructure/composicion/moduloPlantillas.ts` | Punto de ensamblaje | todas las concretas |
| `crearControladorPlantillas` | `presentation/http/controllers/controladorPlantillas.ts` | Traduce HTTP ↔ casos de uso | módulo |
| `crearRutasPlantillas` | `presentation/http/routes/rutasPlantillas.ts` | Router con `middlewareAutenticacion` + `requerirRol('senderista')` | controlador |

**Contrato del DAO** (resultados discriminados; el DAO no conoce HTTP):
```ts
export type DatosPlantilla = { nombre; lugarInicio; lugarFin; coordenadasInicio: string|null; coordenadasFin: string|null;
  minutosTolerancia: number; idsContactos: string[]; nombresAcompanantes: string[] };
export type ResultadoCrearPlantilla = { tipo: 'ok'; plantilla: PlantillaRuta } | { tipo: 'nombre_duplicado' };
export type ResultadoRenombrarPlantilla =
  | { tipo: 'ok'; plantilla: PlantillaRuta } | { tipo: 'no_encontrada' }
  | { tipo: 'version_obsoleta'; versionActual: number } | { tipo: 'nombre_duplicado' };
export interface IPlantillaDAO {
  listarPorPropietario(senderistaId: string): Promise<PlantillaRuta[]>;   // actualizadoEn DESC, id ASC
  buscarPorId(senderistaId: string, plantillaId: string): Promise<PlantillaRuta | null>;
  crear(senderistaId: string, datos: DatosPlantilla): Promise<ResultadoCrearPlantilla>;
  renombrar(senderistaId: string, plantillaId: string, nombre: string, versionEsperada: number): Promise<ResultadoRenombrarPlantilla>;
  eliminar(senderistaId: string, plantillaId: string): Promise<boolean>;
}
```
Privacidad: **cada** método recibe `senderistaId` y filtra por él; una plantilla ajena se comporta como inexistente (no se revela su existencia).
Concurrencia: `renombrar` = un único `UPDATE ... WHERE id AND senderista_id AND version = versionEsperada` (compare-and-swap); el trigger incrementa `version` y fija `actualizado_en = now()` (hora del servidor). Si no actualiza fila, se consulta para distinguir `no_encontrada` de `version_obsoleta`. Código PG `23505` → `nombre_duplicado`.

### 4.4 Contratos de API (prefijo `/api/plantillas`, JWT de senderista)

| Método y ruta | Entrada | Éxito | Errores |
|---|---|---|---|
| `GET /` | — | 200 `{ plantillas: PlantillaDTO[] }` | 401, 403 |
| `POST /` | `{ nombre (1–80), lugarInicio (≥3), lugarFin (≥3), coordenadasInicio?, coordenadasFin?, minutosTolerancia (1–480, def. 30), idsContactos: uuid[] (0–10, sin repetidos), nombresAcompanantes: string[] (0–20, cada uno 2–200) }` | 201 `{ mensaje, plantilla }` | 400 validación / `CONTACTOS_INVALIDOS`; 409 `NOMBRE_DUPLICADO` |
| `PATCH /:id` | `{ nombre, versionEsperada (int ≥1) }` | 200 `{ mensaje, plantilla }` | 404 `PLANTILLA_NO_ENCONTRADA`; 409 `VERSION_OBSOLETA`; 409 `NOMBRE_DUPLICADO` |
| `DELETE /:id` | — | 204 | 404 `PLANTILLA_NO_ENCONTRADA` |
| `GET /:id/borrador` | — | 200 `{ borrador: BorradorPlan }` | 404 `PLANTILLA_NO_ENCONTRADA` |

`:id` no UUID → 404 (evita error 22P02 de PostgreSQL convertido en 500).
`PlantillaDTO = { id, nombre, lugarInicio, lugarFin, coordenadasInicio, coordenadasFin, minutosTolerancia, idsContactos, nombresAcompanantes, version, creadoEn, actualizadoEn }`.
Creación real de la expedición: el cliente completa fechas y contactos y usa el endpoint existente `POST /api/expediciones`, que vuelve a validar fechas futuras y contactos del propietario en el servidor. No existe FK entre `expediciones` y `plantillas_ruta` → borrar una plantilla no puede afectar expediciones.

### 4.5 Persistencia — migraciones

`backend/migrations/000_registro_migraciones.sql`
```sql
BEGIN;
CREATE TABLE IF NOT EXISTS treksafe_migraciones (
  version VARCHAR(16) PRIMARY KEY, nombre VARCHAR(200) NOT NULL, hu VARCHAR(32),
  aplicada_en TIMESTAMPTZ NOT NULL DEFAULT NOW(), aplicada_por VARCHAR(100) NOT NULL DEFAULT CURRENT_USER);
ALTER TABLE treksafe_migraciones ENABLE ROW LEVEL SECURITY;
-- política deny para anon/authenticated (igual que init_schema), creada de forma idempotente
INSERT INTO treksafe_migraciones (version, nombre, hu) VALUES ('000','registro_migraciones','transversal') ON CONFLICT DO NOTHING;
COMMIT;
```
`backend/migrations/001_hu29_plantillas_ruta.sql` (falla explícitamente si 001 ya está registrada):
- Tabla `plantillas_ruta`: `id UUID PK DEFAULT gen_random_uuid()`, `senderista_id UUID NOT NULL REFERENCES perfiles_senderista(usuario_id) ON DELETE CASCADE` (derecho ARCO: borrar la cuenta borra sus plantillas), `nombre VARCHAR(80) NOT NULL CHECK (length(btrim(nombre)) BETWEEN 1 AND 80)`, `lugar_inicio/lugar_fin VARCHAR(500) NOT NULL`, `coordenadas_inicio/fin VARCHAR(32)`, `minutos_tolerancia INTEGER NOT NULL DEFAULT 30 CHECK (BETWEEN 1 AND 480)`, `ids_contactos UUID[] NOT NULL DEFAULT '{}' CHECK (cardinality <= 10)`, `nombres_acompanantes TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality <= 20)`, `version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1)`, `creado_en`, `actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()`.
- `CREATE UNIQUE INDEX uq_plantillas_ruta_senderista_nombre ON plantillas_ruta (senderista_id, lower(btrim(nombre)))`.
- `CREATE INDEX idx_plantillas_ruta_senderista_actualizado ON plantillas_ruta (senderista_id, actualizado_en DESC, id)`.
- Trigger `BEFORE UPDATE`: `NEW.version := OLD.version + 1; NEW.actualizado_en := NOW(); NEW.senderista_id := OLD.senderista_id; NEW.creado_en := OLD.creado_en;` (el propietario y la fecha de creación son inmutables).
- RLS habilitado + política `treksafe_deny_anon_authenticated`.
- Registro en `treksafe_migraciones`.
- Archivo de reversión `001_hu29_plantillas_ruta.down.sql` (DROP; solo para base desechable, documentado).

`backend/migrations/README.md`: convención `NNN_huXX_descripcion.sql`, orden, reglas (no ejecutar `init_schema.sql` en bases compartidas, cada dueño escribe su SQL, Sebastián revisa), procedimiento de base desechable.
`backend/migrations/REGISTRO_APLICACION.md`: tabla archivo / versión / fecha / entorno / commit / ejecutor / resultado. Solo se registran aplicaciones reales.

Reserva de numeración (acordar con dueños): 002–009 Favio S1 (HU-26/27/35), 010 HU-36, 011–019 Favio S2 (HU-39/40), 020 HU-41, 021 HU-42, 022 HU-50. Otros devs toman números libres coordinando con Sebastián.

### 4.6 Frontend
- `services/plantillas.ts`: `listarPlantillasCuenta`, `guardarPlantillaCuenta`, `renombrarPlantillaCuenta(id, nombre, versionEsperada)`, `eliminarPlantillaCuenta`, `obtenerBorradorDesdePlantilla`.
- `lib/cachePlantillasCuenta.ts`: caché por usuario y versión sobre `readOfflineJson/writeOfflineJson`. Clave `plantillas-cuenta:v1:<usuarioId>`; sobre `{ esquema: 1, usuarioId, sincronizadoEn, plantillas }`. Lectura descarta el contenido si `esquema` o `usuarioId` no coinciden. El servidor es la fuente de verdad: cada lista en línea reemplaza la caché; cada mutación exitosa actualiza la caché. Sin mutaciones offline (la cola offline es HU-49 de Andriy). La lógica pura (clave, validación del sobre) se separa de la E/S para poder probarse.
- `components/plantillas/SelectorPlantillasCuenta.tsx`: lista "Mis plantillas"; en línea pide `GET /:id/borrador`; sin conexión construye el borrador desde la caché filtrando contactos contra los contactos cacheados. Aplica ruta, tolerancia, contactos vigentes y acompañantes; **vacía fechas** y muestra aviso si hubo contactos no vigentes.
- `components/plantillas/GuardarComoPlantilla.tsx`: nombre + guardar los datos actuales del formulario (solo en línea).
- `pages/PaginaPlantillas.tsx` en `/senderista/perfil/plantillas`: listar, renombrar en línea (envía `versionEsperada`; ante 409 recarga y avisa), eliminar con confirmación dentro de la página (sin `confirm()`); enlace desde `PaginaPerfilSenderista`.
- `PaginaCrearExpedicion.tsx`: cambios mínimos (montar los dos componentes y una función `aplicarBorrador`). Las "plantillas de ruta frecuente" automáticas de HU-22 se conservan sin cambios.

### 4.7 Estrategia de pruebas HU-29
| Suite (backend/src/…) | Tipo | Cubre |
|---|---|---|
| `application/creacion-plan/CreadorDesdePlantilla.test.ts` | Unidad + contrato | `verificarContratoCreadorPlan` para la variante plantilla; fechas nulas; contactos vigentes; origen ajeno 404; borrador sin campos de expedición |
| `infrastructure/repositories/memoria/DAOPlantillasMemoria.test.ts` | Contrato DAO (`contratoIPlantillaDAO.ts` reutilizable) | orden estable, privacidad por propietario, CAS de versión, nombre duplicado sin distinguir mayúsculas, eliminar ajeno = false |
| `application/services/servicioPlantillas.test.ts` | Unidad (DAO memoria + contactos falsos) | C1 CRUD, contactos ajenos rechazados al guardar, mapeo 404/409, eliminar no toca otras entidades |
| `presentation/http/routes/rutasPlantillas.test.ts` | HTTP (Express real + `fetch` + JWT real firmado con `firmarToken`, DAO memoria) | C2 dos tokens del mismo usuario; aislamiento A/B en GET/PATCH/DELETE/borrador; 401 sin token; 403 rescatista; 204/404 en doble borrado; id no UUID → 404 |
| `infrastructure/migraciones/migraciones.test.ts` | Integración SQL real (se omite si falta `TREKSAFE_PG_TEST_URL`) | Aplica `init_schema.sql`+000+001 **solo** sobre BD local desechable (guardas: host local y nombre con `desechable`); unicidad, trigger de versión, CHECKs, cascada ARCO, RLS, registro; **borrar plantilla no altera expediciones**; no existe FK desde `expediciones` hacia `plantillas_ruta` |
| Lógica de caché frontend | Unidad (si es posible con `tsx` del backend) | clave por usuario, sobre de otro usuario descartado, esquema distinto descartado |

Para las pruebas HTTP: fijar en `process.env` valores ficticios **solo si no existen** antes de importar `env.ts` (dotenv carga `backend/.env` con override si existe). Nunca imprimir el entorno.

### 4.8 Condiciones para considerar HU-29 verificable localmente
1. Typecheck backend y frontend, `npm test --prefix backend`, ambos builds en verde.
2. Suites de 4.7 aprobadas, incluida la de migraciones sobre el clúster desechable.
3. Bitácora con evidencia por criterio.
**No equivale a Done:** falta aplicar 000/001 en Supabase DEV (ventana coordinada con Marko/Ariana), probar `DAOPlantillasSupabase` contra DEV con datos ficticios, demo de dos dispositivos, revisión de Jhon (contrato y privacidad), PR a `develop` y aceptación de Marko.

### 4.9 Escenario de calidad (portabilidad de datos / privacidad)
Fuente: senderista B autenticado. Estímulo: 20 peticiones GET/PATCH/DELETE sobre ids de plantillas de A. Artefacto: API de plantillas. Respuesta: 404 sin cuerpo con datos de A. Medida: 0 respuestas con datos ajenos; plantillas de A intactas (verificado en prueba HTTP).

### 4.10 Demostración reproducible (cuando la migración esté en DEV)
1. Cuenta ficticia A en navegador 1: crear expedición → "Guardar como plantilla" (nombre "Laguna 69 fin de semana").
2. Navegador 2 / ventana privada, misma cuenta: `Perfil → Plantillas` muestra la plantilla (C2). Renombrar en 1, intentar renombrar en 2 con versión vieja → aviso de conflicto.
3. Nueva expedición → "Mis plantillas": fechas vacías; borrar un contacto antes y comprobar el aviso de contacto no vigente (C3).
4. Eliminar la plantilla: la expedición creada sigue en la lista (C3).
5. Cuenta B: no ve la plantilla de A.

---

## 5. HU-36 — Historial de cambios del plan (SOLO PLAN)

**SRP, ISP, DIP · DAO · Depende de HU-26, HU-27, HU-35 (Favio).**

- **Contrato de evento (acordar con Favio):** `{ id UUID, secuencia BIGINT identity, expedicion_id, tipo: 'edicion'|'cancelacion'|'ampliacion', actor_id, ocurrido_en (NOW() del servidor), valores_antes JSONB, valores_despues JSONB, motivo TEXT NULL, operacion_id UUID UNIQUE }`. `valores_*` solo con claves en lista blanca: `lugarInicio, lugarFin, coordenadasInicio, coordenadasFin, horaInicio, horaRetornoEstimada, minutosTolerancia, estado, idsContactos, nombresAcompanantes`. Nunca contraseñas, hashes ni datos médicos (lista blanca en SQL y en el mapeador TS).
- **Migración 010 `010_hu36_eventos_plan.sql`:** tabla `eventos_plan`, índice `(expedicion_id, ocurrido_en, secuencia)`, trigger que rechaza `UPDATE` (solo anexado), función interna `treksafe_registrar_evento_plan(...)` que sanea con lista blanca. Las RPC de Favio (`treksafe_editar_expedicion`, `treksafe_cancelar_expedicion`, `treksafe_ampliar_retorno`) llaman a esa función **dentro de la misma función PL/pgSQL** → atomicidad real. DELETE solo por cascada ARCO (documentado).
- **Interfaces (ISP):** `IRegistroEventosPlan` (anexar; usado por pruebas y, si Favio usa TS+pg, dentro de su transacción) y `ILectorEventosPlan.listarPorExpedicion(propietarioId, expedicionId)` (lectura). El lector no conoce el registrador.
- **Caso de uso:** `ConsultarHistorialCambios(lector, verificadorPropiedad)`; separado del historial general (`/expediciones/historial`). Endpoint `GET /api/expediciones/:id/cambios` → 404 si no es del propietario.
- **UI:** sección "Cambios del plan" en el detalle de la expedición.
- **Pruebas:** propietario/ajeno; tres tipos con antes/después; orden estable con eventos de igual `ocurrido_en` (desempate por `secuencia`); lista blanca (intentar registrar `contrasena`/`alergias` → descartado); atomicidad: forzar fallo del evento dentro de la RPC en BD desechable y comprobar que la mutación se revierte.
- **Verificable cuando:** RPC de Favio integradas y migración aplicada.

## 6. HU-41 — Bitácora cronológica del incidente (SOLO PLAN)

**SRP, ISP, DIP · DAO · Depende de HU-39.**
- **Supuesto de contrato HU-39 (acordar con Favio):** tabla `incidentes(id, expedicion_id, estado: 'abierto'|'localizado'|'cerrado' (o estado operativo separado), responsable_id, version, abierto_en, cerrado_en)` con índice único de un incidente no cerrado por expedición. El relevo (HU-40) actualiza `responsable_id` bloqueando la fila (`FOR UPDATE`).
- **Migración 020:** `entradas_bitacora_incidente(id, secuencia identity, incidente_id FK, autor_id FK perfiles_rescatista, tipo 'nota'|'correccion'|'cierre', texto (1–2000), corrige_entrada_id NULL FK self, registrado_en DEFAULT NOW())`; trigger que rechaza UPDATE/DELETE; RPC `treksafe_agregar_entrada_bitacora(p_incidente, p_autor, p_tipo, p_texto, p_corrige)` que hace `SELECT ... FOR UPDATE` del incidente y verifica `responsable_id = p_autor` y estado no cerrado en la misma transacción (evita carrera con la aceptación del relevo).
- **Interfaces:** `IEscritorBitacoraIncidente.agregar(...)`, `ILectorBitacoraIncidente.listar(incidenteId)` (orden `registrado_en, secuencia`). Casos de uso `AgregarEntradaBitacora`, `ConsultarBitacora`.
- **Lectura autorizada:** rescatistas validados (definir con Marko si se restringe a quienes confirmaron la alerta). La bitácora legada `bitacoras_rescate` se conserva (HU-14/HU-19).
- **Pruebas:** escritor ≠ responsable → 403; incidente cerrado → 409; tres entradas conservan orden; corrección referencia la original sin modificarla; UPDATE directo rechazado por trigger (BD desechable); tras relevo, el anterior recibe 403 y las entradas previas permanecen.

## 7. HU-42 — Cerrar incidente con informe (SOLO PLAN)

**SRP, DIP · Command, DAO · Depende de HU-39, HU-41.**
- **Command:** `ComandoCerrarIncidente` inmutable `{ comandoId (UUID del cliente), incidenteId, actorId, resultado: ResultadoRescate, resumen }` creado por `ComandoCerrarIncidente.crear(entrada)` (valida resultado y resumen no vacíos). `CerrarIncidente.ejecutar(comando): Promise<ResultadoCierre>` con `ResultadoCierre = { tipo: 'cerrado' | 'ya_cerrado_mismo_comando', informe }`. La identidad del comando permite repetición segura; sin jerarquía de comandos.
- **`ResultadoRescate` (propuesta a validar con Marko):** `'localizado_ileso' | 'localizado_con_lesiones' | 'evacuado' | 'fallecido' | 'falsa_alarma'`.
- **Migración 021:** `informes_cierre_incidente(id, incidente_id UNIQUE, comando_id UNIQUE, resultado, resumen CHECK no vacío, cerrado_por, cerrado_en DEFAULT NOW())`; RPC `treksafe_cerrar_incidente(...)`: bloquea incidente, valida responsable y estado `localizado` no cerrado, inserta informe, actualiza incidente a `cerrado`, anexa entrada `cierre` a la bitácora — todo en una transacción. **No modifica `expediciones.estado`** (el retorno lo confirma solo el senderista, HU-10).
- **Pruebas:** no responsable; incidente no localizado; resumen vacío; repetición con el mismo `comandoId` → mismo informe sin duplicar; otro comando sobre cerrado → 409; dos cierres concurrentes → un informe (BD desechable); bitácora intacta y con entrada de cierre; expedición sigue en `alerta`.

## 8. HU-50 — Ficha médica solo para el responsable vigente (SOLO PLAN)

**SRP, ISP, DIP · Facade, DAO · Depende de HU-05, HU-18, HU-39, HU-40.**
- **Separación de responsabilidades:**
  - `AutorizadorFichaIncidente.decidir(contexto): DecisionAcceso` — reglas puras: rescatista validado, incidente existe y abierto, `responsable_id === actor`, consentimiento vigente. Devuelve `{ permitido, motivo: 'permitido'|'no_responsable'|'incidente_cerrado'|'sin_consentimiento'|'incidente_inexistente' }`.
  - `IContextoAccesoFichaDAO.obtener(incidenteId)` — datos de decisión **sin texto cifrado**.
  - `ILectorFichaCifrada.obtenerSiResponsable(incidenteId, actorId)` — devuelve el texto cifrado solo si, en la misma consulta SQL, el actor sigue siendo responsable y el incidente está abierto (cierra la ventana de carrera con un relevo).
  - `IDescifradorFicha` — adaptador de `desencriptarCargaUtilMedica` (sin cambiar algoritmo ni derivación de clave).
  - `IAuditoriaAccesoMedico.registrar({ actorId, incidenteId, expedicionId, senderistaId, resultado, motivo })` con hora del servidor.
  - **Fachada** `FachadaFichaMedicaIncidente.consultar(actorId, incidenteId)`: contexto → decidir → auditar (siempre) → si permitido: leer cifrado → descifrar → devolver. El controlador solo llama a `consultar`.
- **Refactor necesario:** `RepositorioUsuario.obtenerFichaMedica` deja de usarse en rutas de rescate; `obtenerDetalleAlerta` deja de incluir `fichaMedica`; nuevo `GET /api/rescate/incidentes/:id/ficha-medica` (403 con motivo genérico, sin contenido). Logs sin contenido médico.
- **Correo (con Fernando):** `servicioAlertaRescate` deja de leer la ficha; `rescueAlertEmail.ts` reemplaza el bloque médico por "La ficha médica está disponible solo para el responsable vigente en la consola". Prueba que el HTML/texto generado no contiene campos médicos.
- **Migración 022:** `auditoria_acceso_medico` + `incidente_id`, `resultado ('permitido'|'denegado')`, `motivo`; consentimiento: definir con Marko si se añade `consentimiento_revocado_en` o se mantiene "revocar = borrar ficha".
- **Pruebas:** el descifrador falso registra llamadas → 0 llamadas cuando se deniega (autorización antes de descifrar); relevo aceptado mueve el acceso; incidente cerrado; sin consentimiento; auditoría de permitidos y denegados; escenario de calidad: 20 consultas de un no responsable → 0 fichas y 20 registros denegados.

---

## 9. Riesgos, decisiones y supuestos

| # | Riesgo / supuesto | Mitigación |
|---|---|---|
| R1 | HU-28 no existe; el contrato podría no encajar con el historial | Contrato mínimo basado en el producto común; suite de contrato; revisión de Jhon antes del PR |
| R2 | Sin `develop` ni `CRON_ENABLED` | Rama local por HU; no levantar API contra DEV; PR cuando exista `develop` |
| R3 | Migración no aplicada en DEV → `DAOPlantillasSupabase` sin prueba real | Prueba SQL en clúster desechable; prueba del DAO real pendiente y registrada |
| R4 | Caché local de plantillas automáticas (HU-22) sigue siendo global por dispositivo | Fuera del alcance de HU-29; se informa a Andriy (HU-49) |
| R5 | Anonimizar historial (HU-21) no borra plantillas | Borrar cuenta sí las borra (cascada). Decisión de producto pendiente con Marko |
| R6 | HU-36/41/42/50 dependen de contratos de Favio aún no escritos | Contratos propuestos en secciones 5–8 para acordar |
| S1 | "Contactos vigentes" = contactos que existen y pertenecen al senderista en el momento de crear | Coherente con `validarPropiedadContactos` |
| S2 | Las mutaciones de plantillas requieren conexión | Cola offline es HU-49 |

## 10. Orden detallado de implementación (esta ejecución)

1. Crear rama local `feature/HU-29-plantillas-cuenta` desde `Sebastian`.
2. Punto 1: `IPlanEditable`, `CreadorPlan`, `BorradorPlan`, `contratoCreadorPlan.ts`, `IContactosVigentes`.
3. Dominio HU-29: `PlantillaRuta`, `IPlantillaDAO`, `DAOPlantillasMemoria` + `contratoIPlantillaDAO.ts` + prueba.
4. `PlanDesdePlantilla`, `CreadorDesdePlantilla` + prueba de contrato.
5. `plantilla.dto.ts`, `ServicioPlantillas` + pruebas.
6. Migraciones 000/001 + README + REGISTRO + prueba sobre clúster desechable.
7. `DAOPlantillasSupabase`, `DAOContactosVigentesSupabase`, `moduloPlantillas.ts`.
8. Controlador, rutas, montaje en `app.ts` + prueba HTTP.
9. Frontend: servicio, caché por usuario, componentes, página, ruta, enlace.
10. Verificación completa (typecheck ×2, tests, builds ×2) y bitácora.
11. Commits locales por paso lógico en la rama de la HU (sin push, sin merge).

Fuera de esta ejecución: Sprint 1 puntos 3–5 (HU-36) y todo Sprint 2.

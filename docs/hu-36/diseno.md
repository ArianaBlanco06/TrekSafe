# HU-36: Historial de cambios del plan

Como senderista, quiero consultar el historial de cambios de mi plan de expedición para saber qué se editó, canceló o amplió, cuándo y por qué.

Issue: #37.

**Criterios de aceptación**

1. Solo el propietario consulta el historial; una expedición ajena responde igual que una inexistente.
2. Muestra ediciones (HU-26), cancelación (HU-27) y ampliaciones de retorno (HU-35) con valores anteriores y nuevos, fecha, autor y motivo.
3. El historial es cronológico y nunca expone contraseñas, datos médicos ni identificadores internos.

## Decisiones provisionales (pendientes de confirmar por el PO)

| Tema | Decisión por defecto |
|---|---|
| Ajena o inexistente | `404 EXPEDICION_NO_ENCONTRADA`, convención del repositorio. |
| Autor | «Tú» si el actor es el propietario; si no, «Otro usuario». Hoy `actor_id` siempre es el propietario y no hay FK a `usuarios`. |
| Contactos | Se muestra la cantidad antes → después, nunca los ids. |
| Orden | Cronológico ascendente (`ocurrido_en`, `id`), tal como lo entrega la API. |

## Persistencia

No se crea una tabla nueva: se lee `public.eventos_plan` (contrato en `docs/hu-26/diseno.md`). En Supabase **solo registran las RPC** 003 (HU-26), 005 (HU-27) y 007 (HU-35), en la misma transacción que suben la versión; esas RPC no se modifican y no hay escritura desde TypeScript. La sección 5 de `PLAN_SEBASTIAN_RELEASE2.md` (tabla con `valores_antes`/`valores_despues`) queda obsoleta; solo se reutiliza el número de migración, renumerado de `010` a `012` porque develop asignó `010` a HU-32 (`011` ya era de HU-29).

`backend/migrations/012_hu36_eventos_plan_solo_anexado.sql` (requiere `002` y `006`, re-ejecutable, no reescribe filas):

| Pieza | Efecto |
|---|---|
| `treksafe_sanear_cambios_evento_plan(jsonb)` | Conserva solo los campos de la lista blanca con subclaves `antes`/`despues`. |
| `trg_eventos_plan_antes_de_insertar` | Sanea `cambios` y fija `ocurrido_en = now()`. |
| `trg_eventos_plan_solo_anexado` (UPDATE) | Solo permite la anonimización ARCO: `cambios = '{}'`, `motivo` nulo y el resto de columnas sin cambios. |
| `trg_eventos_plan_sin_borrado` (DELETE) | Rechaza el borrado mientras la expedición del evento exista. En la cascada de `fk_eventos_plan_expedicion` (borrado de expedición o de cuenta) la expedición ya no es visible y el borrado pasa. Así también se rechaza un DELETE lanzado desde otro trigger o función, que con `pg_trigger_depth()` habría pasado. |
| `trg_eventos_plan_sin_truncate` | Rechaza TRUNCATE. |
| Permisos | `service_role`: SELECT, INSERT y UPDATE (cambios, motivo); sin UPDATE de tabla, DELETE ni TRUNCATE. |

Los rechazos usan el mensaje `EVENTO_PLAN_INMUTABLE`. Lista blanca: `lugarInicio`, `lugarFin`, `coordenadasInicio`, `coordenadasFin`, `horaInicio`, `horaRetornoEstimada`, `minutosTolerancia`, `idsContactos`, `nombresAcompanantes` y `estado`.

Fuentes únicas y sincronía (cada una con su prueba):

| Constante | Debe coincidir con |
|---|---|
| `CAMPOS_EVENTO_PLAN` (`domain/value-objects/camposEventoPlan.ts`) | La lista blanca de la 012 y `CAMPOS_CAMBIO_PLAN` del frontend |
| `TIPOS_EVENTO_PLAN` (`domain/value-objects/tiposEventoPlan.ts`) | `tipo IN (...)` de la 002 y `TIPOS_CAMBIO_PLAN` del frontend |

### Anonimizado y «sin detalle»

`anonimizado` se calcula con `esEventoAnonimizado` sobre la fila **cruda**, antes de sanear: es `true` solo si `cambios` es un objeto vacío y `motivo` es nulo, que es lo que deja la anonimización ARCO. Un evento cuyos campos descarta el saneamiento (por ejemplo, una clave desconocida) queda con `cambios = {}` pero `anonimizado = false`. El DTO solo copia el valor. En pantalla:

- anonimizado → «Detalle eliminado por privacidad.»;
- no anonimizado, sin filas, motivo ni ampliación → «Sin detalle disponible.».

## API

`GET /api/expediciones/:id/cambios` — JWT de senderista, `Cache-Control: no-store`.

| Código | Caso |
|---|---|
| 200 | Historial propio; `cambios` puede ser una lista vacía. |
| 400 | `id` no es un UUID. |
| 401 | Sin sesión o JWT inválido o expirado. |
| 403 | Rol distinto de senderista (`PROHIBIDO`). |
| 404 | Expedición ajena o inexistente (`EXPEDICION_NO_ENCONTRADA`); no se consultan sus eventos. |
| 500 | `HISTORIAL_CAMBIOS_NO_DISPONIBLE`, sin detalles internos. |

```json
{
  "expedicionId": "…",
  "cambios": [
    {
      "id": "…", "tipo": "EDITADA", "ocurridoEn": "2026-11-01T09:00:00.000Z", "version": 2,
      "autor": { "esPropietario": true }, "motivo": null, "anonimizado": false,
      "cambios": [{ "campo": "lugarFin", "antes": "Laguna 69", "despues": "Nevado Ishinca" }]
    }
  ]
}
```

La respuesta no incluye `operacionId`, `senderistaId` ni `actorId`. Los campos de cada entrada siguen el orden de `CAMPOS_EVENTO_PLAN`.

**Precisión de fechas:** `ocurridoEn` se normaliza a ISO canónico en milisegundos y UTC (`new Date(v).toISOString()`); PostgREST entrega `timestamptz` con microsegundos y desfase. La base ordena en microsegundos (`ORDER BY ocurrido_en, id`), así que dos eventos distintos en el mismo milisegundo pueden mostrar la misma fecha y conservar su orden.

## Tarjetas CRC

| Clase: `ConsultarHistorialCambios` (`backend/src/application/use-cases/ConsultarHistorialCambios.ts`) | |
|---|---|
| **Responsabilidades** | **Colaboradores** |
| Comprobar la propiedad antes de leer eventos y responder 404 si no es propietario | `IPropiedadExpedicion` |
| Listar los eventos propios en orden y proyectarlos a la respuesta | `ILectorEventosPlan`, `aEntradaHistorialCambios` |

| Clase: `EventosPlanDAOSupabase` (solo lectura, `ILectorEventosPlan`) | |
|---|---|
| **Responsabilidades** | **Colaboradores** |
| Leer `eventos_plan` filtrando por expedición y propietario, con `COLUMNAS_EVENTO_PLAN` y orden `ocurrido_en, id` | `SupabaseClient` |
| Descartar tipos desconocidos, sanear `cambios`, calcular `anonimizado` desde la fila cruda y normalizar `ocurridoEn` | `esTipoEventoPlan`, `sanearCambios`, `esEventoAnonimizado` |
| Traducir fallos a 500 sin detalles | `errorHistorialCambiosNoDisponible` |

| Clase: `EventosPlanDAOMemoria` (`IEventosPlanDAO` = lector + registro) | |
|---|---|
| **Responsabilidades** | **Colaboradores** |
| Sustituto con la semántica de la 012: anexar, sanear, fijar `ocurridoEn` con su reloj | `IReloj`, `sanearCambios` |
| Rechazar un `operacionId` repetido sin sobrescribir | `errorOperacionYaRegistrada` |

`IRegistroEventosPlan` aplica solo a escritores desde TypeScript; hoy, solo la memoria.

## Principios SOLID

- **SRP:** el caso de uso orquesta; el DTO proyecta; `sanearCambios` filtra; el DAO lee; la propiedad se comprueba aparte. En el frontend: servicio, presentación pura y página.
- **OCP:** no se modifican las RPC, `IExpedicionDAO` ni `ExpedicionDAOSupabase`.
- **LSP:** el contrato del lector (`testing/contratoLectorEventosPlan.ts`) se cumple en memoria y en PostgreSQL real, mediante un puente fetch que traduce las consultas del SDK a SQL (no es PostgREST). El contrato de registro (`testing/contratoRegistroEventosPlan.ts`) solo lo cumple la memoria; en Supabase registran las RPC, cubiertas por la suite SQL.
- **ISP:** `ILectorEventosPlan` e `IRegistroEventosPlan` separados; `IPropiedadExpedicion` de un método. Supabase implementa solo el lector.
- **DIP:** inyección por constructor, composición en `app.ts` y fuentes inyectables en la página. Parámetros en orden `(senderistaId, expedicionId)`.

## Frontend

- Ruta `/senderista/expedicion/:id/cambios` (`PaginaHistorialCambiosPlan`), enlazada como «Ver cambios» desde la lista de expediciones y desde el historial de montaña.
- Estados: cargando, sin conexión, no encontrada, error con reintento, vacío, evento anonimizado, evento sin detalle y lista.
- Solo en línea: no escribe en `localStorage` ni en el almacenamiento offline. El worker ya trata `/api/**` como `NetworkOnly`; la prueba `tests/pwa/privacidad.spec.ts` incluye esta URL.
- `lib/historialCambiosPresentacion.ts` traduce tipos y campos, formatea fechas con `es-PE` (mismas opciones que el historial de montaña, reloj de 12 horas) y zona horaria opcional para pruebas, muestra «Sin valor» para nulos, contactos como cantidad y los minutos ampliados (`después − antes`).

## Pruebas

| Archivo | Cubre |
|---|---|
| `backend/src/domain/value-objects/camposEventoPlan.test.ts` | Lista blanca (CA-03), `esEventoAnonimizado`, sincronía con la 012 y con el frontend |
| `backend/src/domain/value-objects/tiposEventoPlan.test.ts` | Guarda de tipos, sincronía con la 002 y con el frontend |
| `backend/src/infrastructure/repositories/memoria/EventosPlanDAOMemoria.test.ts` | Contratos del lector y del registro |
| `backend/src/infrastructure/repositories/EventosPlanDAOSupabase.test.ts`, `PropiedadExpedicionSupabase.test.ts` | Consultas PostgREST, `select` sin `*`, saneamiento, anonimizado desde la fila cruda, ISO canónico, sin `registrar`, errores |
| `backend/src/application/use-cases/ConsultarHistorialCambios.test.ts` | CA-01, CA-02, CA-03 y copia de `anonimizado` en el DTO |
| `backend/src/presentation/http/routes/rutasHistorialCambios.test.ts` | 200, 200 vacío, 404 ajena/inexistente, 401, 403, 400, 500 y `no-store` |
| `backend/migrations/tests/hu36_eventos_plan_solo_anexado.test.sql` | Lista blanca, reloj, inmutabilidad, permisos reales de `service_role`, ARCO, DELETE indirecto desde otro trigger, cascadas como `service_role` y RPC de cancelación |
| `backend/src/testing/hu36Postgres.integration.test.ts` | Contrato del lector contra PostgreSQL real, RPC de cancelación, ARCO real y caso de uso con adaptadores reales (requiere `HU36_TEST_DATABASE_URL`) |
| `frontend/src/lib/historialCambiosPresentacion.test.ts`, `frontend/src/pages/PaginaHistorialCambiosPlan.test.tsx` | Formato (zona horaria fija), «sin detalle» y estados de la pantalla |

Suite local desechable (SQL e integración Node). Emula los privilegios por defecto de Supabase para `service_role` después de `init_schema.sql`, que no le concede nada:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File backend/scripts/test-hu36-postgres.ps1 -PostgresBin "C:\Program Files\PostgreSQL\17\bin"
```

## Pendientes y deuda

- Confirmar el número `012` con Ariana (antes `010`, asignado a HU-32 en develop) y los triggers con Favio; las decisiones de producto con Marko.
- Aplicar `012` en DEV (no se ha aplicado; el registro de aplicación lo mantiene el equipo).
- Deuda: un formateador de fechas común para esta vista y `PaginaHistorialExpediciones`.
- El puente de pruebas no es PostgREST: no valida el despliegue en Supabase DEV.

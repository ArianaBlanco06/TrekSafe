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

No se crea una tabla nueva: se lee `public.eventos_plan` (contrato en `docs/hu-26/diseno.md`), que escriben las RPC de HU-26, HU-27 y HU-35 dentro de su transacción. Esas RPC no se modifican. La sección 5 de `PLAN_SEBASTIAN_RELEASE2.md` (tabla con `valores_antes`/`valores_despues`) queda obsoleta; solo se reutiliza el número `010`.

`backend/migrations/010_hu36_eventos_plan_solo_anexado.sql` (requiere `002` y `006`, re-ejecutable, no reescribe filas):

| Pieza | Efecto |
|---|---|
| `treksafe_sanear_cambios_evento_plan(jsonb)` | Conserva solo los campos de la lista blanca con subclaves `antes`/`despues`. Igual que `CAMPOS_EVENTO_PLAN` en TypeScript (una prueba lo comprueba). |
| `trg_eventos_plan_antes_de_insertar` | Sanea `cambios` y fija `ocurrido_en = now()`. |
| `trg_eventos_plan_solo_anexado` (UPDATE) | Solo permite la anonimización ARCO: `cambios = '{}'`, `motivo` nulo y el resto de columnas sin cambios. |
| `trg_eventos_plan_sin_borrado` (DELETE) | Rechaza el borrado directo; deja pasar la cascada desde `expediciones` (`pg_trigger_depth() >= 2`). |
| `trg_eventos_plan_sin_truncate` | Rechaza TRUNCATE. |
| Permisos | `service_role`: SELECT, INSERT y UPDATE (cambios, motivo); sin UPDATE de tabla, DELETE ni TRUNCATE. |

Los rechazos usan el mensaje `EVENTO_PLAN_INMUTABLE`. Lista blanca: `lugarInicio`, `lugarFin`, `coordenadasInicio`, `coordenadasFin`, `horaInicio`, `horaRetornoEstimada`, `minutosTolerancia`, `idsContactos`, `nombresAcompanantes` y `estado`.

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
      "id": "…", "tipo": "EDITADA", "ocurridoEn": "2026-11-01T09:00:00Z", "version": 2,
      "autor": { "esPropietario": true }, "motivo": null, "anonimizado": false,
      "cambios": [{ "campo": "lugarFin", "antes": "Laguna 69", "despues": "Nevado Ishinca" }]
    }
  ]
}
```

La respuesta no incluye `operacionId`, `senderistaId` ni `actorId`. Los campos de cada entrada siguen el orden de `CAMPOS_EVENTO_PLAN`. `anonimizado` es `true` cuando la anonimización ARCO vació `cambios` y `motivo`.

## Tarjetas CRC

| Clase: `ConsultarHistorialCambios` (`backend/src/application/use-cases/ConsultarHistorialCambios.ts`) | |
|---|---|
| **Responsabilidades** | **Colaboradores** |
| Comprobar la propiedad antes de leer eventos y responder 404 si no es propietario | `IPropiedadExpedicion` |
| Listar los eventos propios en orden y proyectarlos a la respuesta | `ILectorEventosPlan`, `aEntradaHistorialCambios` |

| Clase: `EventosPlanDAOSupabase` / `EventosPlanDAOMemoria` | |
|---|---|
| **Responsabilidades** | **Colaboradores** |
| Leer `eventos_plan` filtrando por expedición y propietario, con columnas explícitas y orden `ocurrido_en, id` | `SupabaseClient` / `IReloj` |
| Sanear `cambios` al leer y al registrar | `sanearCambios` |
| Registrar solo con INSERT; un `operacionId` repetido es 409 `OPERACION_YA_REGISTRADA` | `ErrorAplicacion` |

`registrar` no se usa en producción (las RPC siguen registrando); existe porque el backlog pide el contrato de registro y ambas implementaciones pasan `backend/src/testing/contratoEventosPlanDAO.ts`.

## Principios SOLID

- **SRP:** el caso de uso orquesta; el DTO proyecta; `sanearCambios` filtra; el DAO persiste; la propiedad se comprueba aparte. En el frontend: servicio, presentación pura y página.
- **OCP:** no se modifican las RPC, `IExpedicionDAO` ni `ExpedicionDAOSupabase`.
- **LSP:** memoria y Supabase cumplen el mismo contrato.
- **ISP:** `ILectorEventosPlan` e `IRegistroEventosPlan` separados; `IPropiedadExpedicion` de un método.
- **DIP:** inyección por constructor, composición en `app.ts` y fuentes inyectables en la página.

## Frontend

- Ruta `/senderista/expedicion/:id/cambios` (`PaginaHistorialCambiosPlan`), enlazada como «Ver cambios» desde la lista de expediciones y desde el historial de montaña.
- Estados: cargando, sin conexión, no encontrada, error con reintento, vacío, evento anonimizado y lista.
- Solo en línea: no escribe en `localStorage` ni en el almacenamiento offline. El worker ya trata `/api/**` como `NetworkOnly`; la prueba `tests/pwa/privacidad.spec.ts` incluye esta URL.
- `lib/historialCambiosPresentacion.ts` traduce tipos y campos, formatea fechas con `lib/fechaLocal.ts`, muestra «Sin valor» para nulos, contactos como cantidad y los minutos ampliados (`después − antes`).

## Pruebas

| Archivo | Cubre |
|---|---|
| `domain/value-objects/camposEventoPlan.test.ts` | Lista blanca (CA-03) y coincidencia con la migración 010 |
| `infrastructure/repositories/memoria/EventosPlanDAOMemoria.test.ts` | Contrato: anexar, duplicado sin sobrescribir, orden con empates, filtro por propietario, sin actualizar/eliminar |
| `infrastructure/repositories/EventosPlanDAOSupabase.test.ts`, `PropiedadExpedicionSupabase.test.ts` | Consultas PostgREST, `select` sin `*`, saneamiento, POST sin upsert, errores |
| `application/use-cases/ConsultarHistorialCambios.test.ts` | CA-01, CA-02 y CA-03 |
| `presentation/http/routes/rutasHistorialCambios.test.ts` | 200, 200 vacío, 404 ajena/inexistente, 401, 403, 400, 500 y `no-store` |
| `migrations/tests/hu36_eventos_plan_solo_anexado.test.sql` | Lista blanca, reloj, inmutabilidad, permisos reales de `service_role`, ARCO, cascadas y RPC de cancelación |
| `frontend/src/lib/historialCambiosPresentacion.test.ts`, `frontend/src/pages/PaginaHistorialCambiosPlan.test.tsx` | Formato y estados de la pantalla |

Suite SQL local desechable:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File backend/scripts/test-hu36-postgres.ps1 -PostgresBin "C:\Program Files\PostgreSQL\17\bin"
```

## Pendientes

- Confirmar el número `010` con Ariana y los triggers con Favio; las decisiones de producto con Marko.
- Aplicar `010` en DEV (no se ha aplicado; el registro de aplicación lo mantiene el equipo).
- `pg_trigger_depth()` distingue la cascada del borrado directo; si resultara frágil, la alternativa es depender solo del `REVOKE DELETE`.

# HU-42: Cerrar un incidente con informe

Como rescatista responsable de un incidente, quiero cerrarlo con un informe (resultado y resumen) para que quede constancia del rescate sin borrar la bitácora y sin dar por confirmado el retorno del senderista.

**Criterios de aceptación y trazabilidad a pruebas**

| CA | Enunciado | Pruebas principales |
|---|---|---|
| CA-1 | Solo el responsable vigente cierra un incidente localizado (y no cerrado), con resultado y resumen obligatorios. | SQL casos 3, 4, 5, 6 y 12; contrato del DAO (cerrar, abierto, no responsable, inexistente, relevo); `rutasCierreIncidente.test.ts` (400, 403, 404, 409, 201); concurrencia (a); `ComandoCerrarIncidente.test.ts`; `CierreIncidente.test.tsx` |
| CA-2 | El cierre afecta a todo el incidente y conserva la bitácora; un solo informe por incidente. | SQL casos 7, 8, 9 y 11; contrato (bitácora conservada, `agregar` tras el cierre, un único informe); concurrencia (b), (b2), (c), (d1), (d2), (d3), (e); `rutasCierreIncidente.test.ts` (GET de la bitácora tras el cierre, 409) |
| CA-3 | El cierre operativo no es el retorno: no confirma el retorno del senderista ni toca la expedición. | SQL caso 10 (la fila de `expediciones` queda idéntica con `alerta` y con `completada`; sin eventos, avisos ni outbox); contrato (la expedición sigue en `alerta`); `cierreIncidente.dto.test.ts` (`tipoCierre`, `retornoConfirmadoPorSenderista`); `cierreIncidente.test.ts` (la 025 no contiene `UPDATE public.expediciones`); `InformeCierreIncidente.test.tsx` |

## Reglas

| Regla | Decisión |
|---|---|
| Quién cierra | Solo el responsable vigente, leído de `incidentes.responsable_id` dentro de la transacción y con la fila bloqueada `FOR UPDATE` desde el principio (contrato de HU-41). |
| Desde qué estado | Solo `localizado` (D2). Un incidente `abierto` da `INCIDENTE_NO_LOCALIZADO`; uno `cerrado`, `INCIDENTE_CERRADO`. |
| Cómo se llega a `localizado` | HU-42 añade "Marcar persona localizada" (RPC `treksafe_marcar_incidente_localizado`): `abierto → localizado`, solo el responsable, idempotente, con una nota fija en la bitácora (hallazgo H2: nada más hacía esa transición). |
| Qué se cierra | Un solo `UPDATE` de `estado = 'cerrado'`, `cerrado_en` y `version + 1` (cumple `chk_incidentes_cierre`). |
| Qué NO se toca | `expediciones`: ni el estado ni la versión ni ninguna otra columna. El retorno lo confirma solo el senderista (HU-10) y puede hacerlo después del cierre. |
| Informe | Tabla `informes_cierre_incidente`: uno por incidente, solo anexado, hora del servidor, resultado de un catálogo cerrado y resumen de 1 a 2000 caracteres. |
| Bitácora | El resumen se anexa como entrada `cierre` con la función interna de HU-41 (`operacion_id` = `comando_id`). Las entradas previas no cambian; la de cierre queda al final. Tras el cierre la escritura da `INCIDENTE_CERRADO` y la lectura sigue disponible. |
| Actor | Siempre el del JWT. El cuerpo es `.strict()`: `rescatistaId`, `estadoExpedicion` o `confirmarRetorno` dan 400. |
| Datos médicos | Ninguno: la tabla no tiene columnas médicas, el catálogo no incluye estado de salud, el resumen es texto libre con aviso fijo en la interfaz. |

## Decisiones provisionales (todas pendientes de confirmar con Marko; D1 también con Jhon)

| # | Decisión | Valor provisional | Dónde se cambia |
|---|---|---|---|
| D1 | Catálogo de resultados | `localizado_sin_asistencia`, `asistido_en_terreno`, `evacuado`, `falsa_alarma`. Se excluyen `fallecido` y `con_lesiones` (planes anteriores) por ser estado de salud: **confirmar con Jhon (privacidad) y con Marko**. | `RESULTADOS_RESCATE` (backend), `chk_informes_cierre_resultado` y la validación de la RPC (025), `RESULTADOS_RESCATE` y `ETIQUETAS_RESULTADO_RESCATE` (frontend). Una prueba de coherencia une backend y SQL. |
| D2 | Estados desde los que se cierra | Solo `localizado`; HU-42 añade "marcar localizada" (`abierto → localizado`, solo el responsable). | `ESTADOS_INCIDENTE_CERRABLES` y la línea `v_inc.estado <> 'localizado'` de la RPC. |
| D3 | Rastro de "localizado" en la bitácora | Entrada `nota` con el texto fijo `Persona localizada. El incidente pasa a estado localizado.` (no se altera el `CHECK` de la 019). | `TEXTO_ENTRADA_LOCALIZADO` y la constante de la RPC. |
| D4 | Códigos HTTP | Los mismos que HU-41: 403 `NO_ES_RESPONSABLE` (con `responsableVigente`), 404, 409 (`INCIDENTE_NO_LOCALIZADO`, `INCIDENTE_CERRADO`, `OPERACION_YA_REGISTRADA`), 400. Nunca 401 por negocio. | `RESPUESTAS_CIERRE`. |
| D5 | Qué ve el senderista | Nada nuevo: sin endpoint ni aviso; su expedición sigue en `alerta` y puede confirmar su retorno. | Futuro (HU-46 u otra). |
| D6 | Alerta tras el cierre | Sigue en la lista de alertas (sin responsable). En el detalle se ve "Rescate cerrado" con el informe y la bitácora en solo lectura. `BloqueCoordinacion` no cambia: asumir otra vez abre un **incidente nuevo**. | Si Marko quiere bloquear la nueva asunción o marcarla en la lista, es un cambio de HU-39 o de `ServicioRescate`, en una HU aparte. |
| D7 | Límite del resumen | 1 a 2000 caracteres tras recortar (igual que la bitácora). | `LIMITE_RESUMEN_CIERRE`. |

Códigos de error de negocio (en SQL `RAISE EXCEPTION '<CODIGO>'`; en TypeScript `ErrorCierreIncidente`):

| Código | HTTP | Cuándo |
|---|---|---|
| `DATOS_INVALIDOS` | 400 | Parámetros nulos, resultado fuera del catálogo, resumen vacío o de más de 2000 caracteres |
| `NO_ES_RESPONSABLE` | 403 | El actor no es el responsable vigente. `DETAIL` con `{"id","nombreCompleto"}`; extras `responsableVigente` |
| `INCIDENTE_NO_ENCONTRADO` | 404 | No existe el incidente |
| `INCIDENTE_NO_LOCALIZADO` | 409 | Se intenta cerrar un incidente que aún no está localizado |
| `INCIDENTE_CERRADO` | 409 | El incidente ya está cerrado (otro comando) |
| `OPERACION_YA_REGISTRADA` | 409 | El `comando_id`/`operacion_id` ya se usó con otros datos u otro actor, o en otra operación (nota, incidente, evento del plan) |
| `INFORME_CIERRE_INMUTABLE` | solo SQL | UPDATE, DELETE directo o TRUNCATE sobre el informe |

Ningún rechazo de negocio devuelve 401: el frontend lo interpreta como sesión vencida.

## Tarjetas CRC

| Clase: `ComandoCerrarIncidente` (`application/commands`) | |
|---|---|
| **Responsabilidades** | **Colaboradores** |
| Llevar la identidad (`comandoId`, que también es `operacionId` por `Comando<T>`) y los parámetros (incidente de la ruta, rescatista del JWT, resultado, resumen) | `cuerpoCerrarIncidenteSchema`, `cerrarIncidenteSchema` |
| Validar al construirse (cuerpo `.strict()`, UUID, catálogo, resumen 1..2000) y quedar inmutable | `Comando<ResultadoCierre>` |

| Clase: `CerrarIncidente` (`application/use-cases`) | |
|---|---|
| **Responsabilidades** | **Colaboradores** |
| Ejecutar el comando y devolver `{tipo, informe}` (`cerrado` o `ya_cerrado_mismo_comando`) | `ComandoCerrarIncidente` |
| Delegar el cierre atómico e idempotente a la persistencia | `IRegistroCierreIncidente` |
| Traducir los rechazos a errores HTTP (nunca 401; `responsableVigente` solo en el 403) | `ErrorCierreIncidente`, `ErrorAplicacion` |
| No comprobar el responsable por su cuenta (sería una lectura desfasada ante un relevo) | |

| Clases: `MarcarIncidenteLocalizado`, `ConsultarCierreIncidente` (`application/use-cases`) | |
|---|---|
| **Responsabilidades** | **Colaboradores** |
| `MarcarIncidenteLocalizado`: delega `abierto → localizado` y reutiliza `traducirErrorCierre` | `IRegistroLocalizacionIncidente` |
| `ConsultarCierreIncidente`: lee el último cierre de una expedición y arma la vista (`esMio`, `tipoCierre`, `retornoConfirmadoPorSenderista`) | `ILectorCierreIncidente`, `aVistaInformeCierre` |

| Interfaces: `IRegistroCierreIncidente` / `IRegistroLocalizacionIncidente` / `ILectorCierreIncidente` / `ICierreIncidenteDAO` (`domain/repositories`) | |
|---|---|
| **Responsabilidades** | **Colaboradores** |
| Registro del cierre y de "localizado": atómicos e idempotentes; sin actualizar ni eliminar informes | `ErrorCierreIncidente` |
| Lectura: `ultimoCierreDeExpedicion(expedicionId)` | `InformeCierre` |

| Clase: `CierreIncidenteDAOSupabase` (`infrastructure/repositories`) | |
|---|---|
| **Responsabilidades** | **Colaboradores** |
| Llamar a las tres RPC (`treksafe_cerrar_incidente`, `treksafe_marcar_incidente_localizado`, `treksafe_leer_ultimo_cierre_incidente`) y traducir `error.message`/`error.details` | `SupabaseClient.rpc` |
| Validar la forma de la respuesta y normalizar `cerradoEn` a ISO UTC; cualquier otro error es 500 sin exponer el mensaje y sin registrar `details`, la solicitud ni el resumen | |

| Clase: `CierreIncidenteDAOMemoria` (`infrastructure/repositories/memoria`) | |
|---|---|
| **Responsabilidades** | **Colaboradores** |
| Doble de prueba que envuelve `BitacoraIncidenteDAOMemoria` (comparte incidentes y entradas) y replica el orden de comprobaciones de la RPC, con cola por incidente | `ICierreIncidenteDAO`, `BitacoraIncidenteDAOMemoria` |
| Leer, nunca escribir, el estado de la expedición | |

| Clases: `CierreIncidente.tsx`, `InformeCierreIncidente.tsx` (`frontend/src/components/rescate`) | |
|---|---|
| **Responsabilidades** | **Colaboradores** |
| `CierreIncidente`: "Marcar persona localizada" y el formulario de cierre, solo para el responsable, con confirmación en dos pasos, aviso de privacidad y la nota de que cerrar no confirma el retorno | `lib/cierreIncidente.ts`, `services/cierreIncidente.ts` |
| `CierreIncidente`: conservar el `comandoId` mientras el resultado sea incierto; reintentar o descartar | `lib/coordinacionRescate.ts` (`GestorOperacion`) |
| `InformeCierreIncidente`: mostrar el informe en solo lectura y si el senderista ya confirmó su retorno | `fechaHoraEntrada` |

## Concurrencia: cierre contra relevo y contra notas

```mermaid
sequenceDiagram
    participant A as Rescatista A (responsable)
    participant CI as treksafe_cerrar_incidente
    participant INC as incidentes (fila)
    participant REL as Relevo HU-40
    participant NOTA as treksafe_agregar_entrada_bitacora (HU-41)

    A->>CI: cerrar(inc, A, resultado, resumen, comando)
    CI->>CI: comando ya registrado? (no)
    CI->>INC: SELECT ... FOR UPDATE (responsable = A, localizado)
    NOTA->>INC: SELECT ... FOR SHARE (espera)
    REL->>INC: UPDATE responsable = B (espera)
    CI->>INC: anexar entrada cierre, INSERT informe, UPDATE estado = cerrado
    CI-->>A: 201 {cierre}
    Note over INC: A confirma y se libera el bloqueo
    NOTA->>INC: lee estado = cerrado
    NOTA-->>NOTA: INCIDENTE_CERRADO
    REL->>INC: UPDATE responsable = B (continúa; HU-40 decide qué hace con un incidente cerrado)
```

Si el relevo llega primero, el cierre de A espera, relee la fila ya cambiada y recibe `NO_ES_RESPONSABLE` con el nuevo responsable. Si una nota de HU-41 llega primero, el cierre espera y la nota queda antes de la entrada `cierre`. Todo está probado con sesiones reales (casos (a), (b), (b2), (c), (d1), (d2), (d3), (e) y (f) de `test-hu42-postgres.mjs`).

- **`FOR UPDATE` desde el principio:** subir el bloqueo desde `FOR SHARE` (la RPC pública de HU-41) puede provocar un deadlock entre dos transacciones que hacen lo mismo. Por eso `treksafe_cerrar_incidente` no llama a la RPC pública de HU-41, sino a la función interna, que no toma otro bloqueo distinto.
- **Sin ciclos:** solo se bloquea la fila del incidente; nunca `expediciones`. Veinte rondas de nota y cierre simultáneos no produjeron ningún `40P01`.
- **Un solo `UPDATE`:** `estado`, `cerrado_en` y `version` juntos, para cumplir `chk_incidentes_cierre`. `cerrado_en` es la hora que fijó el trigger del informe, así que ambas coinciden.

## Principios SOLID y DRY

- **SRP:** el informe vive en su tabla, aparte de `incidentes` y de las entradas; el comando valida, el caso de uso delega y traduce, el DAO persiste, el controlador adapta HTTP.
- **ISP:** `IRegistroCierreIncidente`, `IRegistroLocalizacionIncidente` e `ILectorCierreIncidente`; cada caso de uso depende solo de su interfaz.
- **DIP:** los casos de uso importan interfaces del dominio y no Supabase, Express ni infraestructura (se comprueba con `grep`). Los concretos solo se crean en `servicios.ts`, con un único `CierreIncidenteDAOSupabase` perezoso compartido por los tres casos.
- **OCP:** el cierre reutiliza la función interna de HU-41 sin modificarla; `IIncidenteDAO` y `ServicioRescate` no se amplían.
- **LSP:** `verificarContratoCierreIncidenteDAO` ejecuta los mismos 18 casos sobre la memoria y sobre PostgreSQL real.
- **DRY:**

| Qué | Definición única | Quién la usa |
|---|---|---|
| Catálogo, límite, estados y texto de "localizado" | `domain/value-objects/cierreIncidente.ts` (con prueba de coherencia contra la 025) | DTO, DAO, casos de uso |
| Estados HTTP | `RESPUESTAS_CIERRE` y `traducirErrorCierre` | `CerrarIncidente` y `MarcarIncidenteLocalizado` |
| Resultado del responsable | `treksafe_resultado_coordinacion` (017) | `DETAIL` de `NO_ES_RESPONSABLE` y resultado de "localizado" |
| Anexar a la bitácora y resolver repeticiones | `treksafe_anexar_entrada_bitacora_interna` y `treksafe_entrada_bitacora_repetida` (019) | Cierre y "localizado" |
| `operacionId`, reintento y `leerResponsableVigente` | `lib/coordinacionRescate.ts` y `lib/bitacoraIncidente.ts` | `CierreIncidente` y `BitacoraIncidente` |

## Idempotencia

| Caso | Resultado |
|---|---|
| Mismo `comandoId`, mismo incidente, actor, resultado y resumen normalizado | El informe original, 200, `repetido`, aunque haya habido un relevo entre el intento y el reintento (se resuelve **antes** de autorizar) |
| Mismo `comandoId` con otro resumen, otro resultado u otro actor | 409 `OPERACION_YA_REGISTRADA` |
| Otro `comandoId` sobre un incidente ya cerrado | 409 `INCIDENTE_CERRADO` (no cambia el informe) |
| `comandoId` ya usado como `operacionId` de una nota, de "localizado" o de un incidente (HU-39) | 409 `OPERACION_YA_REGISTRADA` (la unicidad entre tipos sale gratis: el `comando_id` es el `operacion_id` de la entrada de cierre) |
| Dos cierres simultáneos con el mismo comando | Uno escribe y el otro recibe el original (`repetido`); un solo informe |
| Dos cierres simultáneos con comandos distintos | Uno gana; el otro recibe `INCIDENTE_CERRADO`; un solo informe |
| "Localizado" repetido (mismo `operacionId` u otro sobre un incidente ya localizado) | 200 con `repetido: true`, sin escribir; una sola nota y una sola subida de versión |

## API

Montaje `/api/rescate`. Todas las rutas: `middlewareAutenticacion` y `requerirRol('rescatista')`. Sin token: 401 (la única). Con rol senderista: 403 `PROHIBIDO`.

### `POST /api/rescate/incidentes/:incidenteId/localizacion`

Cuerpo `.strict()`: `{ operacionId: uuid }`. Éxito: **200** `{ incidente: { incidenteId, expedicionId, estado, version, responsable }, repetido }`. Errores: 400 `ErrorValidacion` (claves extra, UUID), 403 `NO_ES_RESPONSABLE` con `responsableVigente`, 404, 409 `INCIDENTE_CERRADO` u `OPERACION_YA_REGISTRADA`.

### `POST /api/rescate/incidentes/:incidenteId/cierre`

Cuerpo `.strict()`: `{ comandoId: uuid, resultado: <catálogo>, resumen: 1..2000 tras recortar }`. Éxito: **201** `{ cierre }` (**200** con el cuerpo idéntico si es una repetición). `cierre` lleva: `id`, `incidenteId`, `expedicionId`, `resultado`, `resumen`, `cerradoPor { rescatistaId, nombreRescatista, esMio }`, `cerradoEn`, `entradaBitacoraId`, `tipoCierre: 'operativo'`, `estadoExpedicion` y `retornoConfirmadoPorSenderista` (verdadero solo si la expedición ya está `completada`; el cierre nunca lo pone). Errores: 400 `ErrorValidacion` (falta un campo, resultado fuera del catálogo, resumen vacío o de 2001, claves extra como `estadoExpedicion`, `confirmarRetorno` o `rescatistaId`), 403 `NO_ES_RESPONSABLE` con `responsableVigente`, 404 `INCIDENTE_NO_ENCONTRADO`, 409 (`INCIDENTE_NO_LOCALIZADO`, `INCIDENTE_CERRADO`, `OPERACION_YA_REGISTRADA`), 500 genérico.

### `GET /api/rescate/alertas/:expedicionId/cierre`

Éxito: **200** `{ cierre: <informe> | null }`: el informe del cierre más reciente de la expedición, o `null`. Error: 400 si el id no es UUID. Existe porque, tras el cierre, el incidente ya no aparece como coordinación vigente (`IncidenteDAOSupabase.leerCoordinaciones` filtra `estado <> 'cerrado'`) y la expedición sigue en `alerta`.

## Contrato de `informes_cierre_incidente` para el equipo

| Columna | Tipo | Notas |
|---|---|---|
| `id` | UUID | PK |
| `incidente_id` | UUID | FK a `incidentes`, `ON DELETE CASCADE` (solo la cascada pasa el trigger); `UNIQUE`: un informe por incidente |
| `comando_id` | UUID | `NOT NULL UNIQUE`; es también el `operacion_id` de la entrada de cierre |
| `resultado` | TEXT | `CHECK` con el catálogo D1 (nombre fijo `chk_informes_cierre_resultado`) |
| `resumen` | TEXT | 1 a 2000 caracteres, ya recortado, no solo espacios |
| `cerrado_por` | UUID | FK a `perfiles_rescatista`, `ON DELETE RESTRICT`; no cambia con un relevo posterior |
| `entrada_bitacora_id` | UUID | La entrada `cierre` de la bitácora (la fija la RPC; sin FK, ver desviaciones) |
| `cerrado_en` | TIMESTAMPTZ | Hora del servidor; igual a `incidentes.cerrado_en` |

- RLS activo con `treksafe_deny_anon_authenticated`. `service_role`: `SELECT` e `INSERT`. Triggers: hora del servidor y solo anexado (`INFORME_CIERRE_INMUTABLE`).
- Funciones (todas `SECURITY INVOKER`, `search_path` vacío, solo `service_role` ejecuta): `treksafe_cerrar_incidente`, `treksafe_marcar_incidente_localizado`, `treksafe_leer_ultimo_cierre_incidente` (públicas) y `treksafe_cierre_incidente_repetido`, `treksafe_resultado_cierre_incidente` (auxiliares) más las dos de los triggers.
- Privilegio sobre `incidentes`: `GRANT UPDATE (estado, cerrado_en, version) TO service_role`, **aditivo, sin ningún `REVOKE`**.
- La tabla no guarda datos médicos y no debe hacerlo.

## Notas para HU-40, HU-47 y HU-50

- **HU-40 (Favio):** el `REVOKE UPDATE, DELETE, TRUNCATE ON incidentes FROM service_role` de su migración 021 también retira los privilegios de columna que concede la 025. Aplicar la **021 antes que la 025**; si ocurre al revés, recuperar con `GRANT UPDATE (estado, cerrado_en, version) ON public.incidentes TO service_role;` (el caso SQL 12 simula exactamente la situación de la 021). Confirmar que `localizado` sube `version` (su documento lo espera). Un relevo pendiente queda inerte al cerrar; HU-42 no implementa reabrir. `servicios.ts` y `rutasRescate.ts` darán conflicto de merge: las adiciones de HU-42 están en bloques aparte y comentados `// HU-42`.
- **HU-47 (Jhon, métricas):** contar desde `informes_cierre_incidente` (uno por incidente; `resultado` y `cerrado_en`) o desde `incidentes` cerrados; duración = `cerrado_en - abierto_en`; nunca unir con las entradas sin agregar. El catálogo D1 puede cambiar: es un `CHECK` con nombre fijo y se cambia con una migración pequeña.
- **HU-50:** al cerrar, el incidente deja de estar "abierto"; el acceso a la ficha médica debe terminar con el cierre (esta HU no toca la ficha ni su auditoría).

## Migración 025 y su aplicación

| Archivo | Contenido |
|---|---|
| `025_hu42_cerrar_incidente.sql` | Tabla `informes_cierre_incidente`, RLS, triggers, `GRANT UPDATE (estado, cerrado_en, version)`, funciones auxiliares y las tres RPC. Requiere `017` y `019` (y por ellas `002`). Aplicar una sola vez (no es re-ejecutable). Aplicar después de la 021 si existe. |

- **Número:** el 021 está tomado por `origin/feat/hu-40-transferir-coordinacion` y el 020 por `origin/feat/hu-49-sincronizacion-offline`; 022 a 024 son de DEP-04 y ya están en `develop`. Ninguna rama usa el 025. **Ariana** debe reservarlo y comprobarlo de nuevo antes del merge.
- **Ariana:** aplicar en DEV una sola vez, después de la 021 si corresponde; consulta de solo lectura `SELECT has_column_privilege('service_role','public.incidentes','estado','UPDATE'), has_column_privilege('service_role','public.incidentes','cerrado_en','UPDATE');`; recargar el esquema de PostgREST para las tres RPC nuevas; anotarlo en `REGISTRO_APLICACION.md` (esta HU no lo toca). No se aplicó en ningún entorno remoto.
- **Marko (DEP-04):** incorporar la 025 y `hu42Postgres.integration.test.ts` a `backend/scripts/test-dep108-postgres.mjs` (lista `newMigrations` y bucle `[30, 31, 36, 41]`). Es un script ajeno: se propone, no se modifica.

## Desviaciones respecto al plan

- **Sin FK de `informes_cierre_incidente` hacia `entradas_bitacora_incidente`:** el plan tenía una FK compuesta `(incidente_id, entrada_bitacora_id)`. Al ejecutar la regresión de la suite SQL de HU-41, su caso 5 falló: con una FK entrante, PostgreSQL rechaza `TRUNCATE` de la bitácora con "cannot truncate a table referenced in a foreign key constraint" **antes** de disparar el trigger, y la prueba de HU-41 espera `ENTRADA_BITACORA_INMUTABLE`. Para no modificar la prueba ni el comportamiento de HU-41, la columna se conserva sin FK; la RPC la fija con el id que devuelve la función interna y los casos SQL 4 y 8 y el contrato verifican que coincide con la entrada `cierre` del mismo incidente. Esto también elimina el riesgo que el plan anotaba sobre la FK `NO ACTION` durante la cascada del ARCO (el caso SQL 11 comprueba la cascada).
- **Caso SQL 2:** el plan sugería comprobar que `service_role` no puede actualizar `responsable_id`. En la emulación de Supabase (y, probablemente, en DEV) `service_role` conserva el `UPDATE` completo de los privilegios por defecto, porque la 017 nunca hizo `REVOKE` para ese rol; esa aserción habría sido falsa. El endurecimiento real llegará con la 021 y se simula en el caso 12.
- **Concurrencia:** el plan pedía los casos (a) a (e). Se ejecutan nueve: (a), (b), (b2) 10 rondas, (c), (d1), (d2), (d3) 20 rondas, (e) y (f) "localizado" simultáneo.
- **`BitacoraIncidenteDAOMemoria.anexarInterna`** (archivo de HU-41, solo doble de prueba): ahora rechaza con `OPERACION_YA_REGISTRADA` un `operacionId` ya usado, igual que `treksafe_entrada_bitacora_repetida`. Hacía falta para que el contrato del cierre (comando ya usado en una nota) dé el mismo resultado en memoria y en PostgreSQL.
- **Script de PostgreSQL:** aplica `000` a `019` (con `015`) y `022` a `024`, además de la `025`, y ejecuta la suite SQL de HU-41 como regresión (16 casos) además de la de HU-42 (13 casos).
- **`test-dep108-postgres.mjs`:** no se pudo ejecutar (exige un binario de PostgREST con `--postgrest` y no hay ninguno en esta máquina). No se ve afectado por la 025: el script solo aplica `015`, `022`, `023` y `024`.
- **`test:pwa:privacidad`:** el plan esperaba 5 fallos preexistentes; en esta máquina son 6, y los mismos 6 aparecen en `develop` limpio. Detalle en `evidencias/resultado-suites.md`.

## Frontend

- `services/cierreIncidente.ts` (servicio aparte), `lib/cierreIncidente.ts` (lógica pura: catálogo y etiquetas, `validarCierre`, `intentarCerrarIncidente`, `intentarMarcarLocalizado`), `components/rescate/CierreIncidente.tsx` y `components/rescate/InformeCierreIncidente.tsx`.
- `BitacoraIncidente.tsx` (HU-41) recibe la prop opcional `alCargar`, llamada tras cada lectura correcta; es el único cambio. Se guarda en una referencia para que una función nueva en cada render no dispare otra lectura.
- `PaginaDetalleAlertaRescate`:
  - con coordinación vigente muestra la bitácora y, si ya se leyó, `CierreIncidente` (estado, responsable y nombre salen de la lectura de la bitácora);
  - sin coordinación pero con un cierre muestra "Rescate cerrado (cierre operativo)" y la bitácora en solo lectura;
  - `cargarDetalle` también pide `GET /alertas/:id/cierre`; si falla, la página sigue sin el informe;
  - tras localizar o cerrar, la bitácora se vuelve a montar (`key` con un contador) y se relee el detalle.
- La sección de HU-14 "Bitácora de rescate" no cambia.
- `CierreIncidente`: "Marcar persona localizada" y "Cerrar incidente" piden confirmación en dos pasos (sin `confirm()`); el `<select>` no tiene valor preseleccionado; contador `n/2000`; aviso de privacidad (`role="note"`) y la nota fija de que cerrar no confirma el retorno. Ante un error sin respuesta (0) o 5xx el formulario queda en solo lectura con "Reintentar" (mismo `comandoId`) o "Descartar" (otro nuevo).
- Límite conocido: si el senderista ya confirmó su retorno, el detalle de la alerta devuelve 404 y el cierre solo es posible por API.

## Verificación

| Evidencia | Resultado |
|---|---|
| Suite SQL (`migrations/tests/hu42_cerrar_incidente.test.sql`) sobre PostgreSQL 17.6 desechable | 13 de 13 casos |
| Regresión: suite SQL de HU-41 tras la 025 | 16 de 16 casos |
| Concurrencia con sesiones reales (`scripts/test-hu42-postgres.mjs`) | 9 de 9 casos |
| Suite TypeScript sobre Postgres real (contrato del DAO y casos de uso) | 20 de 20 pruebas |
| `test-hu42-postgres.mjs` completo | 39 de 39 casos |
| `test-hu41-postgres.mjs` (regresión) | 23 de 23 casos |
| Backend: typecheck, `npm test` y build | Pasan; 705 pruebas, 0 fallos |
| Frontend: typecheck, `typecheck:tests`, `typecheck:ui`, `test:equipo`, build, `test:ui` | Pasan; 176 pruebas (174 pasan, 2 omitidas anteriores) y 13 de `test:ui` |
| `test:pwa:privacidad` | 6 fallos idénticos a los de `develop` limpio en esta máquina (ver evidencias) |

Detalle en `evidencias/resultado-postgres.md` y `evidencias/resultado-suites.md`. Para repetir la suite local: `node backend/scripts/test-hu42-postgres.mjs` (Docker, puerto 55432) o con `--pg-bin <carpeta>`. El script solo acepta `127.0.0.1`/`localhost` y bases con "desechable" en el nombre.

**Pendiente para la prueba manual en DEV** (`evidencias/prueba-manual.md`): que `error.message` y `error.details` de las RPC lleguen por PostgREST, que el esquema recargado exponga las tres RPC y que la lectura por expedición funcione.

## Privacidad (Jhon)

- La tabla no tiene columnas médicas (lo comprueba el caso SQL 1) y ninguna consulta une `fichas_medicas`.
- El catálogo de resultados no incluye estado de salud (D1; **confirmar con Jhon**). El resumen es texto libre: la mitigación es el aviso fijo sobre el cuadro de texto. No se puede detectar texto médico de forma fiable en el servidor.
- Las respuestas de la API solo llevan nombres, textos, horas y el estado de la expedición; una prueba HTTP busca palabras médicas en todas las respuestas.
- Los registros del DAO solo incluyen `error.message`; nunca `error.details` (una violación de `CHECK` trae la fila, y en ella el resumen), la solicitud ni el resumen (lo comprueba una prueba).

## Pendientes del Product Owner y notas para el PR

- **Marko (PO):** D1 a D7, en especial D2 (¿se debe poder cerrar desde `abierto`, por ejemplo una falsa alarma?), D6 (la alerta vuelve a figurar "sin responsable" en la lista y asumir abre un incidente nuevo), D5 (aviso al senderista), la posible confusión con el `estadoRescate` "cerrado" de la bitácora personal de HU-14 (hallazgo H14), y el caso en que el senderista ya confirmó el retorno (el detalle de la alerta da 404 y el cierre solo es posible por API).
- **Jhon:** D1 (catálogo sin estado de salud) y las notas de HU-47 y de privacidad.
- **Favio:** orden 021 antes de 025, `version` en `localizado`, conflictos de merge en `servicios.ts` y `rutasRescate.ts`.
- **Ariana:** número 025 y las consultas de DEV.

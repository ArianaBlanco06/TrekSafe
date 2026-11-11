# DEP-04 / #108 — Persistencia transaccional

Base conciliada: `develop` en `a5c4ca461c253ab25b2fb1315f324e0a7d79a6bf`, incluida HU-41 y su registro `019`; código funcional inicial en `68f2440`. Responsable: PO. Validación local y DEV: **2026-11-11**. [Issue #108](https://github.com/ArianaBlanco06/TrekSafe/issues/108), [diseño #106](https://github.com/ArianaBlanco06/TrekSafe/pull/113), procesador posterior [#109](https://github.com/ArianaBlanco06/TrekSafe/issues/109).

## Cambios y compatibilidad

- `treksafe_crear_expedicion(uuid,jsonb)` guarda cabecera, contactos y acompañantes en una transacción. Valida actor, propiedad, fechas y restricciones; bloquea perfil y contactos antes de tomar el reloj. Conserva la regla de inicio próximo (hasta 60 s) como `en_progreso`.
- El adaptador de creación usa una RPC única. Mantiene errores/respuesta HTTP; la RPC ausente falla explícitamente, sin inserciones o compensaciones parciales.
- Un índice único parcial impide más de una expedición `en_progreso`/`alerta` por senderista, también desde el cron legado. La migración aborta ante duplicados existentes sin alterar esos datos.
- El trigger de `eventos_plan` guarda el aviso de edición, cancelación o ampliación en la misma transacción. Mantiene tipos del historial, identidad, mensajes y deduplicación de HU-37. No rellena retrospectivamente eventos antiguos.
- La outbox canónica conserva columnas de HU-45 y exige `clave_evento`, destinatario normalizado y canal. `enviado` significa aceptación del transporte, no recepción.
- `treksafe_evaluar_vencimientos_con_outbox(p_limite integer DEFAULT 100)` bloquea hasta 100 vencimientos (máximo 500), cambia el estado y guarda pendientes mínimos de correo atómicamente. Devuelve `{expediciones,enAlerta,pendientes,sinDestinatarios}`. La lista sin destinatarios hace visible ese caso sin inventar correos.

La nueva RPC de vencimientos **no está conectada al cron actual**. Envío, reservas, conciliación del corte y reintentos pertenecen a #109. No se agregan tipos de alerta al historial HU-36 ni se incluyen fichas médicas, contraseñas o tokens en el contenido generado.

La creación HTTP no adquiere una idempotencia nueva: su contrato no contiene `operacionId`. La idempotencia comprobada corresponde a operaciones del plan, avisos y pendientes. Repetir un POST de creación no garantiza obtener el mismo plan.

## Migraciones y permisos

Archivos nuevos: `015`, `022`, `023`, `024`; dependencias y orden en el [catálogo](../../backend/migrations/README.md). `017` y `018` se conservan sin cambios productivos. Las dos HU-30 con fecha preceden a `008`/`009`; no usar glob alfabético.

RLS activo; `anon`/`authenticated` sin acceso a la nueva tabla/RPC. Las funciones nuevas usan `SECURITY INVOKER` y `search_path` vacío; se mantienen las excepciones documentadas de HU-32. La última migración notifica a PostgREST para recargar la caché de esquema.

El borrador del PR #90 usa el número ocupado `012` y no exige `clave_evento`. #109 debe adaptar sus productores a `015`, no repetir DDL ni interpretar instalar la tabla como activar el procesador.

Las plantillas vacías fueron generadas con Supabase CLI **3.1.0**, `migration new`, en un directorio temporal y adaptadas a la numeración NNN acordada del repositorio. El CLI no se utilizó para generar cambios remotos.

## Validación reproducible

Herramientas: Node **22.23.4**, PostgreSQL **17.11**, PostgREST **16.5**, archivos temporales verificados contra SHA256 oficiales. Sin servicio instalado ni PATH global modificado. El runner crea clúster/base nuevos en loopback, desactiva sockets Unix para no depender de permisos de `/var/run/postgresql` en CI, no lee `.env`, `DATABASE_URL` o claves Supabase y detiene sus procesos al terminar. Conserva carpeta temporal/log para inspección.

Desde la raíz con dependencias del backend:

```powershell
node backend/scripts/test-dep108-postgres.mjs --pg-bin <bin-postgresql-17> --postgrest <postgrest.exe>
node backend/scripts/test-dep108-postgres.mjs --pg-bin <bin-postgresql-17> --postgrest <postgrest.exe> --dev-check backend/migrations/tests/dep108_dev_rollback.sql
npm run typecheck --prefix backend
npm test --prefix backend
npm run build --prefix backend
```

En Windows, incluir PostgreSQL bin en el PATH del proceso para `libpq`. El entorno restringido puede requerir permisos para memoria compartida y loopback. Nunca se elige una base existente o remota.

| Comprobación | Resultado local |
|---|---|
| Runner | **24 escenarios aprobados**; 25 al añadir `--dev-check <archivo.sql>` con el chequeo controlado destinado a DEV |
| Instalación/actualización | Dos bases separadas, datos y asientos históricos conservados |
| Atomicidad | Fallos en vínculos, acompañantes, aviso y outbox revierten las escrituras correspondientes |
| Concurrencia | Dos creaciones; creación/promoción; ampliación/vencimiento; dos evaluadores; cancelación cuya salida pasa durante el bloqueo |
| Permisos | `service_role` real; rechazo de tabla/RPC a `anon`/`authenticated`; actor/contacto ajenos |
| Regresiones SQL | Suites completas HU-27/HU-39/HU-36/HU-41 (16 casos de bitácora) antes y después del esquema ampliado; coordinación/idempotencia conservadas |
| SDK/HTTP | SDK Supabase y adaptador reales sobre PostgREST nativo, sin simular resultados SQL |
| Adaptador unitario | **11 pruebas aprobadas**; errores, RPC ausente sin fallback y respuesta inválida |
| Tipos | `tsc --noEmit` aprobado |
| Regresión completa y build | **611 pruebas aprobadas**, cero fallos; `tsc` de producción aprobado |
| Fallo del ejecutable PostgREST | Ruta inexistente produce error controlado; `postmaster.pid` ausente, `pg_isready` sin respuesta y log PostgreSQL confirma apagado |

El CI añade un job PostgreSQL 17/PostgREST 16.5 con checksum y artefacto de resultados. Su resultado remoto se consulta en el PR; disponer del job no acredita una ejecución remota aún no terminada.

### Fixtures históricas corregidas

HU-39 ahora utiliza un propietario por expedición para respetar la unicidad de bloqueantes, conservando actores y casos de coordinación. La FK `ON DELETE RESTRICT` produce `23503` en PostgreSQL 17; se comprueba ese rechazo y `pg_constraint.confdeltype='r'` en lugar de esperar `23001`.

HU-41 también usa un propietario por cada expedición bloqueante en su fixture SQL, preservando responsables, entradas y casos de bitácora. Los 16 casos pasan antes y después de aplicar DEP-04; no se alteró su SQL productivo `019`.

HU-36 usa `TRUNCATE ... CASCADE` para alcanzar el trigger cuando HU-37 ya referencia eventos. El trigger rechaza la operación: la prueba no trunca datos. Son cambios de tests, sin alterar las migraciones productivas de esas HU.

## DEV y recuperación

El preflight del 2026-11-11 confirmó `017`/`018` ya aplicadas por el equipo, con definiciones normalizadas coincidentes. No se repitieron. `015`/`022`/`023`/`024` se aplicaron a **Supabase DEV** entre las 12:57:25 y 12:57:50 UTC (07:57 Lima), después de las pruebas desechables y la comprobación de objetos, permisos, registros y ausencia de duplicados. El [registro](../../backend/migrations/REGISTRO_APLICACION.md) incluye esas aplicaciones reales; [evidencia detallada](evidencia-dev.md).

El chequeo versionado en `backend/migrations/tests/dep108_dev_rollback.sql` pasó primero en la base desechable y después en DEV, con datos ficticios y rollback: **cero usuarios ficticios restantes**, sin cron ni correo. Se verificaron creación/colecciones, propiedad de contactos, cancelación con evento/aviso idempotentes, vencimiento con pendientes y coordinación HU-39. Los cuerpos SQL normalizados coinciden con el commit `a988637`; los asesores de seguridad no devolvieron observaciones. La comprobación DEV usa SQL con rol `service_role`; el SDK/PostgREST real se probó en la base desechable, no se afirma una prueba HTTP autenticada de DEV.

## Validación conjunta con #107

La unión local de `032317f` (#107) y `a988637` (#108), sobre `develop` `3b61042`, pasó con Node 22.23.4: **567 pruebas backend**, tipos y compilación de ambos componentes, **25 escenarios PostgreSQL/PostgREST**, **125 pruebas frontend** y **33 pruebas de navegador** (13 de interfaz y 20 de privacidad/PWA). Las dos pruebas frontend condicionadas a sus runners SQL particulares quedaron omitidas por ese comando; no se cuentan como aprobadas. Las regresiones SQL de esta entrega están descritas por separado. El ajuste posterior de limpieza del runner `4ac4e6d` no cambió SQL ni comportamiento de producto y volvió a pasar los 25 escenarios.

Tras integrar HU-41 desde `a5c4ca4`, la rama de persistencia volvió a pasar **611 pruebas backend**, tipos, compilación y los **25 escenarios PostgreSQL/PostgREST**; estos últimos incluyen los 16 casos SQL de HU-41 antes y después de la actualización. Los archivos SQL ya aplicados a DEV (`015`, `022`, `023`, `024`) no cambiaron ni se reaplicaron.

Las nuevas migraciones son aditivas y de una sola aplicación. Una versión anterior puede conservar el esquema, pero no se debe activar simultáneamente envío legado y nuevo sin el corte/conciliación de #109. Preservar datos/pendientes ante un fallo; no usar `init_schema.sql`, `.down.sql` destructivos ni borrar asientos para forzar repetición. Una incompatibilidad requiere una migración correctiva ensayada.

## Aceptación #108

| Criterio | Evidencia |
|---|---|
| Instalación y actualización | Runner en dos bases y CI dedicado |
| Sin estado parcial ni aviso perdido | RPC/trigger y fallos inyectados |
| Versión, reintentos y concurrencia | Casos SQL y carreras reales |
| Permisos y propiedad | Roles y actores/contactos ajenos |
| Versiones por entorno | Catálogo y registro real, distinguiendo local/DEV |
| Recuperación | Procedimiento y límites anteriores |

# Evidencia DEV — #108

Fecha: **2026-11-11**, zona de presentación America/Lima. Proyecto conectado: **treksafe-dev-r2** (`ibnwggvqgjpeqcretjak`), PostgreSQL **17.11**. No se usó el entorno publicado ni se aprovisionaron recursos.

## Preflight y aplicaciones reales

Antes de aplicar: outbox inexistente, cero registros `015`/`022`/`023`/`024` y cero grupos de senderistas con más de una expedición bloqueante. Las funciones de `017` y `018` ya existían, con cuerpos normalizados idénticos a los archivos históricos; se conservaron.

Las cuatro fuentes SQL corresponden al commit **`a988637bc95fea053859c6b330d997211c9f535b`**. Se aplicaron mediante la conexión Supabase de Codex por encargo del PO. El proveedor gestionó la transacción; se omitieron únicamente los delimitadores externos `BEGIN`/`COMMIT` del archivo al enviarlo al mecanismo de migraciones.

| Archivo / registro TrekSafe | Aplicación UTC | Versión en Supabase |
|---|---|---|
| `015_hu45_outbox.sql` / 015 | 2026-11-11 12:57:25 | `20261111125725` — `dep108_015_hu45_outbox` |
| `022_dep108_crear_expedicion_atomica.sql` / 022 | 2026-11-11 12:57:41 | `20261111125741` — `dep108_022_crear_expedicion_atomica` |
| `023_dep108_avisos_transaccionales.sql` / 023 | 2026-11-11 12:57:45 | `20261111125745` — `dep108_023_avisos_transaccionales` |
| `024_dep108_vencimientos_outbox.sql` / 024 | 2026-11-11 12:57:50 | `20261111125750` — `dep108_024_vencimientos_outbox` |

El catálogo propio y `supabase_migrations` conservan identificadores distintos del mismo cambio; no se deben volver a aplicar por esa diferencia de formato. Los nombres numéricos se coordinaron evitando el `019` provisional de los PR #115 y #117.

## Verificación del esquema

Cotejo de `md5(replace(prosrc, E'\r', ''))` con el cuerpo del archivo local (normalización de saltos de línea, no certificación criptográfica):

| Función | MD5 del cuerpo LF local y DEV |
|---|---|
| `treksafe_crear_expedicion(uuid,jsonb)` | `d3f7bf117f2c4d95e54df943916804d1` |
| `treksafe_aviso_desde_evento_plan()` | `a8467116d9b895927b6f26c35c7572bd` |
| `treksafe_evaluar_vencimientos_con_outbox(integer)` | `e831488597790f3a5bb62574f5bb364a` |

Las tres funciones son `SECURITY INVOKER`, con `search_path` vacío y sin ejecución por `anon`/`authenticated`; `service_role` sí puede ejecutarlas. La outbox tiene RLS activo y ninguno de los dos roles cliente puede leerla. Se mantuvieron las excepciones históricas de HU-32.

## Prueba funcional controlada

Se ejecutó el archivo [dep108_dev_rollback.sql](../../backend/migrations/tests/dep108_dev_rollback.sql) ya ensayado en PostgreSQL desechable. Usa actores, perfiles y contactos ficticios dentro de una transacción, con `lock_timeout` de 5 s y `statement_timeout` de 30 s.

Comprueba creación completa, rechazo de contacto ajeno sin escritura parcial, cancelación/evento/aviso y reintento, vencimiento/pending sin ficha médica, deduplicación de destinatario normalizado y coordinación HU-39. El productor global recibe límite 1 y solo se invoca después de comprobar que la fila ficticia es la primera candidata; no se ejecuta un segundo barrido que pudiera seleccionar expediciones ajenas.

Resultado observado: **“Pruebas DEV aprobadas; transaccion revertida, sin correo ni cron”**, con **0 usuarios ficticios restantes**. Después se comprobó que la outbox tenía **0 filas**: los destinatarios temporales nunca quedaron visibles para un procesador externo. No se inició el worker ni se envió correo.

## Asesores y límites

El asesor de seguridad devolvió **0 observaciones**. Las FK sin índice bajaron de seis en el preflight inicial a tres, por los índices del alcance. Permanecen avisos informativos de rendimiento sobre FK de auditoría médica/avances/bitácora y sobre índices todavía sin uso; no se eliminaron índices por falta de actividad en pruebas.

Esta es validación SQL de DEV mediante la conexión administrada y el rol de aplicación. El SDK Supabase contra PostgREST nativo se probó en bases desechables. No se acredita aquí una sesión HTTP autenticada contra la Data API remota, entrega real de correo, recuperación del worker futuro ni publicación en Fly/Vercel: corresponden a #109–#112.

## Conciliación posterior con HU-41

Al actualizar la base a `develop` `a5c4ca4` se comprobó por consulta de solo lectura que el equipo ya había aplicado `019` en DEV el **2026-11-11 17:46:24 UTC** y que existía `entradas_bitacora_incidente`. No se repitió esa migración ni ninguna de las cuatro de #108.

Los tres cuerpos SQL de #108 conservaron los MD5 de la tabla anterior; los permisos, `SECURITY INVOKER` y RLS siguieron vigentes. La outbox contenía cero filas. Se repitió el chequeo controlado versionado después de aprobar las regresiones locales con HU-41: **aprobado, transacción revertida, cero usuarios ficticios restantes**, sin correo ni cron. Esta comprobación conserva los mismos límites de evidencia SQL administrada descritos arriba.

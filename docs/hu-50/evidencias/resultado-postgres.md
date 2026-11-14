# HU-50 · Resultado de la suite contra PostgreSQL desechable

- Fecha: 2026-11-13.
- Comando: `node backend/scripts/test-hu50-postgres.mjs --pg-bin "C:\Program Files\PostgreSQL\17\bin"` (Docker no se usó en esta máquina).
- Servidor: PostgreSQL 17.6 (x86_64-windows), clúster temporal en `127.0.0.1:55432`, base `treksafe_desechable`, roles de Supabase emulados con los privilegios por defecto (`ALL` para `service_role`). El script se niega a conectarse a cualquier host que no sea local o a una base sin "desechable" en el nombre. No se tocó Supabase ni ningún entorno remoto.
- Código: `origin/develop` en 34deec7 más los commits de HU-50 de la rama `feat/hu-50-ficha-medica-responsable`.
- Resultado: **50 de 50 casos** (14 de la suite SQL de HU-50, 13 de HU-42 y 16 de HU-41 como regresión, 6 de concurrencia con sesiones reales y 1 que agrupa la suite TypeScript, que ejecutó 17 pruebas: 10 del contrato del DAO sobre Postgres real y 7 de la fachada real con el descifrador real).

## Salida completa de `test-hu50-postgres.mjs`

```text
Creando clúster temporal en <carpeta temporal> (puerto 55432)...

PostgreSQL: PostgreSQL 17.6 on x86_64-windows, compiled by msvc-19.44.35217, 64-bit
Modo: --pg-bin C:\Program Files\PostgreSQL\17\bin · 127.0.0.1:55432/treksafe_desechable

init_schema.sql y 26 migraciones previas aplicados (000 a 019, 021 y 022 a 024, con la 015), más la 025 y la 029.

== Suite SQL HU-50 (tests/hu50_ficha_medica_responsable.test.sql) ==
OK   SQL HU-50 1: RLS, política, columnas sin datos médicos, un solo FK (senderista, cascada), 4 triggers, 3 RPC y 2 triggers INVOKER con search_path vacío, RPC ARCO DEFINER con search_path fijo, sin EXECUTE para PUBLIC, anon ni authenticated; service_role solo SELECT e INSERT en la auditoría y UPDATE (version) en incidentes
OK   SQL HU-50 2: el contexto lleva rescatista, incidente (id, expedición, senderista, estado, responsable) y consentimiento, y nunca el tipo de sangre ni el texto cifrado
OK   SQL HU-50 3: un incidente inexistente devuelve incidente null; un senderista devuelve actorEsRescatista=false
OK   SQL HU-50 4: el responsable vigente recibe {tipoSangre, cargaCifrada}
OK   SQL HU-50 5: otro rescatista, un senderista e incidente inexistente reciben NULL
OK   SQL HU-50 6: tras el relevo, el anterior recibe NULL y el nuevo recibe los datos
OK   SQL HU-50 7: un incidente localizado entrega los datos; al cerrarse, la guarda devuelve NULL y el contexto informa estado cerrado
OK   SQL HU-50 8: sin ficha con consentimiento, la guarda devuelve NULL y el contexto informa consentimientoVigente=false
OK   SQL HU-50 9: las filas permitida y denegada llevan incidente, expedición, senderista, actor, resultado, motivo y hora del servidor; un INSERT con hora falsa se corrige; sin incidente, expedición y senderista son NULL
OK   SQL HU-50 10: parámetros nulos, resultado o motivo fuera del catálogo e incoherencias dan DATOS_INVALIDOS sin escribir; un permitido sobre un incidente inexistente viola el CHECK
OK   SQL HU-50 11: UPDATE, DELETE directo y TRUNCATE dan ACCESO_FICHA_INMUTABLE; service_role no puede actualizar, borrar ni truncar; DELETE FROM usuarios arrastra solo los accesos de ese senderista
OK   SQL HU-50 12: ninguna columna de la auditoría es médica y to_jsonb de sus filas no contiene el tipo de sangre ni el texto cifrado de prueba
OK   SQL HU-50 13: ARCO limpia las notas de las expediciones completada y cancelada (devuelve 2, luego 0); conserva la de la expedición en alerta y la de otro senderista; service_role no accede directo a avances_expedicion; parámetros nulos dan DATOS_INVALIDOS
OK   SQL HU-50 14: la 029 quedó registrada en treksafe_migraciones y la tabla legada quedó marcada como no escrita

== Suite SQL HU-42 (regresión tras la 029) (tests/hu42_cerrar_incidente.test.sql) ==
OK   SQL HU-42 (regresión tras la 029) 1: RLS, política, uniques, CHECK de resultado y resumen, FK (cascada y restrict, ninguno hacia la bitácora), 4 triggers, columnas sin datos médicos, funciones SECURITY INVOKER con search_path vacío y sin EXECUTE para PUBLIC, anon ni authenticated
OK   SQL HU-42 (regresión tras la 029) 2: anon y authenticated no leen, escriben ni ejecutan; service_role solo SELECT e INSERT en informes y UPDATE (estado, cerrado_en, version) en incidentes
OK   SQL HU-42 (regresión tras la 029) 3: marcar localizado (solo el responsable, una nota fija, version+1, repetición sin escribir, ya localizado, no responsable con el vigente, inexistente, UUID ajeno y datos nulos)
OK   SQL HU-42 (regresión tras la 029) 4: el cierre devuelve el informe; cerrado_en del informe = el del incidente, version+1, entrada cierre con el resumen y operacion_id = comando
OK   SQL HU-42 (regresión tras la 029) 5: resultado fuera del catálogo, resumen vacío, en blanco o de 2001 y datos nulos dan DATOS_INVALIDOS sin escribir; 2000 caracteres se acepta
OK   SQL HU-42 (regresión tras la 029) 6: abierto da INCIDENTE_NO_LOCALIZADO; no responsable, 403 con el vigente; inexistente; tras un relevo A recibe NO_ES_RESPONSABLE y B cierra; los rechazos no escriben
OK   SQL HU-42 (regresión tras la 029) 7: mismo comando = mismo informe (repetido); otros datos = OPERACION_YA_REGISTRADA; otro comando sobre cerrado = INCIDENTE_CERRADO; sobrevive al relevo; comandos usados en una nota, un incidente o localizado se rechazan
OK   SQL HU-42 (regresión tras la 029) 8: tras el cierre la bitácora conserva ids, textos y horas, el cierre va al final y es único; la RPC de HU-41 y localizar dan INCIDENTE_CERRADO
OK   SQL HU-42 (regresión tras la 029) 9: el incidente queda cerrado con cerrado_en, sin otro incidente abierto en la expedición; el último cierre se lee por expedición (NULL si no hay)
OK   SQL HU-42 (regresión tras la 029) 10: con la expedición en alerta y en completada, expediciones (estado, version, actualizado_en y toda la fila) queda idéntica y no hay eventos, avisos ni outbox nuevos
OK   SQL HU-42 (regresión tras la 029) 11: UPDATE, DELETE directo y TRUNCATE del informe dan INFORME_CIERRE_INMUTABLE; service_role no puede actualizar; la cascada del ARCO arrastra incidente, entradas e informe; el autor queda restringido
OK   SQL HU-42 (regresión tras la 029) 12: con REVOKE de tabla y GRANT (responsable_id, version, asumido_en) el cierre falla con permission denied; con GRANT (estado, cerrado_en, version) funciona
OK   SQL HU-42 (regresión tras la 029) 13: la 025 quedó registrada en treksafe_migraciones

== Suite SQL HU-41 (regresión tras la 029) (tests/hu41_bitacora_incidente.test.sql) ==
OK   SQL HU-41 (regresión tras la 029) 1: RLS, política, índice de cierre único, columnas sin datos médicos, 4 triggers, FK (cascada y restrict), funciones SECURITY INVOKER con search_path vacío y sin EXECUTE para PUBLIC, anon ni authenticated
OK   SQL HU-41 (regresión tras la 029) 2: anon y authenticated no leen, escriben ni ejecutan; service_role solo SELECT e INSERT y UPDATE (version) en incidentes
OK   SQL HU-41 (regresión tras la 029) 3: el responsable añade una nota; devuelve id, tipo, texto recortado, autor, hora y repetido=false
OK   SQL HU-41 (regresión tras la 029) 4: registrada_en la fija el servidor (ignora 2000-01-01) y secuencia es GENERATED ALWAYS
OK   SQL HU-41 (regresión tras la 029) 5: UPDATE, DELETE directo y TRUNCATE dan ENTRADA_BITACORA_INMUTABLE; service_role no puede actualizar; la entrada sigue intacta
OK   SQL HU-41 (regresión tras la 029) 6: otro rescatista o un UUID desconocido reciben NO_ES_RESPONSABLE con el responsable vigente, sin escribir
OK   SQL HU-41 (regresión tras la 029) 7: localizado admite entradas; cerrado da INCIDENTE_CERRADO; inexistente da INCIDENTE_NO_ENCONTRADO
OK   SQL HU-41 (regresión tras la 029) 8: nulos, vacío, solo blancos y 2001 caracteres dan DATOS_INVALIDOS; 2000 pasa; el texto se guarda recortado; la interna valida el tipo
OK   SQL HU-41 (regresión tras la 029) 9: la corrección es una entrada nueva y la original no cambia; CORRECCION_INVALIDA; CHECK y FK compuesta en INSERT directo
OK   SQL HU-41 (regresión tras la 029) 10: idempotencia (misma entrada con repetido=true), otro contenido, actor o UUID de incidentes/eventos_plan dan OPERACION_YA_REGISTRADA
OK   SQL HU-41 (regresión tras la 029) 11: tras el relevo R1 recibe NO_ES_RESPONSABLE (vigente R2), R2 escribe, la autoría se conserva y el reintento previo da repetido=true
OK   SQL HU-41 (regresión tras la 029) 12: 5 entradas en la misma transacción salen en orden estricto por (registrada_en, secuencia), sin empates en secuencia
OK   SQL HU-41 (regresión tras la 029) 13: con UPDATE (version) la RPC funciona; sin ningún UPDATE sobre incidentes da insufficient_privilege (dependencia documentada)
OK   SQL HU-41 (regresión tras la 029) 14: la interna anexa el cierre junto al UPDATE a cerrado, un segundo cierre da OPERACION_YA_REGISTRADA y la RPC pública da INCIDENTE_CERRADO
OK   SQL HU-41 (regresión tras la 029) 15: borrar la expedición arrastra incidente y entradas (con una corrección); borrar el perfil del autor queda restringido
OK   SQL HU-41 (regresión tras la 029) 16: la 019 quedó registrada en treksafe_migraciones

== Concurrencia con sesiones reales ==
OK   (a) el relevo toma la fila primero: la lectura de A espera y luego recibe NULL (0 datos); B recibe la ficha
OK   (b) el cierre toma la fila primero: la lectura del responsable espera y luego recibe NULL; no queda ninguna fila de auditoría
OK   (b2) la lectura toma FOR SHARE primero: el relevo espera a que termine la transacción de lectura y después B recibe la ficha
OK   (b3) 20 rondas de relevo y lectura simultáneos: sin interbloqueos (40P01); tras el relevo A recibe NULL y B siempre recibe la ficha
OK   (c) 20 registros de auditoría desde 2 sesiones a la vez: 20 filas con id distinto y ninguna con datos de salud
OK   (d) un error forzado al insertar la auditoría revierte la RPC: 0 filas

== Suite TypeScript (hu50Postgres.integration.test.ts) ==
     # tests 17 · # pass 17 · # fail 0 · # skipped 0
OK   contrato del DAO, fachada y descifrado reales sobre Postgres (node --test)

================ Resumen HU-50 ================
PostgreSQL: PostgreSQL 17.6 on x86_64-windows, compiled by msvc-19.44.35217, 64-bit
Casos: 50 · pasaron: 50 · fallaron: 0
```

## Regresión: `test-hu42-postgres.mjs` (resumen)

```text
================ Resumen HU-42 ================
PostgreSQL: PostgreSQL 17.6 on x86_64-windows, compiled by msvc-19.44.35217, 64-bit
Casos: 39 · pasaron: 39 · fallaron: 0
```

Con la 029 aplicada la suite de HU-42 sigue completa: 13 casos SQL, 16 de HU-41, 9 de concurrencia y 20 pruebas TypeScript (39 de 39 casos del script).

## Regresión: `test-hu41-postgres.mjs` (resumen)

```text
================ Resumen HU-41 ================
PostgreSQL: PostgreSQL 17.6 on x86_64-windows, compiled by msvc-19.44.35217, 64-bit
Casos: 23 · pasaron: 23 · fallaron: 0
```

## Regresión: `test-hu43-integracion.mjs` (resumen)

```text
OK API y PostgreSQL conservan el conjunto y desempatan por fecha e id
OK el SDK y SQL cuentan participantes reales e incluyen al senderista individual
OK HTTP conserva permisos y rechaza criterios inválidos
OK consola y API muestran el orden por tiempo con coordinación vigente
OK consola y API cambian al tamaño del grupo conservando las cuatro expediciones
OK la zona y el criterio se combinan y la vista cabe a 320 píxeles
OK las consultas y la consola conservan estados, plazos, acompañantes y coordinación persistidos
Resultado: 7 casos aprobados. Evidencia en docs/evidencias/hu-43-local.
```

Ejecutado con `node --import tsx scripts/test-hu43-integracion.mjs --pg-bin "C:\Program Files\PostgreSQL\17\bin"` desde `backend`. El script regenera cuatro archivos de `docs/evidencias/hu-43-local`; se restauraron con `git checkout` para no incluir evidencia ajena en este PR.

## Qué demuestra la concurrencia

| Caso | Demuestra |
|---|---|
| (a) | Si el relevo toma la fila primero, la lectura del responsable anterior espera y, tras el `COMMIT`, recibe `NULL`; el nuevo responsable recibe la ficha. |
| (b) | Si el cierre toma la fila primero, la lectura espera y recibe `NULL`; no queda fila de auditoría del permitido. |
| (b2) | Si la lectura toma `FOR SHARE` primero, el relevo espera a que termine esa transacción. |
| (b3) | 20 rondas de relevo y lectura simultáneos: sin `40P01`; tras el relevo el anterior recibe `NULL` y el nuevo siempre recibe la ficha. |
| (c) | 20 registros de auditoría desde dos sesiones a la vez: 20 filas con `id` distinto y ninguna con datos de salud. |
| (d) | Un error forzado al insertar la auditoría revierte la RPC: 0 filas. |

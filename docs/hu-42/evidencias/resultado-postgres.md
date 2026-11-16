# HU-42 · Resultado de la suite contra PostgreSQL desechable

- Fecha: 2026-11-11.
- Comando: `node backend/scripts/test-hu42-postgres.mjs --pg-bin "C:\Program Files\PostgreSQL\17\bin"` (Docker no estaba disponible en esta máquina).
- Servidor: PostgreSQL 17.6 (x86_64-windows), clúster temporal en `127.0.0.1:55432`, base `treksafe_desechable`, roles de Supabase emulados con los privilegios por defecto (`ALL` para `service_role`). El script se niega a conectarse a cualquier host que no sea local o a una base sin "desechable" en el nombre. No se tocó Supabase ni ningún entorno remoto.
- Código: `origin/develop` en 8468edf más los commits de HU-42 en la rama `feat/hu-42-cerrar-incidente` (la 025 y todo lo demás ya confirmado en la rama).
- Resultado: **39 de 39 casos** (13 de la suite SQL de HU-42, 16 de la suite SQL de HU-41 como regresión, 9 de concurrencia con sesiones reales y 1 que agrupa la suite TypeScript, que ejecutó 20 pruebas: 18 del contrato del DAO sobre Postgres real y 2 de casos de uso).

```text
Creando clúster temporal en <carpeta temporal> (puerto 55432)...

PostgreSQL: PostgreSQL 17.6 on x86_64-windows, compiled by msvc-19.44.35217, 64-bit
Modo: --pg-bin C:\Program Files\PostgreSQL\17\bin · 127.0.0.1:55432/treksafe_desechable

init_schema.sql y 25 migraciones previas aplicados (000 a 019 y 022 a 024, con la 015), más la 025.

== Suite SQL HU-42 (tests/hu42_cerrar_incidente.test.sql) ==
OK   SQL HU-42 1: RLS, política, uniques, CHECK de resultado y resumen, FK (cascada y restrict, ninguno hacia la bitácora), 4 triggers, columnas sin datos médicos, funciones SECURITY INVOKER con search_path vacío y sin EXECUTE para PUBLIC, anon ni authenticated
OK   SQL HU-42 2: anon y authenticated no leen, escriben ni ejecutan; service_role solo SELECT e INSERT en informes y UPDATE (estado, cerrado_en, version) en incidentes
OK   SQL HU-42 3: marcar localizado (solo el responsable, una nota fija, version+1, repetición sin escribir, ya localizado, no responsable con el vigente, inexistente, UUID ajeno y datos nulos)
OK   SQL HU-42 4: el cierre devuelve el informe; cerrado_en del informe = el del incidente, version+1, entrada cierre con el resumen y operacion_id = comando
OK   SQL HU-42 5: resultado fuera del catálogo, resumen vacío, en blanco o de 2001 y datos nulos dan DATOS_INVALIDOS sin escribir; 2000 caracteres se acepta
OK   SQL HU-42 6: abierto da INCIDENTE_NO_LOCALIZADO; no responsable, 403 con el vigente; inexistente; tras un relevo A recibe NO_ES_RESPONSABLE y B cierra; los rechazos no escriben
OK   SQL HU-42 7: mismo comando = mismo informe (repetido); otros datos = OPERACION_YA_REGISTRADA; otro comando sobre cerrado = INCIDENTE_CERRADO; sobrevive al relevo; comandos usados en una nota, un incidente o localizado se rechazan
OK   SQL HU-42 8: tras el cierre la bitácora conserva ids, textos y horas, el cierre va al final y es único; la RPC de HU-41 y localizar dan INCIDENTE_CERRADO
OK   SQL HU-42 9: el incidente queda cerrado con cerrado_en, sin otro incidente abierto en la expedición; el último cierre se lee por expedición (NULL si no hay)
OK   SQL HU-42 10: con la expedición en alerta y en completada, expediciones (estado, version, actualizado_en y toda la fila) queda idéntica y no hay eventos, avisos ni outbox nuevos
OK   SQL HU-42 11: UPDATE, DELETE directo y TRUNCATE del informe dan INFORME_CIERRE_INMUTABLE; service_role no puede actualizar; la cascada del ARCO arrastra incidente, entradas e informe; el autor queda restringido
OK   SQL HU-42 12: con REVOKE de tabla y GRANT (responsable_id, version, asumido_en) el cierre falla con permission denied; con GRANT (estado, cerrado_en, version) funciona
OK   SQL HU-42 13: la 025 quedó registrada en treksafe_migraciones

== Suite SQL HU-41 (regresión tras la 025) (tests/hu41_bitacora_incidente.test.sql) ==
OK   SQL HU-41 (regresión tras la 025) 1 a 16: los 16 casos pasan sin cambios (la salida completa de cada caso está en resultado-postgres.md de HU-41)

== Concurrencia con sesiones reales ==
OK   (a) el relevo toma la fila primero: el cierre de A espera y luego recibe NO_ES_RESPONSABLE con el nuevo responsable; 0 informes
OK   (b) dos cierres con comandos distintos: A toma el bloqueo, B espera y recibe INCIDENTE_CERRADO; 1 informe y 1 entrada de cierre
OK   (b2) 10 rondas de dos cierres simultáneos (Promise.all): exactamente un éxito por ronda y un solo informe
OK   (c) el mismo comando a la vez desde 2 conexiones: ambas responden, una con repetido=false y otra con true, y hay un solo informe
OK   (d1) una nota de HU-41 toma la fila primero: el cierre espera y la nota queda antes de la entrada de cierre
OK   (d2) el cierre toma la fila primero: la nota de HU-41 espera y recibe INCIDENTE_CERRADO; el cierre queda como última entrada
OK   (d3) 20 rondas de nota y cierre simultáneos: sin interbloqueos (40P01), el cierre siempre es la última entrada
OK   (e) un error forzado al insertar el informe revierte todo: 0 informes, 0 entradas de cierre, el incidente sigue localizado y la versión no cambia
OK   (f) marcar localizado con el mismo operacionId a la vez: una escribe y la otra repite; una sola nota y una sola subida de versión

== Suite TypeScript (hu42Postgres.integration.test.ts) ==
     # tests 20 · # pass 20 · # fail 0 · # skipped 0
OK   contrato del DAO y casos de uso reales sobre Postgres (node --test)

================ Resumen HU-42 ================
PostgreSQL: PostgreSQL 17.6 on x86_64-windows, compiled by msvc-19.44.35217, 64-bit
Casos: 39 · pasaron: 39 · fallaron: 0
```

(En la salida real las 16 líneas de la regresión de HU-41 salen una por una, con el prefijo `SQL HU-41 (regresión tras la 025) n:`; aquí se resumen en una.)

## Regresión: `test-hu41-postgres.mjs`

- Comando: `node backend/scripts/test-hu41-postgres.mjs --pg-bin "C:\Program Files\PostgreSQL\17\bin"`, sobre el mismo código (sin la 025, que ese script no aplica).
- Resultado: **23 de 23 casos** (16 SQL, 6 de concurrencia y 1 de la suite TypeScript con 15 pruebas), igual que en HU-41.

## Regresión: `test-dep108-postgres.mjs`

- **No se pudo ejecutar.** El script exige `--postgrest <postgrest.exe>` (PostgREST 16.5) y no hay ningún binario en esta máquina; sin él termina con "Usar --pg-bin <bin> --postgrest <postgrest.exe>".
- Análisis: el script solo aplica `015`, `022`, `023` y `024` sobre una base con las migraciones históricas y ejecuta las suites TypeScript de HU-30, 31, 36 y 41; la 025 no participa. Se propone (sin tocarlo) añadir `025_hu42_cerrar_incidente` a `newMigrations` y `42` al bucle `[30, 31, 36, 41]`.

## Hallazgo durante la ejecución

La primera versión de la 025 incluía una FK de `informes_cierre_incidente` hacia `entradas_bitacora_incidente`. La regresión de la suite SQL de HU-41 falló en su caso 5 (`TRUNCATE` de la bitácora: "cannot truncate a table referenced in a foreign key constraint" en lugar de `ENTRADA_BITACORA_INMUTABLE`). Se eliminó esa FK y la regresión quedó en 16 de 16 (ver "Desviaciones respecto al plan" en `diseno.md`).

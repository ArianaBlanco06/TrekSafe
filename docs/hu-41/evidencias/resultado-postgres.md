# HU-41 · Resultado de la suite contra PostgreSQL desechable

- Fecha: 2026-11-10.
- Comando: `node backend/scripts/test-hu41-postgres.mjs --pg-bin "C:\Program Files\PostgreSQL\17\bin"` (Docker no estaba disponible en esta máquina).
- Servidor: PostgreSQL 17.6 (x86_64-windows), clúster temporal en `127.0.0.1:55432`, base `treksafe_desechable`, roles de Supabase emulados con los privilegios por defecto (`ALL` para `service_role`). El script se niega a conectarse a cualquier host que no sea local o a una base sin "desechable" en el nombre.
- Código: base `origin/develop` en 3b61042 más los cambios de HU-41 en el árbol de trabajo (aún sin commit).
- Resultado: **23 de 23 casos** (16 de la suite SQL, 6 de concurrencia con sesiones reales y 1 que agrupa la suite TypeScript, que ejecutó 15 pruebas: 13 del contrato del DAO sobre Postgres real y 2 de casos de uso).

```text
Creando clúster temporal en <carpeta temporal> (puerto 55432)...

PostgreSQL: PostgreSQL 17.6 on x86_64-windows, compiled by msvc-19.44.35217, 64-bit
Modo: --pg-bin C:\Program Files\PostgreSQL\17\bin · 127.0.0.1:55432/treksafe_desechable

init_schema.sql y 20 migraciones previas aplicados (hasta la 018), más la 019.

== Suite SQL (migrations/tests/hu41_bitacora_incidente.test.sql) ==
OK   SQL 1: RLS, política, índice de cierre único, columnas sin datos médicos, 4 triggers, FK (cascada y restrict), funciones SECURITY INVOKER con search_path vacío y sin EXECUTE para PUBLIC, anon ni authenticated
OK   SQL 2: anon y authenticated no leen, escriben ni ejecutan; service_role solo SELECT e INSERT y UPDATE (version) en incidentes
OK   SQL 3: el responsable añade una nota; devuelve id, tipo, texto recortado, autor, hora y repetido=false
OK   SQL 4: registrada_en la fija el servidor (ignora 2000-01-01) y secuencia es GENERATED ALWAYS
OK   SQL 5: UPDATE, DELETE directo y TRUNCATE dan ENTRADA_BITACORA_INMUTABLE; service_role no puede actualizar; la entrada sigue intacta
OK   SQL 6: otro rescatista o un UUID desconocido reciben NO_ES_RESPONSABLE con el responsable vigente, sin escribir
OK   SQL 7: localizado admite entradas; cerrado da INCIDENTE_CERRADO; inexistente da INCIDENTE_NO_ENCONTRADO
OK   SQL 8: nulos, vacío, solo blancos y 2001 caracteres dan DATOS_INVALIDOS; 2000 pasa; el texto se guarda recortado; la interna valida el tipo
OK   SQL 9: la corrección es una entrada nueva y la original no cambia; CORRECCION_INVALIDA; CHECK y FK compuesta en INSERT directo
OK   SQL 10: idempotencia (misma entrada con repetido=true), otro contenido, actor o UUID de incidentes/eventos_plan dan OPERACION_YA_REGISTRADA
OK   SQL 11: tras el relevo R1 recibe NO_ES_RESPONSABLE (vigente R2), R2 escribe, la autoría se conserva y el reintento previo da repetido=true
OK   SQL 12: 5 entradas en la misma transacción salen en orden estricto por (registrada_en, secuencia), sin empates en secuencia
OK   SQL 13: con UPDATE (version) la RPC funciona; sin ningún UPDATE sobre incidentes da insufficient_privilege (dependencia documentada)
OK   SQL 14: la interna anexa el cierre junto al UPDATE a cerrado, un segundo cierre da OPERACION_YA_REGISTRADA y la RPC pública da INCIDENTE_CERRADO
OK   SQL 15: borrar la expedición arrastra incidente y entradas (con una corrección); borrar el perfil del autor queda restringido
OK   SQL 16: la 019 quedó registrada en treksafe_migraciones

== Concurrencia con sesiones reales ==
OK   (a) el relevo toma la fila primero: la escritura de A espera y luego recibe NO_ES_RESPONSABLE con el nuevo responsable
OK   (b) A escribe primero: el UPDATE del relevo espera; la entrada de A queda con autor A y después A se rechaza y B escribe
OK   (c) el cierre bloquea igual: A espera y luego recibe INCIDENTE_CERRADO; lo escrito antes del cierre se conserva
OK   (d) 20 escrituras simultáneas del responsable desde 2 conexiones: 20 ids distintos y un orden total sin empates
OK   (e) el mismo operacionId a la vez desde 2 conexiones: ambas responden, una con repetido=false y otra con true, y hay una sola fila
OK   (f) un error forzado al insertar revierte todo: 0 entradas

== Suite TypeScript (hu41Postgres.integration.test.ts) ==
     # tests 15 · # pass 15 · # fail 0 · # skipped 0
OK   contrato del DAO y casos de uso reales sobre Postgres (node --test)

================ Resumen HU-41 ================
PostgreSQL: PostgreSQL 17.6 on x86_64-windows, compiled by msvc-19.44.35217, 64-bit
Casos: 23 · pasaron: 23 · fallaron: 0
```

## Qué no cubre

- No es Supabase: PostgREST no participa (la suite TypeScript usa un puente `fetch` que ejecuta el SQL real como `service_role`). Queda para la prueba manual en DEV que `error.message` y `error.details` de un `RAISE EXCEPTION ... USING DETAIL` lleguen igual por PostgREST y que el embed `perfiles_rescatista(nombre_completo)` funcione con el esquema recargado.
- Los privilegios por defecto de DEV pueden diferir de la emulación: Ariana debe confirmar `SELECT has_table_privilege('service_role','public.incidentes','UPDATE')` en DEV (consulta de solo lectura).

# Acreditación técnica #107 y #108

Corte local: 14 de noviembre de 2026, hora Lima. Base `develop` **8f9c4fed0b8a798e04f7e909f1c19d82e8222d92**, con las 25 HU y SQL hasta `031` de HU-48. Rama aislada `codex/cierre-po-r2-backend`. Esta evidencia corresponde al código local y a PostgreSQL/PostgREST desechables; no declara despliegue ni aceptación del PO.

## Resultados ejecutados

Node **22.23.4**, PostgreSQL **17.11**, PostgREST **16.5**. Tipos y build de backend aprobados; **1147 pruebas backend aprobadas**, cero fallos. La suite general muestra grupos de integración SQL omitidos cuando sus variables no están presentes; el contador global `skipped=0` de Node no significa que esos grupos se hayan ejecutado.

El runner DEP108 ampliado aprobó **34 escenarios**, incluyendo instalación académica vacía, actualización con datos históricos, atomicidad, concurrencia, permisos, SQL HU-50 y heartbeat. Dentro del runner se ejecutaron **80 contratos/casos TypeScript** sobre DB real: HU-30 (9), HU-31 (27), HU-36 (9), HU-41 (15), HU-42 (20), sin omisiones. Son grupos incluidos en los escenarios; no sumar como casos únicos independientes.

Pruebas de SDK reales: creación, colecciones y propiedad; outbox, exclusión entre consumidores, simulación distinguida de envío real, caída tras aceptación, reinicio sin reenvío ciego, reintento manual concurrente/idempotente, retorno atómico y heartbeat privado. Ninguna prueba envió correo real ni conectó a servicios compartidos.

Logs locales: `.local-evidence/backend-tests.log`, `backend-typecheck.log`, `backend-build.log` y **`dep108-final.log`**. El runner imprime la carpeta temporal y acredita apagado de PostgreSQL. Una ejecución intermedia de exportación pasó los 33 escenarios SQL y PostgREST terminó con código 3 sin detalle suficiente para atribuir una causa; se conservó ese log (`dep108-completo.log`). Un reintento sin cambiar código aprobó los 34 escenarios y SDK. El coordinador debe repetir las verificaciones afectadas tras integrar cambios de los otros agentes y adjuntar CI del commit final.

Reproducción: `npm run typecheck --prefix backend`, `npm test --prefix backend`, `npm run build --prefix backend` y `node backend/scripts/test-dep108-postgres.mjs --pg-bin <bin-postgresql-17> --postgrest <ejecutable-postgrest>`, con Node 22. El runner PostgreSQL no carga `.env` y solo utiliza bases nuevas en loopback.

## Matriz #107

| Criterio | Comprobación y evidencia actual | Estado |
|---|---|---|
| Aplicación/dominio dependen de contratos | Prueba estática `desacoplamiento.test.ts`, composición inyectada y adaptadores | Aprobado local |
| API y tareas construibles independientemente | Entradas `api.ts`/`worker.ts`, pruebas `arranque.test.ts`, mismo build | Aprobado local; integración operativa final en #109 |
| Sustituir reloj, repositorio y correo sin servicios reales | Fixtures, fábricas HTTP y prueba de importación sin `.env`, red, temporizadores o señales | Aprobado local; incluye importación del adaptador nuevo |
| Compatibilidad, roles y propiedad | Suite backend completa sobre base con HU-39 a HU-50 | Aprobado local; regresión del commit integrado pendiente |
| Documentación, deuda y comandos | Dossier histórico `docs/dep-107` más este corte y alcance por entorno | Acreditado documentalmente |

La revisión técnica del alcance original de #107 tiene evidencia local favorable. El cierre en GitHub requiere que el coordinador revise el commit integrado y su CI; este agente no cierra issues ni registra aceptación humana.

## Matriz #108

| Criterio | Comprobación y evidencia actual | Estado |
|---|---|---|
| Instalación nueva y actualización con datos | Dos bases distintas; catálogo completo hasta 031 más 032; bootstrap sin usuarios/registro institucional; repetición aborta conservando OID | Aprobado local |
| Atomicidad de expedición y avisos | Fallos inyectados en vínculos, acompañantes, evento/aviso y outbox, con reversión conjunta | Aprobado local |
| Versión, reintentos y concurrencia | Dos creaciones, promoción/creación, ampliación/vencimiento, dos evaluadores, cancelación tras espera, reintento manual real | Aprobado local |
| Permisos, roles, actor y propiedad | service_role real; rechazo anon/authenticated; RPC y RLS; SQL HU-50 y señales privadas | Aprobado local |
| Versiones de esquema por entorno | Inventario DEV de solo lectura hasta 031; 032 preparada y aún no aplicada | **Parcial: gate 032 de Ariana** |
| Actualización y recuperación | Orden reproducible, bootstrap solo vacío, conservación de esquema/pendientes e imágenes compatibles | Ensayado local; recuperación publicada en #110/#112 |

**No cerrar #108 automáticamente por este dossier.** La base DEV actual hasta 031 y el soporte nuevo 032 tienen estados distintos. No se acredita que el worker nuevo funcione en DEV o publicado hasta aplicar y verificar 032 en su destino, por la persona responsable. No usar un `Closes #108` que oculte ese gate.

## DEV: observación y límites

El coordinador guardó `dev-inventario.json` mediante consulta de solo lectura al proyecto `ibnwggvqgjpeqcretjak`, el **2026-11-15 02:34 UTC** (14/11 21:34 Lima). Encontró 34 asientos hasta 031, 33 tablas con RLS y 68 RPC TrekSafe sin ejecución para anon/authenticated. El asiento 031 registra 2026-11-14 05:57:08 UTC y ejecutor `postgres`; no identifica por sí solo la persona que lo aplicó ni acredita igualdad integral con el archivo de Git.

Se compararon las huellas `md5(replace(pg_get_functiondef(oid),chr(13),''))` de las 68 funciones DEV con la instalación nueva local: **67 coinciden exactamente**. La única diferencia, `treksafe_actualizar_lista_equipo`, es el comentario interno «El bloqueo serializa edición y eliminación sobre la misma lista.». Retirarlo de la fuente DEV capturada por el coordinador produce exactamente el hash local; el diff histórico `6dbd632..8f9c4fe` confirma esa retirada de comentario. No hay una diferencia ejecutable detectada en esa función ni necesidad de aplicar una corrección 033. [Comparación fechada](comparacion-funciones-dev-local.json). Las otras dos funciones locales pertenecen a 032 y no existen todavía en DEV. Esta comparación no acredita igualdad de todos los objetos, datos o funcionamiento publicado.

Los avisos INFO de tablas con RLS y sin políticas en `intentos_outbox`, `retornos_confirmados` y `solicitudes_reintento_outbox` no justifican conceder acceso: con los permisos del cliente revocados, la ausencia de políticas mantiene denegación por defecto. No se añadieron políticas permisivas para silenciar avisos.

En esta ejecución no se realizaron DDL ni fixtures funcionales en DEV. Un intento de elevación del runner con el flag histórico `--dev-check` fue rechazado porque la revisión automática lo interpretó como operación sobre DEV. Se adoptó la alternativa segura sin ese flag; los 34 escenarios acreditados son únicamente locales. La opción histórica lee un SQL y lo ensaya dentro de la base local del runner, pero no se utiliza como evidencia nueva de DEV.

## Entrega y condiciones de cierre

- [Bootstrap académico y orden completo](../../backend/migrations/academico/README.md): instalación vacía sin credenciales conocidas, no aplicable sobre DEV.
- [Paquete 032 para Ariana](paquete-032/README.md): SQL fuente, hashes y verificador de solo lectura. No ejecutado remotamente.
- #109: conectar productores transaccionales y consumidor, corte del legado y recuperación. #110: esquema compatible, publicación, señales y recuperación. #111/#112: privacidad y flujos en la aplicación realmente publicada, correo controlado y aceptación integral.
- La aprobación PO, publicación, cierre de #107/#108 y cierre del release se registran por separado, con fecha y commit reales. No se infieren de pruebas locales ni de asientos de migración.

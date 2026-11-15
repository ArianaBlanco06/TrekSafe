# Revisión independiente de la preparación R2

Candidato revisado inicialmente: `9a649a0`, que integra backend/datos y operación sobre `develop` `8f9c4fe`. Esta revisión documental y de código se realizó en una copia separada, sin escribir en DEV, provisionar servicios ni enviar correos.

## Evidencia comprobada

| Comprobación | Resultado y límite |
|---|---|
| Fuentes de criterios | 25 HU, 75 CA únicas y seis tareas PO; se conserva texto y casillas capturadas. HU39–HU50 tienen casillas sin marcar aunque sus issues estén cerrados. |
| Regresión backend integrada | Repetición del coordinador sobre `bc2c471`: Node 22.23.4, 1173 aprobadas, cero fallos; tipos y compilación aprobados. Se comprobó el resumen del log; incluye los tres casos nuevos de verificación SMTP. Diez grupos SQL condicionales figuran `SKIP` en el texto, aunque el resumen Node muestre cero omitidas. La ejecución anterior `9a649a0` aprobó 1170. No sumar ambas ejecuciones. |
| PostgreSQL/PostgREST integrado | Log del coordinador: 34 escenarios aprobados, PostgreSQL 17.11 y SDK contra PostgREST real; incluye 80 contratos TypeScript activos. PostgreSQL temporal detenido en puerto 54713. No sumar estos recuentos a las 1170 como pruebas únicas. |
| Paquete 032 | Se recalcularon y compararon SHA256 normalizados CRLF→LF de migración 032, verificador SQL y bootstrap académico; coinciden los tres con el manifiesto. No se aplicó SQL remoto. |
| Inventario DEV | Evidencia de solo lectura hasta 031; comparación de 68 funciones con 67 hashes idénticos y una diferencia de comentario. Este informe comprueba coherencia del dossier; no repite la consulta remota ni certifica objetos/datos completos. |
| Matriz | El generador verifica 75 identificadores únicos, seis tareas y existencia de cada archivo de evidencia. Es trazabilidad, no una ejecución funcional ni cobertura probada de cada CA. |

Los logs locales del coordinador son `docs/cierre-r2/backend-integrado.log` y `docs/cierre-r2/postgres-integrado.log` en la copia de integración, excluidos de Git. El PR debe adjuntar la ejecución CI del SHA definitivo y un resumen persistente. El runner SQL pertenece a `9a649a0`; después no cambió SQL. Los logs no se atribuyen automáticamente a cambios posteriores fuera del alcance comprobado.

## Hallazgos y seguimiento

1. **Conteo de omisiones SQL corregido:** el dossier operativo contaba siete grupos; la revisión completa del log muestra diez. Se corrigió el texto y se separó del alcance de los 34 escenarios PostgreSQL/PostgREST.
2. **Verificación SMTP durante arranque, corregida:** se confirmó un transportador legado sin tiempos límite que podía prolongar el inicio antes de registrar señales. El cambio `d78e43e` del agente responsable, integrado por el coordinador, limita la conexión y saludo a 10 segundos y el socket a 30; aplica además un deadline absoluto de 30 segundos, cierra el transportador en éxito/error/timeout y lo descarta. En producción evita prolongar el arranque consultando la IP externa. Se revisaron los tres casos automatizados de verificación colgada, éxito con nueva instancia y rechazo inmediato; el coordinador debe conservar su ejecución integrada. Brevo API, transporte elegido en el roadmap, solo comprueba configuración en ese paso; ello no valida autenticación remota ni recepción.
3. **Tablero y aceptación son evidencias distintas:** el cierre de las HU y sus casillas no son consistentes; se preservó la captura y todas las aceptaciones publicadas se mantienen pendientes. La prueba smoke propuesta no cubre 75 CA.
4. **Credenciales en errores de Playwright, corregido:** se reprodujo localmente con Edge que un campo password deshabilitado provoca un error `locator.fill` cuyo CallLog incluye la clave ficticia. El helper ahora sustituye errores de ambos campos por un mensaje genérico sin causa y con acción acotada. Un reporter exclusivo del runner publicado conserva resultado/título/duración sin errores, pasos, adjuntos ni salida cruda; el ejecutor deshabilita DEBUG/PWDEBUG y el snapshot automático de página, y no conserva salida por prueba. Se ejecutaron ocho pruebas de configuración/privacidad, tipos de tests y un timeout real en Edge con datos ficticios; todos aprobaron. El fallo sigue registrado como fallo, no como aprobación. La reproducción no usó credenciales ni URLs remotas.

Revisión de los cambios A/B: ciclos independientes sin solapamiento local y cierre esperando trabajo; transacción de plazos sin envío directo; permisos privados de heartbeat y señal degradada para errores, pendientes antiguos y alertas sin outbox; timeout/resultado incierto evita reenvío automático; bootstrap restringido a base vacía y orden explícito sin glob. No se identificó otro defecto bloqueante confirmado en esta lectura. Esta conclusión no sustituye la validación publicada ni las pruebas de recursos gratuitos.

## Revisión adicional de PWA y prueba publicada

Se inspeccionó el cambio C `d2da171`, incorporado en el candidato `7a0bcdf`: el gestor comparte las consultas por recurso y sesión, separa filtros, aborta al ocultar y descarta respuestas por revisión/sesión. Las cancelaciones repetidas no eliminan una entrada nueva; un consumidor que recibe el dato compartido termina su estado de carga. Se revisaron el hook y sus cinco consumidores actuales. El retorno tras login acepta únicamente rutas locales del rol autenticado; el logout voluntario descarta el destino anterior.

El runner publicado exige dominio HTTPS y entorno académico, versión declarada y habilitación expresa de cuentas ficticias/escrituras para login. Utiliza el dominio proporcionado y Service Worker real; no arranca el servidor local ni configura mocks. Las credenciales quedan en variables de entorno y se desactivan trazas, capturas y video. Su alcance se identifica como smoke parcial y el commit/esquema se registran como **declarados**: deben contrastarse con el despliegue y registro reales. No demuestra las 75 CA ni la versión que ejecuta una URL por sí solo.

El coordinador repitió la validación integrada sobre `bc2c471` con Node 22: tipos de aplicación/UI/tests y build aprobados; 303 pruebas unitarias aprobadas y dos integraciones SQL omitidas, 13 pruebas UI (10,7 s), 32 PWA con Service Worker (30,8 s), seis de configuración y una medición controlada. Se comprobaron directamente los resúmenes de sus logs `frontend-integrado.log`, `config-publicado-integrado.log`, `medicion-integrada.log`, `ui-integrada.log` y `pwa-integrada.log`. La repetición usó Edge en puertos locales 5383/5384, sin servicios publicados. Estos resultados no se repitieron desde esta copia de QA. La medición con reloj simulado y respuesta vacía local idéntica produjo 11 consultas visibles, cero ocultas y una al volver; la comparación documentada es 22→11 visibles y 20→0 ocultas. La carga inicial y el rendimiento publicado permanecen pendientes. No se detectó otro defecto bloqueante confirmado en la lectura de estos cambios.

## Revisión adicional del despliegue preparado

Se revisó el paquete D `f9f6972`, integrado como `6b7f93d`, y sus ajustes posteriores de unidad DuckDNS: Dockerfile/contexto sin `.env`, construcción fuera de las VM, label de revisión, Compose con API+Caddy y worker separados, puertos públicos limitados a HTTPS/HTTP y API en loopback, archivos de entorno por rol, logs/memoria acotados y cierre del worker con margen de 150 segundos. El actualizador DNS no incluye el token en argumentos o mensajes. El preflight valida campos sin imprimir valores y rechaza el host DEV compartido y etiquetas mutables. Su confirmación Always Free y versión de esquema son declarativas y se documenta la verificación humana/remota necesaria.

El workflow construye e importa entradas de la imagen en PR sin publicar ni usar secretos, después de las tres validaciones. Solo un push a ramas confiables puede publicar GHCR, comprobando visibilidad privada antes/después y conservando digest/SHA. La revisión de este texto no acredita que Docker o Compose hayan pasado: ambos requieren el check CI. D y el coordinador informaron diez pruebas Python del preflight aprobadas; no se repitieron desde esta copia de QA.

El roadmap comienza con la cuenta Oracle que el PO aún no tiene y exige capacidad gratuita para dos VM de 50 GB; no permite sustituir con recursos pagados. Explica cuotas/inactividad, proyecto académico separado, orden de esquema, padrón ficticio previo al registro, imagen/dominio/PWA/worker, monitoreo, recepción real, recursos observados, respaldo/restauración y rollback compatible. Las guardas SQL del padrón no prueban automáticamente el host; el texto exige comprobar la consola/ref de destino y no se ejecutó ese bloque. Los manifiestos se contrastan con Vercel SHA, digest/label y ledger, y todas las tareas de publicación/aceptación conservan su estado pendiente. No se identificó otro bloqueo confirmado en esta lectura.

La revalidación puntual DEV del coordinador el `2026-11-15T17:45:50Z` volvió a encontrar 34 asientos, última migración numerada 031, sin asiento 032 ni tabla `estado_worker`. Se comprobó el archivo persistente; no se repitió desde QA la consulta ni el inventario integral. El [resumen integrado](evidencia-integrada.json) registra por candidato y entorno las ejecuciones del coordinador; las pruebas adicionales de privacidad se añaden por su commit y CI final.

## Gates que siguen abiertos

- Revisión/CI del SHA final y aprobación exigida por las reglas del repositorio.
- Aplicación y verificación de 032 por Ariana en DEV; nuevo proyecto académico con registro real de esquema.
- Creación de cuenta Oracle, capacidad Always Free, servicios académicos y URLs verificadas.
- Evidencia publicada de recepción real de correo, privacidad/PWA, carga, reinicios, restauración y medición de recursos.
- Resultado por cada una de las 75 CA y todos los criterios TECH; defectos bloqueantes resueltos y decisión verificable del PO.

Por estas condiciones no se recomienda cerrar #108–112 ni declarar cerrado Release 2 a partir de esta preparación. #107 tiene evidencia técnica local favorable, pero su cierre requiere revisión del candidato integrado y trazabilidad en GitHub.

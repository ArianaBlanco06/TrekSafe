# Revisión independiente de la preparación R2

Candidato revisado inicialmente: `9a649a0`, que integra backend/datos y operación sobre `develop` `8f9c4fe`. Esta revisión documental y de código se realizó en una copia separada, sin escribir en DEV, provisionar servicios ni enviar correos.

## Evidencia comprobada

| Comprobación | Resultado y límite |
|---|---|
| Fuentes de criterios | 25 HU, 75 CA únicas y seis tareas PO; se conserva texto y casillas capturadas. HU39–HU50 tienen casillas sin marcar aunque sus issues estén cerrados. |
| Regresión backend integrada | Log del coordinador: Node 22.23.4, 1170 aprobadas, cero fallos; tipos y compilación aprobados según ejecución del coordinador. Diez grupos SQL condicionales figuran `SKIP` en el texto, aunque el resumen Node muestre cero omitidas. |
| PostgreSQL/PostgREST integrado | Log del coordinador: 34 escenarios aprobados, PostgreSQL 17.11 y SDK contra PostgREST real; incluye 80 contratos TypeScript activos. PostgreSQL temporal detenido en puerto 54713. No sumar estos recuentos a las 1170 como pruebas únicas. |
| Paquete 032 | Se recalcularon y compararon SHA256 normalizados CRLF→LF de migración 032, verificador SQL y bootstrap académico; coinciden los tres con el manifiesto. No se aplicó SQL remoto. |
| Inventario DEV | Evidencia de solo lectura hasta 031; comparación de 68 funciones con 67 hashes idénticos y una diferencia de comentario. Este informe comprueba coherencia del dossier; no repite la consulta remota ni certifica objetos/datos completos. |
| Matriz | El generador verifica 75 identificadores únicos, seis tareas y existencia de cada archivo de evidencia. Es trazabilidad, no una ejecución funcional ni cobertura probada de cada CA. |

Los logs locales del coordinador son `docs/cierre-r2/backend-integrado.log` y `docs/cierre-r2/postgres-integrado.log` en la copia de integración, excluidos de Git. El PR debe adjuntar la ejecución CI del SHA definitivo y un resumen persistente; estos logs de un candidato anterior no se atribuyen automáticamente a cambios posteriores.

## Hallazgos y seguimiento

1. **Conteo de omisiones SQL corregido:** el dossier operativo contaba siete grupos; la revisión completa del log muestra diez. Se corrigió el texto y se separó del alcance de los 34 escenarios PostgreSQL/PostgREST.
2. **Verificación SMTP durante arranque:** `ServicioCorreo.verificarConexion()` usa un transportador legado sin tiempos límite explícitos y el worker registra señales después del arranque. Un SMTP que no responde puede prolongar el inicio. Se comunicó al coordinador para corrección por el agente responsable, con deadline efectivo y cierre del transporte. Brevo API, transporte elegido en el roadmap, solo comprueba configuración en ese paso; ello no valida autenticación remota ni recepción. La resolución se registra en la revisión final del candidato.
3. **Tablero y aceptación son evidencias distintas:** el cierre de las HU y sus casillas no son consistentes; se preservó la captura y todas las aceptaciones publicadas se mantienen pendientes. La prueba smoke propuesta no cubre 75 CA.

Revisión de los cambios A/B: ciclos independientes sin solapamiento local y cierre esperando trabajo; transacción de plazos sin envío directo; permisos privados de heartbeat y señal degradada para errores, pendientes antiguos y alertas sin outbox; timeout/resultado incierto evita reenvío automático; bootstrap restringido a base vacía y orden explícito sin glob. No se identificó otro defecto bloqueante confirmado en esta lectura. Esta conclusión no sustituye la validación publicada ni las pruebas de recursos gratuitos.

## Gates que siguen abiertos

- Revisión/CI del SHA final y aprobación exigida por las reglas del repositorio.
- Aplicación y verificación de 032 por Ariana en DEV; nuevo proyecto académico con registro real de esquema.
- Creación de cuenta Oracle, capacidad Always Free, servicios académicos y URLs verificadas.
- Evidencia publicada de recepción real de correo, privacidad/PWA, carga, reinicios, restauración y medición de recursos.
- Resultado por cada una de las 75 CA y todos los criterios TECH; defectos bloqueantes resueltos y decisión verificable del PO.

Por estas condiciones no se recomienda cerrar #108–112 ni declarar cerrado Release 2 a partir de esta preparación. #107 tiene evidencia técnica local favorable, pero su cierre requiere revisión del candidato integrado y trazabilidad en GitHub.

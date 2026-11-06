# HU-34 — Registrar un avance manual de la expedición

Responsable: Andriy Hitoshi Enciso Rojas (@Hitoshi). Release 2, sprint 1, 5 SP. Fecha: 5 de noviembre de 2026.

Estado: fases 1 y 2 completadas mediante análisis y documentación. La funcionalidad todavía no está implementada. Se mantiene el desarrollo gradual de HU-32 y la aplicación de SOLID del curso.

El propietario podrá registrar online su llegada a un punto declarado de una expedición en progreso, con hora del servidor y nota opcional. Un reenvío con el mismo identificador no duplicará el avance. Registrar un avance no confirma el retorno, no amplía el plazo y no evita alertas.

## Mapeado de fases

| Fase | Trabajo | Resultado revisable | Estado |
| --- | --- | --- | --- |
| 1. Preparación y mapa | Leer criterios, revisar la base, identificar dependencias y responsabilidades. | [Mapa inicial](fase-1-mapa.md). | Completada. |
| 2. Contrato | Precisar entradas, respuestas, permisos, idempotencia, notas, tiempo, concurrencia y errores. | [Contrato de avances](fase-2-contrato.md). | Completada; pendiente de implementación y revisión del equipo. |
| 3. Persistencia | Preparar migración incremental, restricciones y operación transaccional sobre los puntos de HU-32. | SQL y pruebas en una base desechable. | Pendiente; Andriy debe finalizar el merge de HU-32. |
| 4. API | Implementar comando, puertos pequeños, adaptador, controlador y rutas autenticadas. | Pruebas de negocio, contrato y HTTP. | Pendiente. |
| 5. Interfaz | Seleccionar punto, escribir nota, enviar online y consultar último avance autorizado. | Estados de carga, envío, error, desconexión y reintento. | Pendiente. |
| 6. Integración | Probar UI → API → PostgreSQL, cron con colaboradores controlados, sesiones y PWA. | Evidencia de aceptación y regresión. | Pendiente. |
| 7. Entrega | Documentar SOLID, resultados, limitaciones y demostración. | Material para que Andriy publique su PR y el equipo lo revise. | Pendiente. |

Cada fase conserva un cambio acotado y sus comprobaciones. Esta entrega no adelanta la implementación de las fases siguientes.

## Dependencia inmediata

La rama de trabajo es `feat/hu-34-avances-manuales`. Durante las fases 1 y 2 sus archivos todavía no incluían HU-32. Después, Andriy inició el merge de `origin/feat/hu-32-puntos`: los archivos de puntos ya están en el árbol de trabajo y se combinaron los seis archivos que presentaron conflictos. Andriy debe marcar la resolución y finalizar el merge mediante Git. Véase [integración de HU-32](integracion-hu32.md). No se certificó la aplicación de su migración en Supabase.

Git, cambios de rama, commits, push y publicación en GitHub quedan exclusivamente a cargo de Andriy. Las fases 1 y 2 solo modificaron documentación; la resolución posterior del merge combina el código existente de HU-32 con la base actual. No se implementaron avances HU-34 ni se modificaron `.env`, configuración de Supabase o bases de datos.

## Decisiones del contrato

El registro se hará mediante `POST /api/expediciones/:id/avances` y el último avance se consultará mediante `GET /api/expediciones/:id/avances/ultimo`. Son rutas especificadas, todavía no implementadas.

La clave de idempotencia será `(senderistaId, solicitudId)`: el reenvío equivalente devuelve el avance original, incluso si la expedición terminó después. Un ID usado con contenido distinto produce conflicto. La hora la asignará PostgreSQL y el registro no modificará el plan, su versión INTEGER ni el cron.

Las decisiones de detalle, ejemplos, errores y comprobaciones se describen en el [contrato de fase 2](fase-2-contrato.md). La fase 1 se conserva como fotografía de la preparación inicial.

# HU-34 — Registrar un avance manual de la expedición

Responsable: Andriy Hitoshi Enciso Rojas (@Hitoshi). Release 2, sprint 1, 5 SP. Fecha: 5 de noviembre de 2026.

Actualización del 8 de noviembre de 2026: fases 1 a 7 implementadas y validadas localmente. Preparado para un PR que cierre el issue #35, revisión técnica y aplicación coordinada de la migración 016. La historia no se marca aceptada o integrada por esta documentación. Se aplica Command/DAO y SOLID.

El propietario podrá registrar online su llegada a un punto declarado de una expedición en progreso, con hora del servidor y nota opcional. Un reenvío con el mismo identificador no duplicará el avance. Registrar un avance no confirma el retorno, no amplía el plazo y no evita alertas.

## Mapeado de fases

| Fase | Trabajo | Resultado revisable | Estado |
| --- | --- | --- | --- |
| 1. Preparación y mapa | Leer criterios, revisar la base, identificar dependencias y responsabilidades. | [Mapa inicial](fase-1-mapa.md). | Completada. |
| 2. Contrato | Precisar entradas, respuestas, permisos, idempotencia, notas, tiempo, concurrencia y errores. | [Contrato de avances](fase-2-contrato.md). | Completada; pendiente de implementación y revisión del equipo. |
| 3. Persistencia | Migración 016 y garantías transaccionales. | [Persistencia](fase-3-persistencia.md). | Validada localmente; no aplicada en DEV. |
| 4. API | Comando, puertos, adaptador y endpoints. | [API y SOLID](fase-4-api.md). | Implementada y probada. |
| 5. Interfaz | Punto, nota, último avance y reintento online. | [Interfaz](fase-5-interfaz.md). | Implementada y probada. |
| 6. Integración | Cadena real, SQL, privacidad y regresión. | [Resultados](fase-6-integracion.md). | Aprobada en entorno desechable. |
| 7. Entrega | Documentación y demostración. | [Entrega](fase-7-entrega.md), [PR](borrador-pr.md). | Preparada; pendiente revisión/CI remoto. |

Las fases 1 y 2 conservan la preparación inicial; las fases 3 a 7 documentan la implementación del 8 de noviembre. Pasaron tipos/builds, 460 pruebas backend, 79 frontend (2 integraciones PostgreSQL omitidas), 13 regresiones UI HU-32, 17 PWA/compatibilidad, 19 comprobaciones SQL y 5 escenarios con API/SDK/PostgREST/PostgreSQL/worker reales. Los grupos se solapan y no certifican Supabase DEV.

## Dependencia inmediata

La rama es `feat/hu-34-avances-manuales`, actualizada con develop en `1f63856`. Ya contiene HU-32 y las demás historias actuales; la [integración anterior de HU-32](integracion-hu32.md) conserva su contexto histórico. HU-33 se entregó primero en PR #97, sin merge; su código no se incluye en esta rama. HU-34 requiere 016 después de 002/010, aún pendiente de instalar por el equipo en DEV.

Andriy autorizó expresamente Git, commits, push y apertura de ambos PR el 8 de noviembre; no se autoriza merge a develop. No se modificaron `.env` o configuración de Supabase y no se ejecutó SQL en la base del equipo. La validación usa bases desechables.

## Decisiones del contrato

El registro usa `POST /api/expediciones/:id/avances` y la consulta `GET /api/expediciones/:id/avances/ultimo`, ya implementados.

La clave de idempotencia será `(senderistaId, solicitudId)`: el reenvío equivalente devuelve el avance original, incluso si la expedición terminó después. Un ID usado con contenido distinto produce conflicto. La hora la asignará PostgreSQL y el registro no modificará el plan, su versión INTEGER ni el cron.

Las decisiones de detalle, ejemplos, errores y comprobaciones se describen en el [contrato de fase 2](fase-2-contrato.md). La fase 1 se conserva como fotografía de la preparación inicial.

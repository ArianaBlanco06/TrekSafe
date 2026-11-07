# HU-32 — Registrar puntos intermedios de la ruta

Responsable: **Andriy Hitoshi Enciso Rojas (@Hitoshi)**. Release 2, sprint 1, **5 SP**.

Revisión posterior solicitada por Ariana para PR #63: HU-26 y la estructura final HU-32 ya están aplicadas y verificadas en DEV según su confirmación. **No volver a ejecutar el SQL en DEV.** La migración se renombra a `010_hu32_puntos_ruta.sql` e incorpora registro condicional para instalaciones nuevas; Ariana registrará únicamente el asiento `010` en DEV tras CI. El listado conserva «Editar», «Gestionar puntos» y «Cancelar» dentro del mismo contenedor con `flex-wrap`. Resultado y pendientes en [revisión PR #63](revision-pr63.md). Los resultados siguientes conservan la fotografía anterior a esta revisión.

Actualización del 5 de noviembre de 2026: contenido de los conflictos con `develop` combinado y validado en `feat/hu-32-puntos`. Pasaron 305 pruebas backend, 64 frontend, 12 UI HU-32, 39 comprobaciones SQL, 28 pruebas de contrato, 9 escenarios integrados reales y 14 escenarios PWA/compatibilidad, además de tipos y builds. Los grupos se solapan y algunas integraciones SQL de otras historias se omiten sin conexión configurada. Andriy debe marcar la resolución y finalizar el merge en Git; CI remoto, revisión y aplicación en DEV siguen pendientes. Véase [integración con develop](integracion-develop.md) y [plantilla del PR](borrador-pr.md).

Estado al 1 de noviembre de 2026: implementación local y validación integrada completadas; paquete preparado para revisión del equipo. La aceptación del PO y la integración en DEV están pendientes. Este documento no cambia el estado del tablero o del backlog.

Actualización del 3 de noviembre de 2026: el equipo indicó `expediciones.version INTEGER` conforme a HU-26. HU-32 se adapta a ese contrato para el PR #63, comunicado por Andriy; véase [ajuste INTEGER](ajuste-integer.md). El commit y push permanecen a cargo de Andriy.

Validación posterior al ajuste: typechecks/builds aprobados, 50 pruebas backend, 12 de interfaz, 39 comprobaciones SQL, 28 de contrato y 9 escenarios integrados aprobados. El runner completo finalizó con código 0 y cerró los procesos temporales.

## Entrega para revisar

| Documento | Uso |
| --- | --- |
| [Ajuste INTEGER para PR #63](ajuste-integer.md) | Contrato compartido con HU-26, límites y verificación posterior a las siete fases. |
| [Cierre de fase 7](fase-7-entrega.md) | Alcance final, comprobaciones de entrega y pendientes con responsables. |
| [Guía de demostración](guia-demostracion.md) | Reproducción automatizada aislada y recorrido manual para la Review. |
| [Diseño SOLID y CRC](diseno-solid.md) | Diagrama, responsabilidades y evidencia para sustentar el diseño en ISW2. |
| [Borrador de PR](borrador-pr.md) | Título y cuerpo preparados para que Andriy los revise y publique. |
| [Evidencia integrada](fase-6-integracion.md) | Entorno, resultados ejecutados, matriz de aceptación y límites de la validación. |
| [Migraciones](../../backend/migrations/README.md) | Requisito de versión, SQL incremental, permisos y orden de aplicación. |

## Comportamiento implementado

El propietario abre «Gestionar puntos» desde su expedición programada y administra una colección de **0 a 20 puntos**, con nombre, latitud, longitud y orden. Puede agregar, editar, eliminar y reordenar; los IDs se conservan al editar o mover un punto.

El backend permite guardar únicamente con estado programado, salida futura y versión vigente. Guarda toda la colección en una transacción y conserva extremos, horarios, contactos y acompañantes. Los conflictos y fallos dejan la edición en pantalla para revisión.

| Entrada | Contrato |
| --- | --- |
| Pantalla | `/senderista/expedicion/:id/puntos`, protegida para senderistas. |
| Consulta | `GET /api/expediciones/:id/puntos`, privada del propietario. |
| Guardado | `PUT /api/expediciones/:id/puntos`, colección completa y `versionEsperada`. |

La visualización completa del recorrido corresponde a HU-33; los avances manuales, a HU-34; la cola persistente offline, a HU-49.

## Validación disponible

La fase 6 terminó con código 0 usando **Node 22.23.4**, PostgreSQL 18.6, PostgREST 16.5, el SDK Supabase real y Edge. Pasaron los typechecks y builds de ambos proyectos, 43 pruebas backend, 12 de interfaz, 35 comprobaciones SQL, 24 de contrato y 9 escenarios integrados con worker activo.

Los grupos tienen casos repetidos entre ejecuciones; no representan una suma de casos únicos ni un porcentaje de cobertura. La prueba fue local y aislada: no certifica la configuración del proyecto remoto de Supabase.

## Estado de DEV y pendientes para integrar PR #63

1. Ariana confirmó HU-26 y HU-32 en DEV, con INTEGER y `hu32_chk_version_segura`. Esta confirmación reemplaza el pendiente de aplicación anterior; el asistente no consultó ni modificó la base remota.
2. No reejecutar `010_hu32_puntos_ruta.sql` en DEV: Ariana añadirá solo el asiento `010` al aprobar CI, con los metadatos reales. El bloque condicional del archivo sirve para instalaciones nuevas, no convierte el DDL en idempotente.
3. Conservar HU-27/HU-35 de develop junto con los controles de puntos. Las migraciones reales de esas historias se incorporan al fixture temporal de navegador; no se instalan en DEV desde las pruebas.
4. El equipo revisa el cambio y Marko registra su aceptación funcional. Ariana coordina la revisión y la evidencia.

Git, ramas, commits, push y PR permanecen bajo el control de Andriy. Andriy comunicó el PR #63; el asistente no lo consultó ni modificó.

## Trazabilidad de las siete fases

| Fase | Documento | Resultado |
| --- | --- | --- |
| 1 | [Preparación y mapa](fase-1-mapa.md) | Base local, dependencias y archivos previstos. |
| 2 | [Contrato](fase-2-contrato.md) | Payload, invariantes, permisos, errores y coordinación. |
| 3 | [Persistencia](fase-3-persistencia.md) | Migración y garantías SQL verificadas. |
| 4 | [API](fase-4-api.md) | Puertos, caso de uso, adaptador y endpoints. |
| 5 | [Interfaz](fase-5-interfaz.md) | Editor, validación y recuperación de errores. |
| 6 | [Integración](fase-6-integracion.md) | Cadena completa, regresión y PWA activa. |
| 7 | [Entrega](fase-7-entrega.md) | Material de revisión y demostración preparado. |

Las fases anteriores conservan la fotografía de su momento. La fase 6 recoge la validación posterior con Node 22 y transporte real, y este índice resume el estado final de la preparación local.

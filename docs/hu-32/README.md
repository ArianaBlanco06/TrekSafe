# HU-32 — Registrar puntos intermedios de la ruta

Responsable: **Andriy Hitoshi Enciso Rojas (@Hitoshi)**. Release 2, sprint 1, **5 SP**.

Estado al 1 de noviembre de 2026: implementación local y validación integrada completadas; paquete preparado para revisión del equipo. La aceptación del PO y la integración en DEV están pendientes. Este documento no cambia el estado del tablero o del backlog.

## Entrega para revisar

| Documento | Uso |
| --- | --- |
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

## Condiciones para integrar en DEV

1. Favio y Sebastian acuerdan la versión única del plan y su migración. El SQL preparado espera `expediciones.version BIGINT NOT NULL` con default, inicial 1 según la propuesta.
2. Sebastian coordina el orden y la aplicación de la migración de versión y de `hu32_puntos_ruta.sql`; registra entorno, fecha, archivo y commit que proporcione Andriy.
3. Se revisa la compatibilidad con edición/cancelación de otras ramas y la política de cron compartido. El fixture de las pruebas no instala la versión en DEV ni incorpora HU-27.
4. El equipo revisa el cambio y Marko registra su aceptación funcional. Ariana coordina la revisión y la evidencia.

Git, ramas, commits, push y PR permanecen bajo el control de Andriy. No se creó ni publicó un PR desde este trabajo.

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

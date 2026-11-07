# HU-32 — Fase 7: preparación de entrega

Fecha: 1 de noviembre de 2026. Responsable: Andriy Hitoshi Enciso Rojas (@Hitoshi).

Estado: paquete de entrega local completado. El material permite revisar y demostrar la implementación; no registra aceptación del PO, aprobación externa, integración en DEV o publicación de un PR.

Actualización posterior, 3 de noviembre de 2026: Andriy comunicó el PR #63 y el acuerdo de usar `expediciones.version INTEGER` como HU-26. La adaptación y su verificación se registran en [ajuste INTEGER](ajuste-integer.md). Los estados y resultados siguientes describen el cierre original de esta fase.

## 1. Material preparado

| Entregable | Archivo |
| --- | --- |
| Índice con estado final y trazabilidad de las siete fases | [README de HU-32](README.md) |
| Guía automatizada y recorrido de Review | [Guía de demostración](guia-demostracion.md) |
| Diagrama de clases/contratos reales, CRC y evidencia SOLID | [Diseño SOLID](diseno-solid.md) |
| Título y cuerpo de PR adaptados a la plantilla del repositorio | [Borrador de PR](borrador-pr.md) |
| Entorno, resultados y matriz de aceptación | [Fase 6](fase-6-integracion.md) |
| SQL incremental, precondición de versión y permisos | [Migraciones](../../backend/migrations/README.md) |

El README principal enlaza el dossier sin cambiar la atribución del trabajo histórico de ISW1 ni presentar HU-32 como una entrega ya desplegada.

## 2. Resumen para el revisor

HU-32 entrega la gestión de 0 a 20 puntos intermedios de una expedición propia programada: agregar, editar, eliminar y reordenar con IDs estables. La API verifica permisos, hora y versión; la transacción conserva todos los datos o revierte la operación completa. El editor conserva la edición ante errores y conflictos y exige una decisión explícita para continuar.

La arquitectura separa transporte, validación, coordinación y persistencia. Los puertos se inyectan en el caso de uso y la suite común verifica sustitución entre memoria y PostgreSQL. La PWA evita servir puntos desde una caché obsoleta.

Se validó la cadena completa con Node 22, API, SDK Supabase, PostgREST y PostgreSQL temporales, más worker activo. Los grupos registrados son 43 pruebas backend, 12 de interfaz, 35 comprobaciones SQL, 24 de contrato y 9 escenarios integrados; los typechecks y builds de ambos proyectos pasaron. La [fase 6](fase-6-integracion.md) es la fuente de estos resultados. No se repitieron esas pruebas por añadir exclusivamente esta documentación.

## 3. Estado de entrega y responsabilidades pendientes

| Elemento | Estado confirmado en este trabajo | Siguiente responsable/acción |
| --- | --- | --- |
| UI, API y SQL de HU-32 | Implementados y validados localmente. | Andriy presenta el cambio al equipo. |
| Evidencia técnica, diseño y guía | Documentados. | Andriy selecciona/adjunta capturas o video para la Review. |
| Issue real de HU-32 | Número/enlace pendiente de confirmar; no se asume #32. | Andriy completa el borrador de PR. |
| Versión única del plan | Propuesta probada mediante fixture; acuerdo externo no confirmado. | Favio y Sebastian acuerdan nombre/tipo, reglas de incremento y migración de origen. |
| Orden/aplicación de migraciones | HU-32 no aplicada por el asistente en Supabase. | Sebastian coordina aplicación; Andriy proporciona el commit cuando lo cree. |
| Compatibilidad con otras ramas | Contrato preparado; cambios externos no inspeccionados. | Revisar edición/cancelación y repetir comprobaciones tras integrar esas dependencias. |
| Revisión técnica | No se registró una revisión de otro integrante. | Ariana coordina revisores; sugerencias en el borrador. |
| Aceptación funcional | No registrada en este trabajo. | Marko revisa criterios, demostración e interpretaciones del contrato. |
| Estado Done del tablero/backlog | No modificado. | El equipo registra su decisión con evidencia real. |
| Git, commits, push y PR | Sin acciones realizadas por el asistente. | Control exclusivo de Andriy. |

Estado que se puede comunicar: **implementación local terminada y preparada para revisión, pendiente de dependencias e integración/aceptación del equipo**. No equiparar el cierre de estas siete fases con una aceptación ya registrada.

## 4. Orden sugerido para la revisión

1. Revisar el [contrato](fase-2-contrato.md) y concretar la versión compartida con Favio/Sebastian. Si difiere del supuesto probado, adaptar SQL/DTO/contrato según corresponda y volver a ejecutar la validación afectada.
2. Revisar la [migración](../../backend/migrations/010_hu32_puntos_ruta.sql), su orden, permisos y guardado transaccional. La aplicación debe ser incremental; no reinicializar la base compartida con `init_schema.sql`.
3. Revisar backend y frontend con el mapa de [fase 4](fase-4-api.md) y [fase 5](fase-5-interfaz.md), y contrastar los cinco principios con [diseño SOLID](diseno-solid.md).
4. Reproducir la validación aislada y la [demostración](guia-demostracion.md); después comprobar el entorno DEV coordinado y las dependencias integradas.
5. Andriy completa el issue, su commit y los enlaces de evidencia en el [borrador de PR](borrador-pr.md). La revisión, publicación y aceptación se registran cuando efectivamente ocurran.

## 5. Comprobación de esta fase

Esta fase añade documentos y enlaces. Se verificaron 63 referencias locales, los seis ejemplos JSON del contrato, los encabezados de la plantilla de PR y la coherencia de los resultados con fase 6. La huella conjunta de 171 archivos de código, pruebas, SQL y configuración permaneció idéntica a la del inicio de esta fase.

No se ejecutan comandos de Git, no se inicia una API, no se aplica SQL en Supabase y no se envían mensajes al equipo. Los campos externos pendientes quedan identificados en el material para que Andriy pueda completarlos sin inventar estados o enlaces.

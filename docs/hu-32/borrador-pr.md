# Borrador de PR — HU-32

Título sugerido: **feat(hu-32): gestionar puntos intermedios de expediciones**

Origen previsto: `feat/hu-32-puntos`. Destino: `develop`. Rama comunicada por Andriy; no verificada con Git durante este trabajo. Andriy comunicó el PR #63. Este borrador incorpora el ajuste a `INTEGER` pedido por el equipo el 3 de noviembre de 2026; no consulta ni modifica el PR. Andriy realiza el commit y el push a su misma rama.

El cuerpo siguiente sigue la estructura de la plantilla del repositorio. Sustituir el issue y adjuntar las evidencias antes de publicarlo. Las rutas están expresadas desde la raíz para localizar los archivos en la rama que se publique.

---

## Descripción

Una expedición programada solo permitía declarar inicio y destino. HU-32 permite al propietario administrar hasta 20 puntos intermedios desde el listado: agregar, editar, eliminar y reordenar con IDs estables, validación por campo y guardado de la colección completa.

La API añade GET/PUT `/api/expediciones/:id/puntos` con JWT y rol senderista. El guardado verifica propietario, estado programado, salida futura y versión dentro de una transacción, conservando extremos y datos del plan. La interfaz conserva la edición ante conflictos o respuestas perdidas y exige revisión explícita antes de reintentar. La consulta de puntos queda fuera del fallback de caché de la PWA.

## Issue relacionado

**Pendiente de confirmar: número/enlace real del issue de HU-32.** Añadir la referencia de cierre cuando se conozca. HU-32 es el identificador del backlog y no se asume que sea el issue #32.

## Dependencias y migraciones

`backend/migrations/hu32_puntos_ruta.sql` requiere la migración previa de HU-26 que aporte `expediciones.version INTEGER NOT NULL` con default (fixture inicial: 1). Nombre y tipo siguen la indicación del equipo. HU-32 comprueba el requisito y no crea ni convierte la columna. El parámetro RPC y sus permisos usan `integer`; API y respuesta RPC limitan las versiones a 1..2147483647. El guardado idéntico funciona en el máximo y un cambio efectivo con rango agotado falla sin escrituras parciales. La validación aislada usa una columna fixture que no constituye la migración de DEV.

Orden previsto: esquema base ya instalado → versión compartida acordada → migración HU-32. Coordinar el orden y registrar la aplicación con Sebastian. No volver a ejecutar `init_schema.sql` sobre DEV con datos: contiene eliminación de tablas.

La migración no se ha aplicado en Supabase. Falta verificar la compatibilidad con las ediciones/cancelaciones de otras ramas y el estado cancelada de HU-27 cuando se integre. Para pruebas manuales en DEV, respetar el acuerdo de una API/cron coordinado mientras no esté integrado el interruptor correspondiente.

## Diseño

El caso de uso depende de `IConsultaPuntosRuta` e `IGuardadoPuntosRuta`, inyectados desde infraestructura. Se separan controlador, validación, servicio y adaptación Supabase. Los mismos 14 escenarios de contrato verifican memoria y PostgreSQL, incluidos los límites INTEGER. Evidencia SOLID, diagrama y CRC en `docs/hu-32/diseno-solid.md`.

## Cómo probar

Instalar las dependencias registradas de backend/frontend. Con Node 22, PostgreSQL nativo, PostgREST y Edge en Windows, ejecutar desde la raíz:

```powershell
node backend/scripts/test-hu32-sql.mjs --pg-bin "C:\Program Files\PostgreSQL\18\bin" --with-browser --postgrest "C:\ruta\PostgREST\postgrest.exe"
```

El comando prepara ambos builds y ejecuta comprobaciones de tipos, pruebas backend/UI, SQL, contrato y la integración con worker activo. Usa puertos y datos temporales; no necesita Supabase ni inicia el cron. Cierra los procesos temporales al finalizar.

Resultados del ajuste INTEGER, 3 de noviembre de 2026, en Windows con Node 22.23.4, PostgreSQL 18.6 y PostgREST 16.5:

| Grupo | Resultado |
| --- | --- |
| Typechecks y builds de backend/frontend | Aprobados. |
| Pruebas backend | 50 aprobadas, incluidas las seis históricas. |
| Interfaz con API controlada | 12 aprobadas. |
| Comprobaciones SQL | 39 aprobadas. |
| Contrato común | 28 aprobadas: 14 en memoria y 14 en PostgreSQL. |
| Integración con API real y PWA activa | 9 aprobadas. |

Los grupos tienen casos repetidos; no se suman como casos únicos o porcentaje de cobertura. Se verificaron permisos, límites, identidad, conflictos, rollback, respuesta perdida, reingreso offline, cambio de usuario y regresión de creación/retorno/historial/ficha médica. La configuración real de Supabase y la aceptación del PO siguen pendientes.

## Evidencia para revisión

- Índice y estado: `docs/hu-32/README.md`.
- Ajuste INTEGER y comprobaciones posteriores: `docs/hu-32/ajuste-integer.md`.
- Matriz de aceptación, entorno y resultados: `docs/hu-32/fase-6-integracion.md`.
- Guía de demostración: `docs/hu-32/guia-demostracion.md`.
- Contrato HTTP: `docs/hu-32/fase-2-contrato.md`.
- Migraciones y permisos: `backend/migrations/README.md`.
- Capturas/trazas locales: `frontend/test-results/`, excluido de Git; seleccionar y adjuntar evidencia con datos ficticios al PR.

## Checklist (Definition of Done)

- [x] El código compila y se ejecuta sin errores en el entorno local de validación.
- [ ] Se cumplen y aceptan los criterios de la historia: evidencia local aprobada, aceptación del PO pendiente.
- [x] Se agregaron/actualizaron pruebas.
- [ ] Al menos un integrante revisó el PR.
- [ ] Número/enlace del issue de HU-32 confirmado.
- [x] Nombre y tipo de versión adaptados al acuerdo del equipo: `expediciones.version INTEGER`, como HU-26.
- [ ] Orden de aplicación y semántica completa de incremento verificados con Favio/Sebastian en DEV.
- [ ] Migración aplicada y verificada en DEV, con registro de archivo/fecha/commit/responsable.
- [ ] Evidencia funcional adjunta y decisión de Review registrada.

Revisores sugeridos, a coordinar con Ariana: Favio para contratos/estados, Sebastian para SQL/permisos y Jhon para integración/regresión. La publicación, asignación de revisores y cambios del tablero quedan a cargo del equipo.

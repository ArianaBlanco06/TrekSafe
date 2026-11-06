# Borrador de PR — HU-32

Título sugerido: **feat(hu-32): gestionar puntos intermedios de expediciones**

Origen: `feat/hu-32-puntos`. Destino: `develop`. Actualizado el 5 de noviembre de 2026 tras resolver el contenido de siete conflictos del merge con `develop` (`MERGE_HEAD 98e8753`). Andriy debe marcar la resolución, finalizar el merge y hacer push. No se consultó ni creó ningún PR: si ya hay uno abierto de esta rama, actualizarlo sin duplicarlo.

El cuerpo siguiente sigue la estructura de la plantilla del repositorio. Sustituir el issue y adjuntar las evidencias antes de publicarlo. Las rutas están expresadas desde la raíz para localizar los archivos en la rama que se publique.

---

## Descripción

Una expedición programada solo permitía declarar inicio y destino. HU-32 permite al propietario administrar hasta 20 puntos intermedios desde el listado: agregar, editar, eliminar y reordenar con IDs estables, validación por campo y guardado de la colección completa.

La API añade GET/PUT `/api/expediciones/:id/puntos` con JWT y rol senderista. El guardado verifica propietario, estado programado, salida futura y versión dentro de una transacción, conservando extremos y datos del plan. La interfaz conserva la edición ante conflictos o respuestas perdidas y exige revisión explícita antes de reintentar.

La resolución con develop conserva las rutas de HU-26/HU-28/HU-29/HU-30/HU-31, así como los accesos «Editar», «Gestionar puntos» y «Revisar equipo». Mantiene el Service Worker con `prompt`, recursos estáticos offline y respuestas privadas `NetworkOnly`/`no-store`. Los scripts de HU-32 se incorporan a CI sin sustituir equipo ni privacidad. El módulo auxiliar PWA se compila aislado de `.env`, con `/api` local.

## Issue relacionado

**Pendiente de confirmar: número/enlace real del issue de HU-32.** Añadir la referencia de cierre cuando se conozca. HU-32 es el identificador del backlog y no se asume que sea el issue #32.

## Dependencias y migraciones

`backend/migrations/hu32_puntos_ruta.sql` requiere `002_hu26_version_y_eventos_plan.sql`, que aporta `expediciones.version INTEGER NOT NULL` con default 1. HU-32 comprueba el requisito y no crea ni convierte la columna. El parámetro RPC y sus permisos usan `integer`; API y respuesta RPC limitan las versiones a 1..2147483647. El guardado idéntico funciona en el máximo y un cambio efectivo con rango agotado falla sin escrituras parciales. La validación aislada usa una columna fixture que no constituye la aplicación de la migración de DEV.

Orden: esquema base ya instalado → `002` de HU-26 → migración HU-32. Coordinar el orden y registrar la aplicación con Sebastian. La migración HU-32 conserva sus RPC `SECURITY DEFINER` con permisos restringidos y `search_path` fijo; el cliente no accede directamente a su tabla. No volver a ejecutar `init_schema.sql` sobre DEV con datos: contiene eliminación de tablas.

La migración no se ha aplicado en Supabase durante esta intervención. La comprobación en DEV y la compatibilidad con HU-27/cancelación cuando se incorpore siguen pendientes del equipo. Las pruebas locales no iniciaron el cron real ni modificaron `.env`.

## Diseño

El caso de uso depende de `IConsultaPuntosRuta` e `IGuardadoPuntosRuta`, inyectados desde infraestructura. Se separan controlador, validación, servicio y adaptación Supabase. Los mismos 14 escenarios de contrato verifican memoria y PostgreSQL, incluidos los límites INTEGER. Evidencia SOLID, diagrama y CRC en `docs/hu-32/diseno-solid.md`.

## Cómo probar

Instalar las dependencias registradas de backend/frontend. Con Node 22, PostgreSQL nativo, PostgREST y Edge en Windows, ejecutar desde la raíz:

```powershell
node backend/scripts/test-hu32-sql.mjs --pg-bin "C:\Program Files\PostgreSQL\18\bin" --with-browser --postgrest "C:\ruta\PostgREST\postgrest.exe"
```

El comando prepara ambos builds y ejecuta comprobaciones de tipos, pruebas backend/UI, SQL, contrato y la integración con worker activo. Usa puertos y datos temporales; no necesita Supabase ni inicia el cron. Cierra los procesos temporales al finalizar.

Resultados después de combinar develop, 5 de noviembre de 2026, en Windows con Node 22.23.4, PostgreSQL 18.6, PostgREST 16.5 y Edge:

| Grupo | Resultado |
| --- | --- |
| Typechecks y builds de backend/frontend | Aprobados. |
| Tipos de pruebas compartidas y UI HU-32 | Aprobados. |
| Pruebas backend | 305 aprobadas; incluye las suites existentes y HU-32. |
| Pruebas frontend de equipo y otras historias (`test:equipo`) | 64 aprobadas; 2 integraciones PostgreSQL HU-30/HU-31 omitidas sin sus conexiones de prueba. |
| Interfaz con API controlada | 12 aprobadas. |
| Comprobaciones SQL | 39 aprobadas. |
| Contrato común | 28 aprobadas: 14 en memoria y 14 en PostgreSQL. |
| Integración con API real y PWA activa | 9 aprobadas. |
| PWA privacidad y compatibilidad | 14 aprobadas: 12 con worker real y 2 de interfaz HU-31 con worker bloqueado. |
| Manifiesto y lock frontend | Coinciden; `npm ci --dry-run --ignore-scripts --offline --no-audit --no-fund` aprueba. |

Los grupos tienen casos repetidos; no se suman como casos únicos o porcentaje de cobertura. Se verificaron permisos, límites, identidad, conflictos, rollback, respuesta perdida, reingreso offline, cambio de usuario y regresión de creación/retorno/historial/ficha médica. La invocación general de backend omite las suites SQL opcionales sin conexión; HU-32 SQL/contrato/cadena real se ejecutaron por separado dentro del runner. Las integraciones SQL propias de HU-29/HU-30/HU-31 no se ejecutaron. El entorno HU-32 se apagó al finalizar; no se contactó Supabase.

GitHub Actions queda pendiente de ejecutarse y comprobarse después del push. La configuración real de Supabase y la aceptación del PO siguen pendientes.

## Evidencia para revisión

- Índice y estado: `docs/hu-32/README.md`.
- Conflictos, validación actual y límites: `docs/hu-32/integracion-develop.md`.
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
- [x] Se conserva la funcionalidad existente revisada y se ejecutan las suites de HU-32 y privacidad por separado.
- [ ] GitHub Actions de backend y frontend aprobadas en el PR después del push.
- [ ] Al menos un integrante revisó el PR.
- [ ] Número/enlace del issue de HU-32 confirmado.
- [x] Nombre y tipo de versión adaptados al acuerdo del equipo: `expediciones.version INTEGER`, como HU-26.
- [ ] Orden de aplicación y semántica completa de incremento verificados con Favio/Sebastian en DEV.
- [ ] Migración aplicada y verificada en DEV, con registro de archivo/fecha/commit/responsable.
- [ ] Evidencia funcional adjunta y decisión de Review registrada.

Revisores sugeridos, a coordinar con Ariana: Favio para contratos/estados, Sebastian para SQL/permisos y Jhon para integración/regresión. La publicación, asignación de revisores y cambios del tablero quedan a cargo del equipo.

# HU-32 — Compatibilidad INTEGER con HU-26

Fecha: 3 de noviembre de 2026. Responsable: Andriy Hitoshi Enciso Rojas (@Hitoshi).

El equipo indicó utilizar `expediciones.version INTEGER`, siguiendo HU-26 de Favio, para actualizar el PR #63 comunicado por Andriy. El asistente prepara cambios locales; Andriy conserva el commit y push a la misma rama. No se consultó ni modificó el PR desde este trabajo.

## Contrato aplicado

- La [migración](../../backend/migrations/010_hu32_puntos_ruta.sql) requiere `version INTEGER NOT NULL` con default. La columna debe existir por HU-26; HU-32 no la crea ni cambia su tipo.
- La RPC de guardado y sus permisos usan `treksafe_guardar_puntos_ruta(uuid, uuid, integer, jsonb)`.
- Versiones válidas: 1..2147483647. La API rechaza valores mayores, no positivos o fraccionarios con `400`; el adaptador también valida el rango de la respuesta RPC. TypeScript mantiene el tipo `number`.
- Un cambio efectivo desde 2147483646 alcanza 2147483647. En el máximo, un guardado idéntico conserva datos y versión; un cambio efectivo falla sin modificar puntos ni metadatos. No hay reinicio ni vuelta a cero.
- Una llamada SQL directa con un argumento fuera del rango INTEGER falla al convertirlo, antes del cuerpo de la función. `NULL`, cero y negativos que sí entran en el tipo reciben `datos_invalidos`.
- Se conservan el bloqueo de expedición, los conflictos por versión obsoleta, la atomicidad y la separación SOLID.

## Verificación

La suite SQL comprueba el rechazo de una columna con tipo incorrecto, el tipo de columna y la firma exacta en el catálogo, los permisos de la nueva firma, el último incremento, el no-op en el máximo y la ausencia de escrituras con rango agotado. Las únicas referencias SQL restantes a BIGINT son pruebas negativas que comprueban su rechazo o ausencia.

El contrato común añade dos escenarios de límite para memoria y PostgreSQL. Las pruebas HTTP verifican el rechazo antes de persistir y el comportamiento en el máximo. La integración con PostgREST real comprueba el guardado usando la firma INTEGER y el rechazo HTTP de 2147483648.

Comando reproducible desde la raíz con Node 22, PostgreSQL, PostgREST y Edge:

```powershell
node backend/scripts/test-hu32-sql.mjs --pg-bin "C:\Program Files\PostgreSQL\18\bin" --with-browser --postgrest "C:\ruta\PostgREST\postgrest.exe"
```

Resultado del 3 de noviembre de 2026: **código de salida 0**, usando Node 22.23.4, PostgreSQL 18.6, PostgREST 16.5 y Edge.

| Grupo | Resultado |
| --- | --- |
| Typechecks y builds de backend/frontend; tipos de Playwright | Aprobados |
| Pruebas backend | 50 aprobadas |
| Interfaz con API controlada | 12 aprobadas |
| Comprobaciones SQL | 39 aprobadas |
| Contrato común | 28 aprobadas: 14 por implementación |
| Integración con API real y PWA activa | 9 aprobadas |

Los grupos comparten escenarios; no representan una suma de casos únicos. Se verificaron también los enlaces locales de la documentación. Los resultados del 1 de noviembre en las fases 3–7 se conservan como registro histórico.

El runner confirmó el cierre de API, PostgREST y PostgreSQL temporales. Se conservaron los archivos de la instancia `treksafe-hu32-sql-Udrqm6` para revisión.

Las pruebas usan un clúster temporal y datos ficticios; no aplican migraciones en Supabase ni arrancan el cron. La aplicación en DEV y la integración de las demás operaciones de HU-26 se coordinan con Favio y Sebastian. La implementación remota de HU-26 no se inspeccionó en este ajuste.

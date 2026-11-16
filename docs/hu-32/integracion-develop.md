# HU-32 — Resolución del merge de develop para revisión

Fecha: 5 de noviembre de 2026. Responsable: Andriy Hitoshi Enciso Rojas (@Hitoshi).

Nota posterior: este informe conserva la primera integración con develop. Ariana confirmó después la estructura HU-26/HU-32 en DEV y solicitó numerar el archivo como `010`, añadir su registro condicional y conservar cancelación HU-27/HU-35. Véase [revisión PR #63](revision-pr63.md), que reemplaza el pendiente de aplicar el DDL en DEV por el registro administrativo `010` a cargo de Ariana. No volver a ejecutar el SQL completo.

Andriy inició el merge de `origin/develop` sobre `feat/hu-32-puntos`. La revisión local encontró HEAD `bad06a1` y MERGE_HEAD `98e8753`. Estos identifican las versiones incorporadas por el merge en curso; no se ejecutó fetch ni se certificó que el remoto no haya avanzado después.

El contenido de los conflictos quedó combinado y validado. El índice de Git seguirá indicando siete archivos sin resolver hasta que Andriy ejecute `git add` y finalice el merge. Commit, push y publicación/revisión del PR permanecen a su cargo. El asistente no modificó ramas, referencias o índice de Git.

## Resolución por archivo

| Archivo en conflicto | Resolución y motivo |
| --- | --- |
| `backend/migrations/README.md` | Combinar la guía compartida, HU-29/HU-30/HU-31 y toda la sección HU-32. Explicitar dependencia de `002` y la excepción existente de RPC `SECURITY DEFINER` de HU-32. No se modificó SQL. |
| `backend/src/presentation/http/app.ts` | Conservar no-store y rutas HU-26/HU-28/HU-29/HU-30/HU-31, e incorporar rutas de puntos antes de las generales de expediciones. |
| `frontend/package.json` | Conservar scripts TSX de equipo, PWA y HU-28, además de UI/tipos HU-32. Mantener Playwright fijado a `1.64.1` como develop. |
| `frontend/package-lock.json` | Usar la misma versión fija del manifiesto y conservar el grafo combinado. |
| `frontend/src/app/App.tsx` | Conservar la ruta de puntos HU-32, equipo HU-31, edición HU-26 y demás pantallas y protecciones. |
| `frontend/src/pages/PaginaListaExpediciones.tsx` | Mostrar «Editar» y «Gestionar puntos» en programadas; conservar el acceso «Revisar equipo» y navegación de activas. |
| `frontend/vite.config.ts` | Conservar `prompt`, precache estático, worker de limpieza y todas las exclusiones `NetworkOnly`, incluida la de puntos. Eliminar la antigua regla API `NetworkFirst` que reintroduciría el problema de privacidad ya corregido en develop. |

Ajustes adicionales necesarios para verificar y mantener la integración:

- `frontend/tsconfig.playwright.json`: delimitar NodeNext a configuraciones y suites HU-32. Las otras suites continúan bajo `typecheck:tests`, con resolución bundler. No se eliminó ni deshabilitó ninguna prueba.
- `frontend/tests/hu32/puntosRuta.spec.ts`: comprobar, en el escenario existente de acceso desde el listado, que «Editar» y «Revisar equipo» siguen disponibles junto con «Gestionar puntos».
- `frontend/tests/pwa/servidor.mjs`: fijar `/api` en el módulo auxiliar y usar `envFile: false` para que la compilación de pruebas no tome el destino API de un `.env`. No cambia el cliente de producción ni archivos de entorno.
- `.github/workflows/ci.yml`: añadir `typecheck:ui` y `test:ui` de HU-32, sin sustituir las comprobaciones existentes. La interfaz se prueba después del build y de instalar Chromium, antes de privacidad.

## Validación ejecutada sobre esta combinación

Windows, Node 22.23.4, PostgreSQL 18.6, PostgREST 16.5 y Edge. `VITE_API_URL=/api` y `CRON_ENABLED=false` se fijaron únicamente para los procesos de pruebas. Los servicios temporales escucharon en loopback; no se ejecutó `main.ts` ni el cron real.

| Comprobación | Resultado |
| --- | --- |
| Typecheck backend y frontend | Aprobados. |
| Tipos de pruebas compartidas y UI HU-32 | Aprobados. |
| Builds backend y frontend/PWA | Aprobados; Service Worker generado. |
| Suite backend | 305 pruebas aprobadas, 0 fallos. Suites SQL optativas omitidas en esta invocación sin sus conexiones de prueba; HU-32 SQL se ejecutó después con su entorno temporal. |
| `test:equipo` | 64 aprobadas, 2 integraciones PostgreSQL HU-30/HU-31 omitidas, 0 fallos. |
| UI HU-32 | 12 aprobadas, incluida convivencia de accesos HU-26/HU-31/HU-32. API controlada y worker bloqueado en esa suite. |
| SQL HU-32 | 39 comprobaciones aprobadas: permisos, límites, INTEGER, identidad, no-op, rollback y concurrencia. |
| Contrato HU-32 memoria/PostgreSQL | 28 aprobadas: 14 por implementación. |
| Cadena real HU-32 con PWA | 9 aprobadas con API Express, SDK Supabase, PostgREST y PostgreSQL temporal. |
| `test:pwa:privacidad` | 14 aprobadas: 12 escenarios con worker real y 2 escenarios de interfaz HU-31 que bloquean el worker deliberadamente. |
| Manifiesto/lock | Dependencias raíz coinciden y `npm ci --dry-run --ignore-scripts --offline --no-audit --no-fund` aprueba. No se presenta como reinstalación completa. |
| Revisión de archivos | Sin marcadores de conflicto ni errores de whitespace. |

Los grupos comparten casos: no se suman como pruebas únicas ni como porcentaje de cobertura. El fallo SQL registrado durante la prueba de rollback es intencional; el runner finalizó con código 0.

El runner de HU-32 ejecuta el esquema inicial y su migración exclusivamente en un clúster nuevo y descartable; el requisito de versión se prepara como fixture. Esto no certifica la aplicación conjunta de todas las migraciones del equipo en Supabase. Las integraciones SQL propias de HU-29/HU-30/HU-31 no se ejecutaron en esta intervención. Sus pruebas unitarias/HTTP y los recorridos de navegador disponibles sí pasaron dentro de las suites indicadas.

Reproducción del runner completo desde la raíz, con dependencias instaladas:

```powershell
node backend/scripts/test-hu32-sql.mjs --pg-bin "C:\Program Files\PostgreSQL\18\bin" --with-browser --postgrest "C:\ruta\PostgREST\postgrest.exe"
```

Además, ejecutar `typecheck:tests`, `test:equipo` y `test:pwa:privacidad` desde frontend. El workflow incorpora las comprobaciones automáticas que no requieren PostgreSQL nativo. El runner integrado imprime sus carpetas y apaga PostgreSQL/API/PostgREST al terminar; la ejecución observada confirmó ese cierre.

## Pendientes para publicar e integrar

1. Andriy marca los archivos resueltos, registra el merge y sube `feat/hu-32-puntos`.
2. Usar `develop` como destino del PR. Si ya hay uno abierto con esa misma rama, actualizarlo en lugar de duplicarlo. No se consultó ni se creó ningún PR desde esta intervención.
3. Verificar GitHub Actions después del push; la aprobación local no representa una ejecución remota de CI.
4. Enlazar el issue real de HU-32 y adjuntar evidencias con datos ficticios. El ID del backlog no permite asumir que el issue sea #32.
5. Sebastian coordina aplicación y registro de `010_hu32_puntos_ruta.sql` en DEV después de `002`. No se aplicó SQL ni se modificó configuración en Supabase durante esta tarea.
6. Revisión técnica, comprobación en DEV y aceptación funcional quedan a cargo del equipo. El asistente no hace merge del PR hacia develop.

Plantilla actualizada: [borrador del PR](borrador-pr.md). Los documentos de las fases anteriores conservan sus resultados históricos; esta nota recoge la validación posterior al merge del 5 de noviembre.

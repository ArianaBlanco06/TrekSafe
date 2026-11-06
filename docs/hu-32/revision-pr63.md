# HU-32 — Ajustes de revisión de Ariana para PR #63

Fecha: 5 de noviembre de 2026. Responsable: Andriy Hitoshi Enciso Rojas (@Hitoshi).

Estado: cambios de revisión implementados y validación local aprobada. El merge de develop iniciado por Andriy (`MERGE_HEAD e61a1d7`) sigue pendiente de que marque la resolución y lo registre en Git. El asistente no ejecutó fetch, cambios de rama, add, commit, push ni acciones en GitHub.

## Cambios realizados

1. `frontend/src/pages/PaginaListaExpediciones.tsx`: resolver el conflicto conservando «Editar», «Gestionar puntos» y «Cancelar» en el mismo `div` con `mt-3 flex flex-wrap items-center gap-x-4 gap-y-1`. Mantener `ChevronRight`, `Ban`, `setAviso('')`, `setACancelar(exp)`, el diálogo de Favio y el enlace de equipo. Los cambios de HU-27/HU-35 incorporados por el merge se conservan.
2. Renombrar físicamente `backend/migrations/hu32_puntos_ruta.sql` a `backend/migrations/010_hu32_puntos_ruta.sql`. Agregar exactamente el registro condicional solicitado antes del `COMMIT`, como HU-31: `(010, hu32_puntos_ruta, HU-32)` con `ON CONFLICT (version) DO NOTHING`.
3. `backend/migrations/README.md`: situar `010` después de `009`, indicar dependencia `002`, actualizar el estado comunicado de DEV y justificar la excepción `SECURITY DEFINER`. No cambiar las RPC a INVOKER ni ampliar permisos.
4. `backend/scripts/test-hu32-sql.mjs`: usar el nombre nuevo y comprobar la instalación sin tabla de registro, con tabla vacía y con asiento existente. Las variantes usan bases nuevas dentro del clúster temporal; verifican nombre/HU y conservación de fechas, autor y otras versiones.
5. Antes del navegador integrado, instalar las migraciones reales `002` a `007` exclusivamente en el clúster temporal. La expedición activa de HU-35 consulta `eventos_plan`; el fixture anterior con solo una columna de versión ya no bastaba para representar develop. No se elimina ni simula esa relación.
6. `frontend/tests/hu32/puntosRuta.spec.ts`: ampliar el recorrido del listado para abrir/cerrar el diálogo de cancelación y añadir una prueba de cancelación con API controlada. Verificar un solo POST autenticado, estado cancelado, retirada de los controles programados, conservación del enlace de equipo y ausencia de guardados de puntos.
7. Actualizar referencias y enlaces al archivo `010` en los documentos HU-32, el índice y el borrador del PR. Aclarar en `REGISTRO_APLICACION.md` que el asiento administrativo aún no fue ejecutado, sin inventar una fila de aplicación.

Se comparó el SQL renombrado con la versión anterior de la rama, retirando únicamente el bloque nuevo de registro: el resto coincide exactamente. Tablas, validadores, transacciones, INTEGER, restricciones, RLS, funciones y permisos permanecen intactos. Renombrar el archivo y agregar el bloque no vuelve re-ejecutable su DDL.

## Estado de Supabase DEV

La confirmación proviene del mensaje de Ariana aportado por Andriy: HU-26 y la estructura final HU-32 ya están aplicadas y coinciden con INTEGER y `hu32_chk_version_segura`; también verificó los permisos cerrados de las RPC.

**No volver a ejecutar `010_hu32_puntos_ruta.sql` completo en DEV.** Ariana añadirá únicamente el asiento `010` cuando CI esté verde y después hará el merge del PR #63. El registro y sus metadatos siguen pendientes; la documentación distingue estructura aplicada de asiento administrativo registrado. El asistente no accedió ni ejecutó SQL en Supabase.

`SECURITY DEFINER` es deliberado: el backend conserva únicamente ejecución de las dos RPC, sin acceso directo a `puntos_ruta`; las funciones comprueban propiedad y realizan las operaciones con privilegios del propietario confiable y `search_path` fijo. No se modificó este diseño verificado por Ariana.

## Validación local posterior

Windows, Node 22.23.4, PostgreSQL 18.6, PostgREST 16.5 y Edge. El runner completo terminó con código 0 y confirmó el cierre de la API, PostgREST y el clúster temporal.

| Comprobación | Resultado |
| --- | --- |
| Tipos backend/frontend y builds | Aprobados. |
| Tipos de pruebas compartidas y UI HU-32 | Aprobados. |
| Backend | 396 aprobadas, 0 fallos. Incluye pruebas de las historias nuevas de develop. |
| `test:equipo` | 64 aprobadas, 2 integraciones PostgreSQL opcionales omitidas, 0 fallos. |
| Interfaz HU-32 con API controlada | 13 aprobadas, incluidas convivencia de controles y cancelación. |
| SQL HU-32 | 42 comprobaciones aprobadas; incluye las 3 nuevas de registro condicional. |
| Contrato memoria/PostgreSQL | 28 aprobadas, 14 por adaptador. |
| Cadena real HU-32 con PWA | 9 aprobadas; usa Express, SDK Supabase, PostgREST y PostgreSQL temporales, con las migraciones de plan `002` a `007` presentes. |
| PWA privacidad/compatibilidad | 14 aprobadas: 12 con worker real y 2 de interfaz HU-31 con worker bloqueado por su configuración existente. |

Las suites comparten escenarios y no se suman como casos únicos. La invocación general de backend omite sus suites SQL optativas sin conexión; las 42 comprobaciones SQL, las 28 de contrato y las 9 integradas de HU-32 se ejecutaron después con sus conexiones temporales. No se ejecutaron las integraciones PostgreSQL propias de HU-29/HU-30/HU-31. La prueba de rollback provoca deliberadamente un error SQL que aparece en logs; su escenario y el runner pasan.

Reproducción desde la raíz, con dependencias y herramientas disponibles:

```powershell
node backend/scripts/test-hu32-sql.mjs --pg-bin "C:\Program Files\PostgreSQL\18\bin" --with-browser --postgrest "C:\ruta\PostgREST\postgrest.exe"
npm.cmd run typecheck:tests --prefix frontend
npm.cmd run test:equipo --prefix frontend
npm.cmd run test:pwa:privacidad --prefix frontend
```

Los procesos de prueba usan configuración local y datos ficticios. No se modificaron `.env`, configuración de Supabase ni la instancia PostgreSQL instalada. Solo se ejecutó SQL en los clústeres/bases de prueba desechables.

## Entrega pendiente

- Andriy debe marcar el conflicto resuelto y registrar también la eliminación del nombre antiguo y la incorporación del nuevo archivo `010` mediante Git; después finaliza el merge y sube la misma rama para actualizar PR #63.
- Las comprobaciones locales no certifican GitHub Actions: verificar CI después de ese push. El workflow conserva tipos/UI HU-32, equipo y privacidad separados.
- Ariana registra únicamente `010` en DEV y completa sus metadatos reales; después coordina revisión y merge. No se registra una ejecución administrativa ficticia desde esta tarea.
- No se implementa HU-34 en esta rama. El trabajo de sus fases permanece separado.

Documentos de entrada: [índice HU-32](README.md), [borrador del PR](borrador-pr.md) y [guía de migraciones](../../backend/migrations/README.md).

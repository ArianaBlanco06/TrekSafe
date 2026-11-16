# HU-32 — Ajustes de revisión de Ariana para PR #63

Fecha: 5 de noviembre de 2026. Responsable: Andriy Hitoshi Enciso Rojas (@Hitoshi).

## Estado actual — 6 de noviembre de 2026

La implementación de HU-32 está completada.

- CI de GitHub Actions: satisfactorio.
- Revisión técnica: aprobada.
- Validación funcional: aprobada por el Product Owner.
- Migración 010: aplicada y registrada en Supabase DEV.
- Estructura, RPC, RLS y permisos: verificados.
- Rama `feat/hu-32-puntos`: actualizada con develop.
- Conflictos de merge: ninguno.

El único paso pendiente es integrar el PR #63 mediante merge hacia `develop`.

## Cambios realizados

1. `frontend/src/pages/PaginaListaExpediciones.tsx`: resolver el conflicto conservando «Editar», «Gestionar puntos» y «Cancelar» en el mismo `div` con `mt-3 flex flex-wrap items-center gap-x-4 gap-y-1`. Mantener `ChevronRight`, `Ban`, `setAviso('')`, `setACancelar(exp)`, el diálogo de Favio y el enlace de equipo. Los cambios de HU-27/HU-35 incorporados por el merge se conservan.
2. Renombrar físicamente `backend/migrations/hu32_puntos_ruta.sql` a `backend/migrations/010_hu32_puntos_ruta.sql`. Agregar exactamente el registro condicional solicitado antes del `COMMIT`, como HU-31: `(010, hu32_puntos_ruta, HU-32)` con `ON CONFLICT (version) DO NOTHING`.
3. `backend/migrations/README.md`: situar `010` después de `009`, indicar dependencia `002`, actualizar el estado comunicado de DEV y justificar la excepción `SECURITY DEFINER`. No cambiar las RPC a INVOKER ni ampliar permisos.
4. `backend/scripts/test-hu32-sql.mjs`: usar el nombre nuevo y comprobar la instalación sin tabla de registro, con tabla vacía y con asiento existente. Las variantes usan bases nuevas dentro del clúster temporal; verifican nombre/HU y conservación de fechas, autor y otras versiones.
5. Antes del navegador integrado, instalar las migraciones reales `002` a `007` exclusivamente en el clúster temporal. La expedición activa de HU-35 consulta `eventos_plan`; el fixture anterior con solo una columna de versión ya no bastaba para representar develop. No se elimina ni simula esa relación.
6. `frontend/tests/hu32/puntosRuta.spec.ts`: ampliar el recorrido del listado para abrir/cerrar el diálogo de cancelación y añadir una prueba de cancelación con API controlada. Verificar un solo POST autenticado, estado cancelado, retirada de los controles programados, conservación del enlace de equipo y ausencia de guardados de puntos.
7. Actualizar referencias y enlaces al archivo `010` en los documentos HU-32, el índice y el borrador del PR. Registrar en `REGISTRO_APLICACION.md` la fila de `010`, asentada en DEV el 2026-11-06 a las 05:23 UTC.

Se comparó el SQL renombrado con la versión anterior de la rama, retirando únicamente el bloque nuevo de registro: el resto coincide exactamente. Tablas, validadores, transacciones, INTEGER, restricciones, RLS, funciones y permisos permanecen intactos. Renombrar el archivo y agregar el bloque no vuelve re-ejecutable su DDL.

## Estado de Supabase DEV

HU-26 y la estructura final de HU-32 están aplicadas y verificadas en Supabase DEV. Se confirmó la compatibilidad con `expediciones.version INTEGER`, la restricción `hu32_chk_version_segura` y los permisos cerrados de las RPC.

La migración `010_hu32_puntos_ruta.sql` ya fue aplicada y su asiento administrativo quedó registrado correctamente en `public.treksafe_migraciones` el 2026-11-06 a las 05:23 UTC.

- Entorno: DEV.
- Commit: `594b23f`.
- Ejecutor: Ariana.
- Resultado: OK.

**No volver a ejecutar `010_hu32_puntos_ruta.sql` completo en DEV.** La estructura y el registro administrativo ya están completados.

SECURITY DEFINER es deliberado: el backend conserva únicamente ejecución de las dos RPC, sin acceso directo a puntos_ruta; las funciones comprueban propiedad y realizan las operaciones con privilegios del propietario confiable y search_path fijo. No se modificó este diseño verificado por Ariana.


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

- Integrar el PR #63 mediante merge hacia `develop`.

Nota de alcance: HU-34 no se implementa en esta rama.
Sus fases permanecen separadas.

Documentos de entrada: [índice HU-32](README.md), [borrador del PR](borrador-pr.md) y [guía de migraciones](../../backend/migrations/README.md).

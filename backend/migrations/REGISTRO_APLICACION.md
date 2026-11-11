# Registro de aplicación de migraciones

Solo se anotan aplicaciones reales sobre un entorno (DEV, producción u otro). Las ejecuciones de prueba sobre el clúster desechable local se documentan en `BITACORA_SEBASTIAN_RELEASE2.md`.

| Archivo | Versión | Fecha | Entorno | Commit | Ejecutor | Resultado |
|---------|---------|-------|---------|--------|----------|-----------|
| `000_registro_migraciones.sql` | 000 | 2026-11-06 01:27 UTC | DEV | 55f5551 | Ariana | OK |
| `001_hu29_plantillas_ruta.sql` | 001 | 2026-11-06 01:27 UTC | DEV | 55f5551 | Ariana | OK |
| `008_hu31_preparacion_expedicion.sql` | 008 | 2026-11-06 02:05 UTC | DEV | 9250402 | Ariana | OK |
| `009_hu31_operaciones_preparacion.sql` | 009 | 2026-11-06 02:05 UTC | DEV | 9250402 | Ariana | OK |
| `011_hu29_endurecer_permisos.sql` | 011 | 2026-11-06 01:56 UTC | DEV | bcfeeac | Ariana | OK |
| `004_hu27_estado_cancelada.sql` | 004 | 2026-11-06 03:41 UTC | DEV | 2fee4ea | Ariana | OK |
| `005_hu27_rpc_cancelar_expedicion.sql` | 005 | 2026-11-06 03:41 UTC | DEV | 2fee4ea | Ariana | OK |
| `006_hu27_permiso_anonimizar_eventos.sql` | 006 | 2026-11-06 03:41 UTC | DEV | 2fee4ea | Ariana | OK |
| `007_hu35_rpc_ampliar_retorno.sql` | 007 | 2026-11-06 03:56 UTC | DEV | 780413c | Ariana | OK |
| `010_hu32_puntos_ruta.sql` | 010 | 2026-11-06 05:23 UTC | DEV | 594b23f | Ariana | OK |
| `012_hu36_eventos_plan_solo_anexado.sql` | 012 | 2026-11-08 05:21 UTC | DEV | 0c5d540 | Ariana | OK |
| `013_hu37_avisos.sql` | 013 | 2026-11-08 05:21 UTC | DEV | 3ed82f2 | Ariana | OK |
| `014_hu38_minutos_recordatorio.sql` | 014 | 2026-11-08 05:33 UTC | DEV | 33debe3 | Ariana | OK |
| `016_hu34_avances_expedicion.sql` | 016 | 2026-11-09 03:05 UTC | DEV | 03468a0 | Ariana | OK |
| `002_hu26_version_y_eventos_plan.sql` | 002 | entre 2026-11-02 03:19 y 2026-11-06 01:27 UTC (hora exacta no registrada) · asiento conciliado 2026-11-10 14:12 UTC | DEV | 4860b99 | Ariana | OK (TECH-56) |
| `003_hu26_rpc_editar_expedicion.sql` | 003 | entre 2026-11-02 19:52 y 2026-11-06 01:27 UTC (hora exacta no registrada) · asiento conciliado 2026-11-10 14:12 UTC | DEV | 525163f | Ariana | OK (TECH-56) |
| `20261101_hu30_listas_equipo.sql` | hu30_listas | entre 2026-11-02 03:19 y 2026-11-04 00:07 UTC (hora exacta no registrada) · asiento conciliado 2026-11-10 14:12 UTC | DEV | 6dbd632 | Ariana | OK (TECH-56) |
| `20261101_hu30_operaciones_equipo.sql` | hu30_operaciones | entre 2026-11-02 03:19 y 2026-11-04 00:07 UTC (hora exacta no registrada) · asiento conciliado 2026-11-10 14:12 UTC | DEV | 6dbd632 | Ariana | OK (TECH-56) |
| `018_hu27_cancelar_salida_futura.sql` | 018 | 2026-11-10 20:43 UTC | DEV | 9b43f46 | Marko | OK |
| `017_hu39_asumir_coordinacion.sql` | 017 | 2026-11-10 22:51 UTC | DEV | 257b2e2 | Ariana | OK |
| `015_hu45_outbox.sql` | 015 | 2026-11-11 12:57:25 UTC | DEV | a988637 | Marko (PO), mediante Codex/Supabase | OK: esquema y RLS; procesador no activado |
| `022_dep108_crear_expedicion_atomica.sql` | 022 | 2026-11-11 12:57:41 UTC | DEV | a988637 | Marko (PO), mediante Codex/Supabase | OK: creación por RPC y unicidad de bloqueantes |
| `023_dep108_avisos_transaccionales.sql` | 023 | 2026-11-11 12:57:45 UTC | DEV | a988637 | Marko (PO), mediante Codex/Supabase | OK: evento y aviso transaccionales |
| `024_dep108_vencimientos_outbox.sql` | 024 | 2026-11-11 12:57:50 UTC | DEV | a988637 | Marko (PO), mediante Codex/Supabase | OK: productor SQL futuro; cron legado sin cambios |

HU-32: la estructura final está aplicada y verificada en Supabase DEV.
El asiento administrativo 010 fue registrado correctamente en public.treksafe_migraciones el 2026-11-06 a las 05:23 UTC.
No volver a ejecutar el DDL completo de HU-32 en DEV.

TECH-56 (conciliación del 2026-11-10): 002, 003 y las dos migraciones de HU-30 se aplicaron en DEV antes de que existiera el registro 000, por eso no dejaron asiento.
Se verificó con consultas de solo lectura que las tablas y columnas coinciden con los archivos y que las funciones son idénticas a su commit salvo los saltos de línea de Windows (\r) con que se pegaron.
HU-30 está en DEV en la versión 6dbd632; la versión actual del archivo (2a633b6) solo elimina una línea de comentario, sin cambio funcional.
Solo se insertaron los 4 asientos (ON CONFLICT DO NOTHING). No volver a ejecutar estos DDL en DEV.

DEP-04 / #108 (2026-11-11): se aplicaron únicamente `015`, `022`, `023` y `024` después de las pruebas desechables. `017` y `018` ya existían y sus cuerpos normalizados coincidían con el repositorio; no se repitieron. El chequeo con datos ficticios pasó dentro de una transacción revertida, con cero usuarios ficticios restantes, sin correo ni cron. [Evidencia, versiones Supabase y hashes](../../docs/dep-108/evidencia-dev.md). No volver a aplicar estas migraciones de una sola ejecución.

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

HU-32: la estructura final está aplicada y verificada en Supabase DEV.
El asiento administrativo 010 fue registrado correctamente en public.treksafe_migraciones el 2026-11-06 a las 05:23 UTC.
No volver a ejecutar el DDL completo de HU-32 en DEV.

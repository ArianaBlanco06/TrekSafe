# Título sugerido

feat(hu-48): exportar incidentes filtrados en CSV

# Descripción para el PR

## Cambio

La pantalla de estadísticas permite descargar los incidentes con los filtros
aplicados de HU-47. El CSV contiene id, zona, apertura, cierre, estado y resultado,
con alcance global para rescatistas validados. No incluye ficha médica, contactos,
nombres ni resúmenes libres del rescate.

`GET /api/rescate/estadisticas.csv` reutiliza la validación de HU-47. El DAO de
lectura paginada y el Iterator recorren páginas internas de 200 por cursor de id
estable. `ExportadorCsv` consume el `AsyncIterable` sin conocer Supabase o HTTP.
Se conservan interfaces segregadas y responsabilidades separadas (Iterator,
DAO, SRP, ISP y DIP).

El archivo conserva UTF-8 con BOM, encabezados, comillas, acentos y saltos internos.
Los prefijos de fórmula se protegen con tabulación dentro de celdas entrecomilladas.
Se autoriza la primera página antes de iniciar el archivo y un fallo posterior
interrumpe la respuesta. El cliente recibe el cuerpo completo antes de ofrecer
el guardado, cancela al cambiar de reporte/sesión o quedar offline y permite
reintentar. No almacena respuestas CSV para uso offline.

## Migración

`031_hu48_exportacion_incidentes.sql`: RPC de páginas con los mismos filtros y
alcance de HU-47, `STABLE`, `SECURITY INVOKER`, `search_path` vacío y ejecución
exclusiva de `service_role`. Requiere 029 y sus dependencias. No modifica la 029
aplicada ni crea tablas nuevas.

John confirmó con el equipo la disponibilidad de 031 para HU-48.
030 ya corresponde a HU-50. La 031 no se aplicó en DEV mediante este trabajo.

## Validación

- Backend: 1.068 pruebas aprobadas.
- Frontend: 277 aprobadas y 2 omitidas por requerir sus entornos de integración.
- Privacidad PWA: 32 pruebas aprobadas; TypeScript y builds correctos.
- PostgreSQL desechable: 21 comprobaciones aprobadas, ahora incorporadas al job
  de backend del workflow.
- Recorrido real PWA → Express → SDK Supabase → PostgREST → PostgreSQL:
  11 escenarios aprobados. Incluye 1.205 incidentes en siete páginas, filtros,
  permisos, caracteres especiales, fallo SQL de página posterior, reintento,
  cancelación y ausencia de caché con Service Worker activo.

Evidencia, capturas, CSV y hashes:
[HU-48 local](https://github.com/ArianaBlanco06/TrekSafe/blob/feat/hu-48-exportar-csv/docs/evidencias/hu-48-local/evidencia.md).

## Pendiente antes de integrar y cerrar

- [ ] Incorporar el `develop` vigente y revalidar la integración.
- [x] Numeración 031 confirmada por John con el equipo.
- [ ] Coordinar su aplicación en DEV con Sebastian/Ariana.
- [ ] Adjuntar evidencia funcional del CSV en DEV.
- [ ] Validación de Marko, incluida apertura del CSV en la hoja de cálculo del equipo.
- [ ] CI aprobado y revisión técnica del PR.

Closes #50

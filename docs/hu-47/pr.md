# Título sugerido

feat(hu-47): consultar estadísticas operativas de rescate

# Descripción para el PR

## Cambio

Permite a cualquier rescatista con perfil validado consultar estadísticas globales
por rango de días, fecha de apertura o cierre, destino y resultado del rescate.
La pantalla muestra los filtros aplicados en UTC y los conteos de atendidos,
abiertos y cerrados. Cada incidente se cuenta una vez, incluso con varias notas
o relevos. Los localizados pendientes de cierre se incluyen en abiertos.

Se añade `GET /api/rescate/estadisticas` y un DAO de lectura con agregado en
PostgreSQL. Se reutiliza el catálogo de resultados de HU-42. Caso de uso,
controlador, DAO y composición conservan responsabilidades separadas y DIP/ISP.
La respuesta no incluye datos médicos y no se almacena para uso offline.

La pantalla distingue filtros editados de filtros aplicados, conserva el último
reporte ante un fallo de actualización, permite reintentar y descarta respuestas
tardías. El acceso se incorpora a la navegación del rescatista.

## Migración

Se añade `029_hu47_estadisticas_incidentes.sql`, con la RPC e índices de fechas.
John confirmó que el número está libre para HU-47. Requiere 017
y 025 con sus dependencias; 021 precede a 025 si se instala HU-40. La migración
nueva no se ha aplicado en DEV mediante este trabajo.

## Validación

- Backend: 1.031 pruebas aprobadas.
- Frontend: 260 aprobadas y 2 omitidas por depender de entornos específicos.
- TypeScript y compilaciones backend/PWA aprobados.
- PostgreSQL real desechable: 13 comprobaciones aprobadas.
- Navegador → PWA → Express → SDK Supabase → PostgREST → PostgreSQL: 10 escenarios
  aprobados con datos ficticios, incluido volumen de 1.205 incidentes, relevos,
  permisos, fallos, reintento, conjunto vacío y privacidad con Service Worker activo.

Evidencia y capturas: [HU-47 local](https://github.com/ArianaBlanco06/TrekSafe/blob/feat/hu-47-estadisticas-rescate/docs/evidencias/hu-47-local/evidencia.md).

## Pendiente antes de integrar y cerrar

- [x] Numeración 029 confirmada como libre para HU-47 por John.
- [ ] Aplicación coordinada de la nueva migración en DEV con Sebastian/Ariana.
- [ ] Adjuntar prueba de HU-47 en DEV, diferenciándola de los datos ficticios locales.
- [ ] Validación funcional de Marko, incluido catálogo y definiciones de conteos.
- [ ] Revisar y aprobar el PR.

Adicional acordado con John: esta rama también conserva el aviso inferior de
instalación PWA en el login. Puede cerrarse, reaparece al entrar desde navegador
y se oculta al abrir en modo aplicación instalada.

Closes #49

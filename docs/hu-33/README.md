# HU-33 — Visualizar el recorrido con puntos intermedios

Responsable: Andriy Hitoshi Enciso Rojas (@Hitoshi). Issue #33, 3 SP. 8 de noviembre de 2026.

La pantalla `/senderista/expedicion/:id/recorrido`, accesible mediante «Ver recorrido», reúne el plan, puntos numerados y resumen de preparación HU-31. Muestra líneas rectas de referencia inicio → puntos → destino, sin navegación real. La lista ordenada con coordenadas está disponible aunque fallen las teselas, la carga del módulo del mapa o la conexión; las coordenadas ausentes se indican sin inventarlas.

## API y SOLID

`GET /api/expediciones/:id/recorrido` requiere JWT senderista y propiedad. La fachada usa `ILectorPlan`, `ILectorPuntos` e `ILectorPreparacion`, conectados con `ExpedicionDAOSupabase`, `RepositorioPuntosRuta` y el servicio HU-31 existentes. No hay migraciones ni escrituras. Se conserva la API de las otras historias.

SRP: lectura compuesta, transporte, mapa y lista tienen responsabilidades distintas. ISP: tres interfaces de lectura, sin exigir métodos de edición/cancelación. DIP/OCP: colaboradores inyectados y sustituibles. LSP se verifica mediante los resultados esperados de la fachada con sustitutos; esas pruebas no certifican la persistencia remota.

La fachada comprueba propiedad antes de consultar puntos/preparación. Ordena una copia y no publica propietario/contactos/acompañantes. Si las versiones de plan y puntos difieren durante la consulta, devuelve 409 `RECORRIDO_ACTUALIZADO` en vez de mezclar versiones. Un error de preparación no se oculta como una lista vacía.

Privacidad: no-store, regla NetworkOnly de recorrido, sin persistencia offline de respuestas privadas. Una pantalla ya abierta puede conservar su contenido en memoria al perder red; una recarga sin conexión no recupera datos de la API. El contenido se reinicia al cambiar sesión o expedición. La prop opcional `puntos` conserva los consumidores antiguos del mapa.

## Pruebas

- Fachada: orden sin mutar, plan ajeno/inexistente, preparación ausente/presente, versiones distintas y fallo técnico.
- HTTP: JWT, rol, UUID, propiedad, no-store y ausencia de campos privados innecesarios.
- Navegador: acceso desde listado, marcadores y segmento, coordenadas ordenadas, error de teselas, desconexión y acceso ajeno.
- Regresión: suites existentes de backend, frontend, HU-32 y PWA; tipos y builds.

Validación local completada con Node 22.23.4 y Edge: tipos backend/frontend/pruebas y ambos builds aprobados; 459 pruebas backend, 79 frontend (2 integraciones PostgreSQL omitidas), 13 escenarios de regresión UI HU-32 y 17 PWA/compatibilidad aprobados. Los 3 nuevos escenarios HU-33 de navegador usan API controlada y worker bloqueado; la suite conserva las pruebas de privacidad con worker real. Las suites SQL optativas sin base de pruebas se omiten y no equivalen a validación de Supabase DEV. Los grupos se solapan y no se suman como cobertura única.

## Review manual

1. Abrir una expedición propia con puntos ya guardados y pulsar «Ver recorrido».
2. Verificar inicio, puntos 1…N y destino; abrir la lista de coordenadas y comparar el orden.
3. Revisar el resumen de preparación y su enlace a equipo. Sin lista asociada debe mostrarse ese estado explícitamente.
4. Bloquear las teselas o desconectar tras cargar: la lista debe seguir disponible.
5. Probar con otra cuenta: el recurso ajeno devuelve 404.

No se modifican `.env`, Supabase, cron, `servicioExpedicion.ts` ni eventos de plan. Publicación autorizada por Andriy; el PR queda abierto para revisión, sin merge a develop.

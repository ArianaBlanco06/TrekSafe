# HU-33 · Fallos parciales de teselas

Rama `fix/hu-33-mapa-teselas`, basada en `develop`. Seguimiento de HU-33/PR #97, independiente de HU-49.

El mapa cambiaba inmediatamente a la lista cuando una sola imagen de OpenStreetMap disparaba `tileerror`. Ahora `TeselasRecorrido` mantiene el estado de las imágenes, espera al evento `load` del lote y evalúa las que se superponen al área visible del mapa.

- Si carga alguna tesela visible, se conservan mapa, marcadores y segmentos. Un aviso informa de la carga parcial.
- Si hay imágenes visibles fallidas y ninguna correcta, aparece la lista ordenada con coordenadas y **Reintentar mapa**.
- Las imágenes correctas que siguen visibles cuentan también después de desplazar el mapa. Los eventos `tileunload` retiran las imágenes descartadas.
- Reintentar monta otra capa con un registro nuevo. La desconexión y el error de carga del módulo conservan sus alternativas existentes.

La decisión de disponibilidad queda en un componente separado del trazado (SRP). Usa eventos y acceso al contenedor públicos de Leaflet; no depende de sus campos internos. No se añade almacenamiento de mapas ni respuestas privadas, ni cambian API, PWA o migraciones.

## Validación

`frontend/tests/pwa/hu33.spec.ts` comprueba acceso/orden, fallo completo y reintento, una única imagen fallida, otro ciclo de carga durante desplazamiento, desconexión y acceso ajeno. Adjunta una captura de la carga parcial. La API y las teselas de estos casos son controladas; la suite completa conserva pruebas con el Service Worker real.

Para revisión manual, abrir un recorrido propio y bloquear una URL concreta de tesela desde DevTools → Network request blocking. Recargar: deben verse los puntos y segmentos con aviso de carga parcial. Bloquear todas las teselas debe mostrar la lista y permitir recuperar el mapa al desbloquear y reintentar. Desconectar debe conservar el acceso a coordenadas.

Validación local con Node 22.23.4 y Edge: tipos frontend/pruebas, build, 125 pruebas frontend (2 integradas PostgreSQL opcionales omitidas), 13 UI HU-32 y 22 PWA/compatibilidad aprobadas. Los cinco casos HU-33 están incluidos en la suite PWA; los grupos se solapan. No requiere SQL ni cambios de `.env` o Supabase. El CI y la revisión técnica quedan registrados en el PR.

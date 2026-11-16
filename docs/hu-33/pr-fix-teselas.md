Una sola imagen fallida de OpenStreetMap reemplazaba todo el mapa por la lista. Ahora se espera a completar la carga y se evalúan las teselas visibles: si alguna cargó, se mantienen mapa, marcadores y segmentos con un aviso de carga parcial. La lista y el reintento aparecen cuando falla toda la cobertura visible.

Relacionado con HU-33 (#33, implementación inicial #97).

- `TeselasRecorrido` separa la detección de disponibilidad del trazado del recorrido (SRP), usando eventos y métodos públicos de Leaflet.
- Conserva imágenes correctas de cargas anteriores durante el desplazamiento; retira las descargadas y reinicia el registro al reintentar.
- Mantiene la lista al desconectar y la alternativa ante fallo del módulo. No cambia API, privacidad, PWA ni migraciones.

Validación local con Node 22.23.4: TypeScript frontend y pruebas, build, 125 pruebas frontend (2 integradas opcionales omitidas), 13 UI HU-32 y 22 PWA/compatibilidad. Los cinco escenarios HU-33 cubren una sola imagen fallida, fallo completo/reintento, desplazamiento, orden y desconexión/acceso ajeno. La suite adjunta una captura con carga parcial; la API y las teselas son controladas.

[Guía técnica y demostración](https://github.com/ArianaBlanco06/TrekSafe/blob/fix/hu-33-mapa-teselas/docs/hu-33/fix-teselas.md). No requiere SQL ni cambios de `.env` o Supabase. Revisión técnica pendiente antes de integrar.

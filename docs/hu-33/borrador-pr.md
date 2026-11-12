## Descripción

HU-33 permite consultar el recorrido propio con inicio, puntos numerados y destino en el orden del plan. Los segmentos son rectos y orientativos, sin calcular navegación real. Si falla el mapa, se muestra la lista con coordenadas.

Añade una fachada de lectura con tres puertos pequeños que reutilizan plan, puntos HU-32 y preparación HU-31. Incluye endpoint autenticado, pantalla y enlace «Ver recorrido». Conserva las rutas existentes y la privacidad NetworkOnly/no-store. No requiere migración.

Closes #33.

## Validación

Tipos, builds, pruebas backend/frontend y escenarios de navegador documentados en `docs/hu-33/README.md`. Los escenarios cubren orden, propiedad, falta de preparación, versiones concurrentes, fallback del mapa y desconexión. Las pruebas SQL optativas requieren su entorno dedicado y no certifican DEV cuando se omiten.

## Checklist

- [x] Implementación y pruebas de los tres criterios de HU-33.
- [x] Fachada con SRP, ISP y DIP; colaboradores sustituibles.
- [x] Sin migraciones y sin modificar servicios compartidos de cron/expedición.
- [ ] GitHub Actions aprobado en este PR.
- [ ] Revisión técnica y aceptación del PO.

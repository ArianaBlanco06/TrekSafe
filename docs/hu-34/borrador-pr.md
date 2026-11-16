## Descripción

HU-34 permite al propietario registrar online su llegada a un punto de una expedición en progreso, con nota opcional y hora del servidor. Muestra el último avance sin completar el plan, ampliar su plazo o evitar alertas.

Closes #35.

## Implementación

- Command `RegistrarAvance`, puertos pequeños y adaptador Supabase inyectado.
- POST `/api/expediciones/:id/avances` (201 nuevo / 200 repetido) y GET `/api/expediciones/:id/avances/ultimo`, con JWT, rol y propiedad.
- Migración `016_hu34_avances_expedicion.sql`, posterior a 002/010, con RPC SECURITY DEFINER, FK compuesta e idempotencia por cuenta/solicitud. No aplicada en DEV.
- Reintento explícito de solicitudes inciertas, estado solo en memoria de sesión y respuestas NetworkOnly/no-store.
- Sin escrituras en eventos_plan ni cambios en servicioExpedicion.ts o cron. Preserva retorno y ampliación HU-35.

## Validación

Validación final sobre develop `8214042`, que ya incorpora HU-33 y la mejora HU-28 integrada por el equipo: tipos y builds aprobados; 467 pruebas backend, 88 frontend (2 integraciones PostgreSQL omitidas), 13 regresiones UI HU-32, 20 PWA/compatibilidad, 19 comprobaciones SQL y 5 escenarios con Express, SDK Supabase, PostgREST, PostgreSQL y worker reales. Cubren permisos, concurrencia, rollback, respuesta perdida y vencimiento posterior al avance. Detalles y límites en `docs/hu-34/fase-6-integracion.md`.

Las suites SQL optativas de otras historias se omiten sin sus entornos. No se modificó .env ni se ejecutó SQL en Supabase.

## Pendientes

- [ ] GitHub Actions aprobado en este PR.
- [ ] Revisión técnica y aceptación funcional.
- [ ] Instalación y registro de 016 en DEV coordinados por el equipo, una sola vez.

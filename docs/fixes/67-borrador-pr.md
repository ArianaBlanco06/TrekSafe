# Actualización del PR #68 — Fix de privacidad #67

Título sugerido: **fix(pwa): excluir datos privados de caché y aislar borradores por sesión**

Rama: `fix/service-worker-privacidad`. Destino: `develop`. Actualizar el PR #68 existente; no crear otro ni hacer merge. El asistente no ejecutó Git ni publicó cambios.

---

## Descripción

La estrategia NetworkFirst sobre `/api/*` conservaba respuestas privadas en el navegador compartido. El Service Worker ahora usa solo red para API/autenticación y limpia las cachés antiguas al actualizarse. El cliente y backend añaden `no-store` para evitar también el uso de caché HTTP.

Contactos permanecen solo en memoria; los borradores y plantillas explícitos se aíslan por cuenta/sesión y se eliminan al salir. El inicio de una nueva cuenta espera la limpieza y descarta respuestas/escrituras pendientes del usuario anterior. Se conserva el shell offline y la sincronización de borradores de la misma sesión.

Corrección del problema preexistente reportado durante HU-26, sin modificar HU-32 ni la versión de expediciones.

Los ajustes de revisión mantienen `prompt`/`clientsClaim` de HU-26 y admiten explícitamente la clave personal de HU-29, verificando propietario, sesión y sobre con su validador original. Se restaura `test:equipo` para TSX de HU-30 y se crea `test:pwa:privacidad` para Playwright. CI ejecuta ambas por separado cuando HU-30 está disponible y conserva sus dependencias frontend/backend.

## Issue relacionado

Closes #67

## Validación y evidencias

- Typechecks/builds de ambos proyectos y `npm ci` frontend aprobados con Node 22.
- 14 pruebas backend locales y 14 escenarios PWA aprobados con dos cuentas ficticias y worker activo; detalle en el documento de compatibilidad.
- En copia temporal con los commits revisados: tipos de ambos proyectos aprobados, 59 pruebas backend aprobadas y 32 pruebas frontend HU-29/HU-30 aprobadas. Una integración frontend con PostgreSQL y la suite PostgreSQL backend se omiten expresamente; no se ejecutó SQL.
- Capturas reales de Application → Cache storage e inventario: `docs/fixes/evidencias-67/`.
- Política, alcance offline, reproducción y matriz: `docs/fixes/67-service-worker-privacidad.md`.
- Ajustes, commits contrastados y archivos modificados: `docs/fixes/68-ajustes-compatibilidad.md`.
- CI ejecuta la suite PWA con Chromium y adjunta el informe como `evidencia-privacidad-pwa`.

Los datos antiguos sin propietario se descartan. Plantillas/borradores nuevos se eliminan al cerrar sesión. Los contactos requieren red tras una recarga; permanecen en memoria mientras la aplicación sigue abierta.

## Checklist (Definition of Done)

- [x] El código compila y se ejecuta sin errores en la validación local.
- [x] Se agregaron/actualizaron pruebas y evidencia de Cache Storage.
- [ ] Se cumplen y aceptan los criterios en la revisión del equipo.
- [ ] GitHub Actions pasa en backend y frontend después del push.
- [ ] Al menos un integrante revisó técnicamente el PR antes de integrar.

La publicación, revisión e integración quedan a cargo del equipo. No se registra aquí una aprobación ni un resultado remoto que aún no se ha obtenido.

# PR #68 — Compatibilidad del fix de privacidad con HU-26, HU-29 y HU-30

Fecha: 4 de noviembre de 2026. Complementa [67-service-worker-privacidad.md](67-service-worker-privacidad.md).

## Reconstrucción de la rama

El PR #68 había incorporado por merge las implementaciones completas de HU-29 y HU-30. Para que el PR contenga solo el fix de privacidad:

- Se reconstruyó sobre `develop` `9f7fa1737fed0b114438a005593d5c89db2d2f6d`, que ya incluye HU-26 (#61) y HU-30 (#62).
- Se recuperaron solo `5a17fa9c429c` (fix original) y `17360ea76f1f` (inicialización de pruebas). Los merges de HU-29/HU-30 no se recuperaron.
- De `7f38666d9eff` se tomaron a mano solo los ajustes de pruebas necesarios para el modo `prompt` de HU-26. Su lógica de plantillas HU-29 (`plantillasCuentaLogica.ts`, claves `plantillas-cuenta:v1:*` en `offlineStorage.ts`) no se incluyó.
- El historial anterior se conserva en `backup/pr68-antes-limpieza-20261104` (`80bdefc68ace360a09aef889ebd0aad33bad3a2e`).
- No hay cambios en `backend/migrations/` ni en Supabase.

## HU-26 — Editar expedición (integrada)

- Se conservan `registerType: 'prompt'` y `clientsClaim: true`: un worker nuevo espera y no recarga formularios abiertos. No se vuelve a `autoUpdate`.
- Se conserva la regla NetworkOnly de `/api/expediciones/:id`. La regla general NetworkOnly ya cubre la ruta, pero se mantiene explícita.
- Pruebas en `tests/pwa/compatibilidad.spec.ts`: el formulario abierto no se pierde al aparecer un worker nuevo, y la edición envía `versionEsperada` sin cachear el plan. Las pruebas que necesitan el worker corregido aceptan el relevo con `SKIP_WAITING` solo cuando no hay ningún formulario a medio editar.

## HU-30 — Listas de equipo (integrada)

- Rutas, controladores, servicios, DAO, migraciones y frontend de HU-30 no cambian.
- `clienteApi.ts` conserva `const API_URL = import.meta.env?.VITE_API_URL ?? '/api';` y la firma de `peticionApi`. Se añade `cache: 'no-store'` y se descartan las respuestas de una sesión anterior, que devuelven el código `SESSION_CHANGED`.
- `app.ts` añade `Cache-Control: no-store` antes del parser JSON. Así también lo llevan el 400 por JSON malformado de HU-30, los 401 y los 404. Las rutas `/usuario/listas-equipo` siguen igual.
- `package.json` conserva `test:equipo` (tsx) y sus dependencias (`tsx`, `react-test-renderer`, `@types/react-test-renderer`). Se añaden `typecheck:tests` y `test:pwa:privacidad` (Playwright).
- En CI, la suite de HU-30 y la suite PWA corren en pasos separados.
- Pruebas: en el backend, `/api/usuario/listas-equipo` responde con `no-store`. En la PWA, una lista se consulta, crea, edita y elimina sin quedar en Cache Storage ni en Web Storage, y la cuenta B no ve las listas de A.

## HU-29 — Plantillas personales (PR #59, pendiente)

Este PR no incorpora ningún archivo de HU-29: ni páginas, servicios, controladores, repositorios ni migraciones 000/001, ni `CreadorDesdePlantilla`. Al integrar el PR #59 después de este fix, harán falta las siguientes adaptaciones:

| Tema | Estado después del fix | Adaptación necesaria en HU-29 |
| --- | --- | --- |
| Claves offline | `offlineStorage.ts` solo acepta `ClaveOffline = 'route-templates' \| 'expedition-drafts'`. Cualquier otra clave se ignora y además da error de tipos. | `claveCachePlantillas(usuarioId)` devuelve un string arbitrario, así que no compilará. Hay que añadir una clave fija, por ejemplo `'account-templates'`, a `ClaveOffline` y a `clavesPermitidas`. No se deben aceptar prefijos ni claves dinámicas. |
| Caché por propietario | El ámbito ya combina `usuarioId` y un nonce de sesión (`getSessionScope()`). | No hace falta poner `usuarioId` en la clave. Conviene seguir validando el sobre con `plantillasDesdeSobre(valor, usuarioId)` al leer (defensa en profundidad) y descartarlo si el `usuarioId` no coincide. |
| Versionado | El sobre lleva `esquema: 1`. | Mantener `ESQUEMA_CACHE_PLANTILLAS`. Si cambia el esquema, descartar el sobre antiguo en lugar de migrarlo. |
| Logout | `limpiarSesion()` ahora devuelve `Promise<void>` y elimina `treksafe-offline-v2-*` y `treksafe:offline-v2:*`. `loginSession` es `async`. | Llamar a `await loginSession(...)`. No volver a `limpiarSesion(): void` ni a `warmOfflineCache` en `main.tsx`. Las plantillas cacheadas se borran al cerrar sesión. |
| Otra cuenta | Las escrituras pendientes se descartan si cambió la sesión. | En `SelectorPlantillasCuenta` y `PaginaPlantillas`, guardar el ámbito al montar, como en `PaginaCrearExpedicion`, e ignorar respuestas con código `SESSION_CHANGED`. |
| Nueva sesión autorizada | La caché no sobrevive al logout. | Recuperar las plantillas desde `/api/plantillas`, que es la fuente de verdad, y volver a llenar la caché. Sin red en una sesión nueva, la lista empieza vacía. Esto es intencional. |
| Service Worker | Todo `/api/*` y toda petición con `Authorization` es NetworkOnly. | Al resolver conflictos en `vite.config.ts`, no reintroducir `NetworkFirst`/`treksafe-api`. `/api/plantillas` ya queda cubierto. |
| Backend | `no-store` global en el prefijo API. | Las rutas de plantillas lo heredan, sin cambios. Añadir `/plantillas` al bucle de `cachePrivada.test.ts`. |
| Pruebas | `tests/pwa/probe.ts` expone `offline`, `sesion` y `api`. | Añadir pruebas HU-29 en `compatibilidad.spec.ts`: recarga offline en la misma sesión, logout, cuenta B y escritura pendiente. El servidor de fixtures necesitará `/api/plantillas`. |

Las migraciones y la coordinación con Supabase DEV siguen a cargo de la responsable del proyecto y de Sebastián. Este fix no depende de ningún módulo de HU-29.

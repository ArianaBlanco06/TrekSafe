# Fix #67 — Privacidad del Service Worker

Fecha: 3 de noviembre de 2026. Responsable: Andriy Hitoshi Enciso Rojas (@Hitoshi).

Rama indicada por el equipo y seleccionada por Andriy: `fix/service-worker-privacidad`. Referencia: [issue #67](https://github.com/ArianaBlanco06/TrekSafe/issues/67). Corrige el problema preexistente documentado durante HU-26; no se atribuye su introducción a Favio.

Estado: implementación y validación local terminadas, con evidencia de DevTools. El commit/push, la ejecución remota de GitHub Actions y la revisión de otro integrante están pendientes. No se modificaron `.env`, Supabase ni el estado de Git.

## Política de datos offline

| Datos | Tratamiento |
| --- | --- |
| Respuestas de ficha médica, contactos, expediciones y rescate | Solo red. Ninguna respuesta API tiene autorización para almacenamiento offline. |
| HTML, JS, CSS, iconos, fuentes y manifiesto de la aplicación | Precache de Workbox para abrir la PWA sin conexión. |
| Plantillas y borradores creados expresamente en la sesión | Cache Storage y fallback local, en un ámbito propio de cuenta/sesión. Sobreviven a la recarga y se eliminan al cerrar sesión. |
| Contactos del formulario ya abierto | Solo memoria de la sesión. Permiten completar el borrador al perder red; no se escriben en Cache Storage ni localStorage. |
| Cachés antiguas y datos locales sin propietario | Se eliminan; no se importan a la cuenta que abra la aplicación. |

Este alcance offline fue confirmado por Andriy. Tras recargar sin conexión, las plantillas y borradores propios permanecen, pero los contactos deben cargarse nuevamente con red para preparar un nuevo formulario. Los borradores antiguos sin propietario identificable se descartan durante la limpieza. Los borradores nuevos también se eliminan al cerrar sesión.

## Cambios y responsabilidades

- [vite.config.ts](../../frontend/vite.config.ts): sustituye NetworkFirst sobre `/api/*` por NetworkOnly. También cubre peticiones con Authorization a una API en otro origen y excluye API del fallback de navegación. No se añade ninguna lista de endpoints API cacheables.
- [sw-privacy.js](../../frontend/public/sw-privacy.js): al activar el nuevo worker, retira `treksafe-api`, `treksafe-offline-v1` y entradas API/autenticadas de otras cachés, conservando los assets públicos y los borradores v2 válidos.
- [privacidadCache.ts](../../frontend/src/lib/privacidadCache.ts): retira también las claves legacy del almacenamiento local. Serializa la limpieza de salida y entrada de sesión; el nuevo login espera su finalización.
- [sesion.ts](../../frontend/src/lib/sesion.ts) y [ContextoAutenticacion.tsx](../../frontend/src/context/ContextoAutenticacion.tsx): invalidan primero las credenciales/ámbito anterior, limpian los datos privados del origen y la memoria de contactos, y después establecen la nueva sesión. La expiración 401 usa el mismo flujo.
- [offlineStorage.ts](../../frontend/src/lib/offlineStorage.ts): solo admite `route-templates` y `expedition-drafts`, con namespace por cuenta y nonce de sesión. Las lecturas y escrituras pendientes verifican el ámbito y no pueden repoblar datos después de salir. El fallback local aplica el mismo aislamiento.
- [offlineContacts.ts](../../frontend/src/lib/offlineContacts.ts): conserva contactos únicamente en memoria. Los formularios capturan el ámbito original para descartar operaciones tardías de otra sesión.
- [clienteApi.ts](../../frontend/src/services/clienteApi.ts): usa `cache: no-store` y descarta respuestas, cuerpos demorados o 401 pertenecientes a una sesión anterior.
- [app.ts](../../backend/src/presentation/http/app.ts): devuelve `Cache-Control: no-store` en el prefijo API, también antes del parser JSON y de la autenticación.

La separación mantiene SRP: autenticación, política de limpieza, almacenamiento offline y transporte tienen responsabilidades distintas. La política explícita de claves evita convertir el almacén offline en un repositorio de respuestas API. No se modifican contratos de expedición, SQL ni control de versiones de HU-26/HU-32.

La limpieza de salida/entrada elimina las cachés privadas de TrekSafe en este origen; no borra el precache público ni la preferencia de tema. Como Cache Storage/localStorage se comparten entre pestañas del mismo origen, también retira borradores privados allí presentes. No conserva una copia de seguridad de datos sensibles eliminados.

## Validación ejecutada

Entorno local: Windows, Node 22.23.4 y Edge 156.0.4314.58. Las pruebas usan el build de producción, un Service Worker activo y dos cuentas ficticias en la misma sesión de navegador. La API de estas pruebas es un servidor local de fixtures: no es Supabase ni se ejecuta el cron.

| Comprobación | Resultado |
| --- | --- |
| `npm ci` del frontend con el lock actualizado | Aprobado |
| Typecheck de backend y frontend; tipos de pruebas | Aprobados |
| Build backend y PWA frontend | Aprobados |
| Pruebas backend | 14 aprobadas, incluidas cinco de cabeceras HTTP |
| Pruebas PWA con navegador | 9 aprobadas |

Los nueve escenarios cubren limpieza legacy sin migración insegura; actualización desde un worker vulnerable que realmente guardó la ficha; API médica/contactos/expediciones/rescate sin fallback; shell/plantillas/borradores offline y sincronización de la misma cuenta; dos cuentas y logout; respuestas/401/cuerpos tardíos; escritura pendiente al salir; fallback local sin Cache API; expiración 401.

La API fixture devuelve intencionalmente cabeceras cacheables: el worker y cliente deben impedir persistencia incluso así. Las cinco pruebas backend comprueban por separado la política real `no-store` en `createApp`, sin consultas a la base de datos. El test del parser conserva su respuesta 500 histórica; este fix no cambia ese manejo de errores.

## Evidencia de DevTools

Las siguientes capturas son del panel real **Application → Cache storage** de Edge. Se obtuvieron por CDP con dos cuentas ficticias y no son imágenes recreadas. La primera reproduce el worker vulnerable solo dentro del servidor de pruebas; no vuelve a introducirlo en la PWA publicada.

| Momento | Evidencia |
| --- | --- |
| Worker anterior: ficha médica presente en `treksafe-api` | [Antes](evidencias-67/01-antes-worker-vulnerable.png) |
| Worker corregido, cuenta A: únicamente assets públicos | [Cuenta A](evidencias-67/02-cuenta-a-api-sin-cache.png) |
| Cierre de sesión: cachés privadas retiradas | [Logout](evidencias-67/03-logout-solo-assets-publicos.png) |
| Cuenta B en el mismo navegador: sin API ni datos de A en Cache Storage | [Cuenta B](evidencias-67/04-cuenta-b-aislada.png) |
| Ficha ficticia propia cargada por B | [Interfaz B](evidencias-67/05-cuenta-b-interfaz.png) |
| URLs completas y versión del navegador de la captura final | [Inventario B](evidencias-67/inventario-cuenta-b.json) |

El informe automatizado añade inventarios obtenidos con el dominio CacheStorage del protocolo de DevTools y capturas del borrador propio, logout y segunda cuenta. Se genera en `frontend/test-results/privacidad-report/index.html`, con archivos en `frontend/test-results/privacidad/`. Esos resultados se excluyen de Git y GitHub Actions los adjunta como `evidencia-privacidad-pwa`; las capturas seleccionadas de esta carpeta sí forman parte de la entrega.

## Reproducción

Desde la raíz, con Node 22:

```powershell
npm.cmd ci --prefix backend
npm.cmd run typecheck --prefix backend
npm.cmd test --prefix backend
npm.cmd run build --prefix backend
npm.cmd ci --prefix frontend
npm.cmd run typecheck --prefix frontend
npm.cmd run typecheck:tests --prefix frontend
$env:VITE_API_URL = '/api'
npm.cmd run build --prefix frontend
npm.cmd run test:equipo --prefix frontend
```

En Windows se usa Edge instalado. En Linux/CI instalar Chromium con `npx playwright install --with-deps chromium` desde `frontend` antes de ejecutar las pruebas. El build debe usar `/api` para dirigir la aplicación al servidor local de fixtures. No se inicia la API habitual ni se necesita editar `.env`.

Para regenerar las capturas del panel real en Edge/Windows, una vez terminado el build y sin otro servidor en el puerto 4174:

```powershell
cd frontend
node tests/pwa/capturar-devtools.mjs
```

El script inicia y cierra su propio servidor y navegador temporales. Solo escribe evidencia en esta carpeta. Su automatización del frontend de DevTools puede necesitar adaptación si Edge cambia esa interfaz interna; no es parte del build de producción ni un requisito de CI.

Para revisión manual en el entorno coordinado, abrir DevTools → Application → Cache storage, consultar ficha/contactos con A y verificar que no aparecen URLs API. Crear un borrador offline, cerrar sesión, verificar su eliminación, entrar con B en el mismo navegador y repetir la consulta. Al perder red la aplicación abre, pero las respuestas privadas fallan y no muestran una copia de A.

## Pendientes antes de integrar

1. Andriy revisa los cambios y hace commit/push exclusivamente en `fix/service-worker-privacidad`.
2. Abrir/actualizar el PR del fix con `Closes #67` y adjuntar estas evidencias; [borrador preparado](67-borrador-pr.md).
3. Confirmar los jobs backend/frontend de GitHub Actions después del push. Los checks locales pasaron; no se inventa un resultado remoto.
4. Obtener revisión técnica de otro integrante y validar el entorno DEV coordinado antes de integrar. Esta ejecución no registra una aprobación externa.

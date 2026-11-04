# Fix #67 — Privacidad del Service Worker

Fecha: 3 de noviembre de 2026. Responsable: Andriy Hitoshi Enciso Rojas (@Hitoshi).

Actualización del 4 de noviembre: [integración real de develop, HU-29 y HU-30](68-integracion-real-2026-11-04.md), con 158 pruebas backend, 32 frontend y 17 escenarios PWA aprobados. Ese informe sustituye los pendientes de integración y resultados anteriores de esta página; la revisión técnica sigue siendo obligatoria.

Rama indicada por el equipo y seleccionada por Andriy: `fix/service-worker-privacidad`. Referencia: [issue #67](https://github.com/ArianaBlanco06/TrekSafe/issues/67). Corrige el problema preexistente documentado durante HU-26; no se atribuye su introducción a Favio.

Estado: implementación y validación local terminadas, con evidencia de DevTools. El commit/push, la ejecución remota de GitHub Actions y la revisión de otro integrante están pendientes. No se modificaron `.env`, Supabase ni el estado de Git.

Revisión del PR #68: se incorporó compatibilidad con HU-26, HU-29 y HU-30. El alcance, fuentes contrastadas, inventario de archivos y resultados adicionales están en [ajustes de compatibilidad](68-ajustes-compatibilidad.md). Se actualiza el PR existente; no se abre otro.

## Política de datos offline

| Datos | Tratamiento |
| --- | --- |
| Respuestas de ficha médica, contactos, expediciones y rescate | Solo red. Ninguna respuesta API tiene autorización para almacenamiento offline. |
| HTML, JS, CSS, iconos, fuentes y manifiesto de la aplicación | Precache de Workbox para abrir la PWA sin conexión. |
| Plantillas y borradores creados expresamente en la sesión | Cache Storage y fallback local, en un ámbito propio de cuenta/sesión. Sobreviven a la recarga y se eliminan al cerrar sesión. |
| Plantillas personales de HU-29 | Solo la clave `plantillas-cuenta:v1:{usuarioId}` del usuario activo y un sobre válido por `plantillasDesdeSobre`, dentro del mismo ámbito privado. |
| Contactos del formulario ya abierto | Solo memoria de la sesión. Permiten completar el borrador al perder red; no se escriben en Cache Storage ni localStorage. |
| Cachés antiguas y datos locales sin propietario | Se eliminan; no se importan a la cuenta que abra la aplicación. |

Este alcance offline fue confirmado por Andriy. Tras recargar sin conexión, las plantillas y borradores propios permanecen, pero los contactos deben cargarse nuevamente con red para preparar un nuevo formulario. Los borradores antiguos sin propietario identificable se descartan durante la limpieza. Los borradores nuevos también se eliminan al cerrar sesión.

## Cambios y responsabilidades

- [vite.config.ts](../../frontend/vite.config.ts): sustituye NetworkFirst sobre `/api/*` por NetworkOnly. También cubre peticiones con Authorization a una API en otro origen y excluye API del fallback de navegación. Conserva `registerType: 'prompt'` y `clientsClaim: true` de HU-26; no activa una actualización pendiente mientras se edita un formulario.
- [sw-privacy.js](../../frontend/public/sw-privacy.js): al activar el nuevo worker, retira `treksafe-api`, `treksafe-offline-v1` y entradas API/autenticadas de otras cachés, conservando los assets públicos y los borradores v2 válidos.
- [privacidadCache.ts](../../frontend/src/lib/privacidadCache.ts): retira también las claves legacy del almacenamiento local. Serializa la limpieza de salida y entrada de sesión; el nuevo login espera su finalización.
- [sesion.ts](../../frontend/src/lib/sesion.ts) y [ContextoAutenticacion.tsx](../../frontend/src/context/ContextoAutenticacion.tsx): invalidan primero las credenciales/ámbito anterior, limpian los datos privados del origen y la memoria de contactos, y después establecen la nueva sesión. La expiración 401 usa el mismo flujo.
- [offlineStorage.ts](../../frontend/src/lib/offlineStorage.ts): admite las dos claves históricas y la clave personal exacta de HU-29 del usuario activo. Comprueba propietario/sobre y namespace por cuenta/nonce. Las lecturas y escrituras pendientes verifican el ámbito y no pueden repoblar datos después de salir. El fallback local aplica el mismo aislamiento.
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
| Pruebas PWA con navegador | 14 aprobadas; detalle de la revisión en el documento de compatibilidad |

Los nueve escenarios originales cubren limpieza legacy sin migración insegura; actualización desde un worker vulnerable que realmente guardó la ficha; API médica/contactos/expediciones/rescate sin fallback; shell/plantillas/borradores offline y sincronización de la misma cuenta; dos cuentas y logout; respuestas/401/cuerpos tardíos; escritura pendiente al salir; fallback local sin Cache API; expiración 401. Se añaden cuatro de HU-29 y uno de actualización prompt sin pérdida del formulario.

La API fixture devuelve intencionalmente cabeceras cacheables: el worker y cliente deben impedir persistencia incluso así. Las cinco pruebas backend comprueban por separado la política real `no-store` en `createApp`, sin consultas a la base. El test del parser comprueba privacidad sin exigir un status específico: conserva compatibilidad con el 500 histórico y el 400 incorporado por HU-30.

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
npm.cmd run test:pwa:privacidad --prefix frontend
```

En Windows se usa Edge instalado. En Linux/CI instalar Chromium con `npx playwright install --with-deps chromium` desde `frontend` antes de ejecutar las pruebas. El build debe usar `/api` para dirigir la aplicación al servidor local de fixtures. No se inicia la API habitual ni se necesita editar `.env`.

`test:equipo` queda reservado al comando TSX original de HU-30. CI ejecuta ambas suites por pasos distintos e instala también las dependencias backend en el job frontend. Mientras los fuentes de HU-30 no estén en esta rama, su paso informa esa ausencia. La comprobación adicional mediante snapshots fijados se reproduce con `npm.cmd run test:compatibilidad:hu29-hu30 --prefix frontend` y requiere lectura HTTPS de esos commits.

Para regenerar las capturas del panel real en Edge/Windows, una vez terminado el build y sin otro servidor en el puerto 4174:

```powershell
cd frontend
node tests/pwa/capturar-devtools.mjs
```

El script inicia y cierra su propio servidor y navegador temporales. Solo escribe evidencia en esta carpeta. Su automatización del frontend de DevTools puede necesitar adaptación si Edge cambia esa interfaz interna; no es parte del build de producción ni un requisito de CI.

Para revisión manual en el entorno coordinado, abrir DevTools → Application → Cache storage, consultar ficha/contactos con A y verificar que no aparecen URLs API. Crear un borrador offline, cerrar sesión, verificar su eliminación, entrar con B en el mismo navegador y repetir la consulta. Al perder red la aplicación abre, pero las respuestas privadas fallan y no muestran una copia de A.

## Pendientes antes de integrar

1. Andriy revisa los cambios y hace commit/push exclusivamente en `fix/service-worker-privacidad`.
2. Actualizar únicamente el PR #68 existente, conservando `Closes #67` y estas evidencias; [cuerpo preparado](67-borrador-pr.md).
3. Confirmar los jobs backend/frontend de GitHub Actions después del push. Los checks locales pasaron; no se inventa un resultado remoto.
4. Obtener revisión técnica de otro integrante y validar el entorno DEV coordinado antes de integrar. Esta ejecución no registra una aprobación externa.

# HU-32 — Fase 5: editor de puntos

Fecha: 1 de noviembre de 2026. Responsable: Andriy Hitoshi Enciso Rojas (@Hitoshi).

Estado: interfaz implementada y verificada sobre el build de producción con API ficticia controlada. La integración completa con la API y la base de datos del entorno acordado corresponde a la fase 6. No se aplicaron migraciones ni se ejecutó Git.

## 1. Flujo entregado

Desde una expedición programada en el listado, «Gestionar puntos» abre `/senderista/expedicion/:id/puntos`. La pantalla muestra inicio, destino, coordenadas y salida como contexto de solo lectura.

El editor permite agregar hasta 20 puntos, modificar nombre/latitud/longitud, moverlos arriba o abajo y quitarlos. El orden se deriva de la posición y los IDs se conservan al editar y reordenar. Guardar una lista vacía elimina los intermedios sin cambiar los extremos.

El guardado es explícito. La respuesta del servidor sustituye la base local de edición, incluyendo sus coordenadas normalizadas y la nueva versión. Mientras se guarda, se deshabilitan las acciones para mantener estable la colección enviada y los índices de sus posibles errores.

La validación local admite coma o punto decimal al escribir y envía números al backend; conserva entradas incompletas como texto hasta validarlas. Comprueba nombre Unicode, coordenadas y límite de puntos. Los errores locales y del servidor se muestran por campo, con foco en el primer campo inválido y atributos accesibles. El servidor mantiene la autoridad sobre permisos, estado, hora y versión.

## 2. Errores, conflictos y conexión

- Un error por campo conserva la edición y permite corregirla. Los mensajes del servidor se retiran al modificar la lista para evitar asociarlos a posiciones que ya cambiaron.
- Un conflicto de versión bloquea otro guardado hasta revisar la lista actual del servidor. Consultarla no reemplaza los puntos que se estaban editando.
- Después de revisar se puede cargar la lista del servidor, confirmando el descarte si hay cambios, o conservar explícitamente la edición sobre la base consultada. Esta segunda opción explica que el siguiente guardado reemplazará la lista completa; nunca envía un PUT automáticamente.
- Ante una respuesta perdida o un fallo técnico, se conserva la lista y se exige consultar el estado del servidor antes de reintentar. Si el guardado se había completado, se recupera su lista e identidad sin crear otros puntos.
- Si el plan deja de permitir cambios, se conserva la edición visible y se bloquea la escritura. La lectura de planes finalizados se presenta deshabilitada.
- Al perder conexión se deshabilita guardar; volver a conectarse no sincroniza automáticamente. La edición permanece solo mientras siga abierta la pantalla. La cola persistente corresponde a HU-49.
- La pantalla se monta por combinación de usuario e ID de expedición; al cambiar de contexto se abortan peticiones pendientes y no se reutiliza su estado de edición. Los puntos no se guardan en almacenamiento local.
- Se advierte al recargar/cerrar con cambios mediante `beforeunload` y al volver mediante el enlace «Expediciones». El editor no añade un bloqueo general al historial o a toda la navegación de la aplicación.

## 3. Organización y diseño

| Archivo, relativo a la raíz | Responsabilidad |
| --- | --- |
| `frontend/src/services/puntosRuta.ts` | DTO e interfaz `IPuntosRutaApi`; consulta/guardado autenticados mediante el cliente existente. |
| `frontend/src/lib/puntosRuta.ts` | Conversión a campos editables y validación local pura. |
| `frontend/src/hooks/useEditorPuntosRuta.ts` | Carga, edición, guardado, mensajes y revisión de conflictos; recibe el contrato de API como dependencia. |
| `frontend/src/components/puntos/EditorPuntosRuta.tsx` | Campos y acciones de la colección mediante propiedades y callbacks, sin peticiones HTTP. |
| `frontend/src/pages/PaginaPuntosRuta.tsx` | Contexto de la ruta, composición visual y decisiones de revisión. |
| `frontend/src/app/App.tsx` y `pages/PaginaListaExpediciones.tsx` | Ruta protegida para senderistas y acceso desde planes programados. |
| `frontend/vite.config.ts` | Regla NetworkOnly para consultas de puntos, antes de la regla general de caché API. |

Se reutilizaron estilos, navegación y estados de conexión existentes. Los límites geográficos se extraen en funciones pequeñas dentro del validador actual del frontend, conservando el comportamiento de validación de pares de coordenadas.

La separación de responsabilidades aplica SRP. El hook depende de `IPuntosRutaApi`, que concentra las dos operaciones necesarias, aplicando DIP e ISP. La vista puede conservarse al sustituir el transporte detrás de ese contrato, siguiendo OCP. Los DTO y resultados/error de la fase 4 se mantienen; su sustitución entre memoria y PostgreSQL ya tiene la suite común de contrato. Esta fase añade evidencia del consumidor HTTP en navegador, sin introducir herencia artificial en React.

## 4. PWA y pruebas de navegador

La consulta del editor usa `cache: no-store` y se excluye del fallback de caché general mediante NetworkOnly. Esto evita que una respuesta de puntos almacenada se utilice como base de una nueva edición. La regla se verificó en el service worker generado.

Se añadieron Playwright y tipos de Node 22 como dependencias de desarrollo, con sus cambios en el lockfile. `playwright.config.ts` inicia un servidor de preview exclusivo en `127.0.0.1:4173`, sin reutilizar otro proceso. En Windows usa Edge instalado en modo sin ventana. En otros sistemas requiere el Chromium de Playwright.

Las pruebas interceptan todas las peticiones API y usan una sesión ficticia; no levantan el backend ni contactan Supabase. Se bloquean los service workers para controlar esas respuestas. Por tanto, las pruebas de pérdida de red verifican el comportamiento de la interfaz sobre el build/preview; la recuperación completa de la PWA con su worker activo queda para la fase 6.

Resultados finales en Windows, Node `v24.16.0` y Playwright `1.64.1`:

| Comprobación | Resultado |
| --- | --- |
| `npm.cmd run typecheck --prefix frontend` | Aprobada. |
| `npm.cmd run typecheck:ui --prefix frontend` | Configuración y pruebas de navegador comprobadas con TypeScript. |
| `npm.cmd run build:frontend` | Aprobada; PWA y service worker generados. |
| `npm.cmd run test:ui --prefix frontend` | 12 pruebas aprobadas en Edge sobre preview del build final. |
| Inspección visual | Capturas a 320 px en modo claro/oscuro; comprobación de ancho a 1280 px. Se corrigió un solapamiento del botón de guardado y se añadió su comprobación. |

Los 12 casos cubren acceso desde el listado, extremos de solo lectura, alta/edición/reordenación, IDs tras guardar/recargar, validación, límite y eliminación, errores del servidor, conflicto, respuesta perdida, pérdida/recuperación de conexión, bloqueo durante guardado, cambio de estado, consulta no editable/404 y presentación móvil/oscura.

Capturas y trazas se generan en `frontend/test-results/`, excluido junto con `frontend/playwright-report/` en `.gitignore`. Las versiones de referencia del equipo y los navegadores de dispositivos físicos se revisarán durante la integración.

## 5. Reproducción y siguiente fase

Desde la raíz, después de instalar las dependencias registradas del frontend:

```powershell
npm.cmd ci --prefix frontend
npm.cmd run typecheck --prefix frontend
npm.cmd run typecheck:ui --prefix frontend
npm.cmd run build:frontend
npm.cmd run test:ui --prefix frontend
```

En este entorno Windows se autorizó ejecutar build y navegador fuera del entorno restringido: esbuild necesitaba acceder a sus directorios y el navegador iniciar sus procesos. No se modificó la política de PowerShell.

Continuación: [fase 6 — integración, regresión y PWA](fase-6-integracion.md). El acuerdo de versión del plan y la aplicación coordinada de migraciones siguen siendo requisitos para usar la base DEV compartida. Esta fase no marca toda HU-32 como aceptada ni prepara un commit o PR por cuenta de Andriy.

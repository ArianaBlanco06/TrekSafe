# HU-49 · Sincronización de borradores offline

Issue [#51](https://github.com/ArianaBlanco06/TrekSafe/issues/51). Rama `feat/hu-49-sincronizacion-offline`, desde `develop` `3b61042`. 5 SP según el Issue. No integrar sin revisión técnica, migración DEV coordinada y validación funcional de Marko.

## Comportamiento y criterios

| Criterio | Implementación |
|---|---|
| CA-01: cola visible | `/senderista/expedicion/borradores`: pendientes, errores y sincronizados; revisar/corregir/descartar. Acceso desde Expediciones y el formulario. |
| CA-02: revisión al reconectar | No se envía automáticamente. Reutiliza el formulario de creación y exige revisar fechas y contactos vigentes; una salida vencida se corrige antes de enviar. |
| CA-03: sin duplicados y aislada | UUID local estable, registro por cuenta/UUID, operación SQL atómica. El mismo comando recupera el mismo plan. Persistencia por cuenta y guardia de sesión contra escrituras/respuestas tardías. |

Una respuesta perdida conserva el comando original y muestra **Comprobar envío**. Se puede recuperar aunque sus fechas ya hayan pasado. Hasta confirmar un rechazo o una creación no se permite editar su contenido; descartar informa que no cancela un posible plan del servidor. Un rechazo confirmado de fechas/contactos permite corregir conservando el UUID. Los sincronizados conservan el enlace al plan y quitan contactos/acompañantes de su copia local. La cola admite 50 entradas y avisa si se llena; no descarta pendientes silenciosamente.

Cerrar una ventana/PWA conserva la cola de esa cuenta. Al abrir una sesión nueva, solo una autenticación correcta de **la misma cuenta** permite recuperarla; no se persisten tokens para simular una sesión offline. Si la PWA se abre sin sesión y sin red, los datos permanecen guardados hasta poder autenticarse. Logout o expiración 401 eliminan la cola. Un login de otra cuenta limpia la cola anterior y nunca la importa. Las plantillas personales mantienen su aislamiento original por sesión.

## Diseño SOLID y patrones

- **Command:** `CrearPlan` en frontend conserva el comando mientras su resultado es incierto; `CrearPlan` en backend encapsula una copia de la orden autenticada.
- **Adapter:** `ColaLocalCache` implementa `IColaLocal` mediante Cache API y una única clave local autorizada. En entornos sin Cache API usa Local Storage; si no puede persistir informa el fallo.
- **SRP:** cola/persistencia, envío, contrato HTTP, creación SQL y presentación tienen responsabilidades separadas.
- **DIP/ISP:** Command depende de `IColaLocal` y del puerto `EnviarPlan`; backend depende de `ICreadorPlanIdempotente`. Los detalles HTTP y Supabase quedan en adaptadores.
- Bloqueos Web Locks (con serialización local como respaldo) evitan perder cambios concurrentes de la cola. La base garantiza idempotencia incluso entre pestañas o solicitudes concurrentes.

Se migra exclusivamente la cola antigua de la **misma sesión**. Nunca se importan datos legacy sin propietario. Ninguna respuesta de API se convierte en caché offline. `registerType: prompt`, la política NetworkOnly, HU-26/27/28/29/30/31/32/33/34/35/38 y sus rutas se conservan; una repetición HU-28 con puntos sigue requiriendo conexión.

## Contrato y persistencia

`POST /api/expediciones/borradores/sincronizar`, JWT `senderista`, `Cache-Control: no-store`. Cuerpo: `borradorId` UUID y los campos de creación existentes, incluyendo `minutosRecordatorio`. No acepta identidad, estado, puntos ni versión del cliente. Fechas ISO, coordenadas normalizadas, contactos únicos/ordenados, límites de texto y propiedad se validan antes/durante la transacción.

- `201 { expedicion, repetido: false }`: creación nueva.
- `200 { expedicion, repetido: true }`: reenvío equivalente.
- `400`: corregir fechas/contactos/datos; `401/403`: autenticación/rol.
- `409`: expedición activa o clave reutilizada con otros datos.
- `410`: el plan original fue eliminado; la clave consumida impide recrearlo.
- `503` o pérdida de respuesta: resultado incierto, comprobar el mismo comando.

**Migración nueva:** `backend/migrations/019_hu49_creacion_plan_idempotente.sql`, después de 002 y 014. El **019 es provisional hasta el merge**: revisar nuevamente el siguiente número libre con el equipo. La 015 sigue reservada para HU-45. Pendiente de coordinar aplicación en DEV con Ariana; no se ejecutó en Supabase ni se cambió su registro de aplicación.

La tabla `creaciones_plan_offline` relaciona cuenta/UUID, contenido original y plan. La RPC es `SECURITY INVOKER`, `search_path` vacío, ejecución solo `service_role`, RLS y permisos cerrados a `anon/authenticated`. Un lock por perfil serializa las creaciones offline; plan, contactos, acompañantes y clave se guardan en una sola transacción. Repetir con datos diferentes produce conflicto. Eliminar el plan deja constancia de la clave; eliminar la cuenta elimina esa constancia por FK. No cambia `servicioExpedicion.ts`, el cron, `eventos_plan` ni las otras RPC.

## Validación

Node 22.23.4 y PostgreSQL 18 local desechable, sin `.env` ni conexiones a Supabase. Resultados finales y CI se registran en el PR.

```powershell
npm.cmd run typecheck --prefix backend
npm.cmd test --prefix backend
npm.cmd run build --prefix backend
node backend/scripts/test-hu49-postgres.mjs --pg-bin "C:/Program Files/PostgreSQL/18/bin"
npm.cmd run typecheck --prefix frontend
npm.cmd run typecheck:tests --prefix frontend
npm.cmd run typecheck:ui --prefix frontend
npm.cmd run test:equipo --prefix frontend
npm.cmd run build --prefix frontend
npm.cmd run test:ui --prefix frontend
npm.cmd run test:pwa:privacidad --prefix frontend
```

El workflow conserva las suites existentes y añade el runner SQL HU-49. Las pruebas de navegador usan el Service Worker del build y una API controlada para desconexiones, dos cuentas y respuesta cortada; las pruebas SQL ejercitan la transacción y permisos reales en PostgreSQL. Esto no sustituye probar el despliegue en Supabase DEV una vez aplicada la migración.

## Demostración para Marko

1. Iniciar sesión como cuenta A. Abrir Nueva, completar datos futuros y contactos, pasar offline y guardar. Ver Pendiente en Borradores offline.
2. Recargar offline. Volver online: el plan no debe registrarse automáticamente. Revisar el borrador y las dos confirmaciones antes de sincronizar.
3. Usar fechas vencidas: corregirlas antes de enviar. Mostrar un rechazo de contactos y que permite revisar/corregir.
4. Para respuesta perdida usar la suite controlada (no inyectar fallos en DEV): comprobar que Error conserva el mismo UUID y el reintento crea solo un plan.
5. Cerrar la ventana sin logout y abrir otra. Autenticarse como A: la cola continúa. Cerrar sesión: Cache Storage pierde `treksafe-offline-v2-cola-*`. Entrar como B: no aparecen datos de A.
6. Verificar plantillas HU-29, recordatorio HU-38 y repetición HU-28 con puntos online. Adjuntar capturas de la cola y Application → Cache Storage con datos de prueba.

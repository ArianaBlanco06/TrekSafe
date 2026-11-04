# PR #68 — Integración real de develop, HU-29 y HU-30

Fecha: 4 de noviembre de 2026. Responsable: Andriy Hitoshi Enciso Rojas (@Hitoshi).

El usuario autorizó actualizar `fix/service-worker-privacidad` y posteriormente incorporar también `feat/hu-29-plantillas` y `feat/hu-30-equipo`. Esta entrega conserva el PR #68 existente y no realiza su merge hacia develop.

## Preparación y fuentes incorporadas

- `git status` confirmó el árbol limpio; no fue necesario guardar cambios mediante stash o un commit previo.
- Respaldo local: `backup/fix-service-worker-privacidad-20261104-003617`, sobre `97dc38eaf85b4102ef89534ee1122f4c5b15c694`.
- Se ejecutó `git fetch origin --prune` y se comprobó que la rama local coincidía con la remota.

| Fuente | Commit incorporado | Aporte |
| --- | --- | --- |
| `origin/develop` | `7a3a8a67af0e33ccc17c9ee419fe26bb4b35d149` | HU-26: edición de plan, DTO/puertos, versión/eventos, DAO/RPC, pantalla, rutas y pruebas. Conserva el historial de develop, incluido el revert de HU-37. |
| `origin/feat/hu-29-plantillas` | `c1c68c14bb0cf5fc09fbdcba001289c8202991e8` | API y DAO de plantillas, creador de borradores, pantalla, selector, guardado desde el formulario y pruebas. |
| `origin/feat/hu-30-equipo` | `92ddf58156fa177260ca03230b7c69e5e599cef5` | Listas personales de equipo: dominio, API, DAO, rutas, pantalla, hooks y suites TSX. |

Las ramas HU-29/HU-30 todavía no estaban fusionadas en el develop descargado. Se incorporan por autorización expresa del usuario, no por asumir que ya pertenecían a develop.

Los merges se resuelven secuencialmente en la rama del fix. Commits locales intermedios: `6b44dd1` (develop) y `7955062` (HU-29). El hash del commit final de HU-30 y resolución completa se comunica en el informe de entrega y puede consultarse en `git log` y en el PR.

## Conflictos y resolución

Hubo siete archivos distintos con conflictos; `vite.config.ts` y el README de migraciones aparecieron en más de una integración.

| Archivo | Resolución y motivo |
| --- | --- |
| `frontend/vite.config.ts` | Se conserva la explicación y el modo `prompt` de HU-26, `clientsClaim`, la limpieza del worker y el precache estático. Una regla NetworkOnly general cubre también la lectura del plan y las listas de equipo. No se recupera NetworkFirst para API privada. |
| `backend/migrations/README.md` | Se combinan el registro/convención de HU-29, las excepciones re-ejecutables de HU-26 y la documentación de HU-30. Se conservan sus instrucciones y requisitos, sin ejecutar SQL. |
| `.github/workflows/ci.yml` | Se mantiene instalación backend en el job frontend, tipos de pruebas, suite TSX, build y Playwright por separado. Al estar HU-30 integrada, su suite ya se ejecuta sin condición de disponibilidad ni `--if-present`. |
| `backend/package.json` | Se conservan los scripts de HU-29 y el glob entre comillas de HU-30 para que Node descubra recursivamente las pruebas en Linux y Windows. |
| `frontend/package.json` | Se conservan los comandos TSX y PWA independientes y las dependencias de ambos. `@types/node` mantiene el rango compatible de HU-30. |
| `frontend/package-lock.json` | Se resuelve la especificación de tipos de Node, se regenera con npm desde el package combinado y se verifica mediante instalación limpia. No se toma un lock completo de una sola rama. |
| `frontend/src/pages/PaginaPerfilSenderista.tsx` | Se conservan ambos iconos y accesos: Mis plantillas y Listas de equipo. |

No se resolvieron conflictos aceptando una rama completa. Los cambios automáticos relevantes también se revisaron:

- `backend/src/presentation/http/app.ts` conserva `Cache-Control: no-store` y todas las rutas, incluidas `/plantillas` y `/usuario/listas-equipo`.
- `PaginaCrearExpedicion.tsx` conserva selección/guardado de plantillas personales y todo el flujo de borradores offline con su ámbito de sesión. El diff respecto al respaldo añade HU-29 sin eliminar ese flujo.
- `clienteApi.ts` mantiene las comprobaciones de respuestas tardías, `no-store` y la importación compatible con TSX. `offlineStorage.ts` conserva la política de propietario/sobre sin cambios respecto al respaldo.
- El manejador de errores combina los extras de HU-26 con la validación de equipo/JSON de HU-30.

Se verificó que todos los archivos añadidos por las tres fuentes permanecen presentes y coinciden con sus versiones originales, salvo el README de migraciones combinado. No se eliminaron ni deshabilitaron pruebas de las historias.

## Validación sobre la combinación real

Entorno local: Windows, Node 22.23.4 y Edge. Estos resultados ya corresponden a los archivos integrados, no a la copia temporal usada el 3 de noviembre.

| Validación | Resultado |
| --- | --- |
| `npm ci` backend y frontend | Aprobados. |
| Typecheck backend y frontend | Aprobados. |
| `typecheck:tests` | Aprobado; incluye también todos los tests TS/TSX de `frontend/src`. |
| `npm test` backend | 158 pruebas aprobadas. |
| `npm run test:equipo` frontend | 32 aprobadas y una integración PostgreSQL omitida por su guarda original. |
| Build backend y frontend | Aprobados. |
| `npm run test:pwa:privacidad` | 17 escenarios aprobados, worker activo y dos cuentas ficticias. |
| Marcadores de conflicto y `git diff --check` | Sin conflictos pendientes ni errores de formato. |
| Archivos de entorno | Huellas SHA-256 sin cambios respecto al inicio. |

Las suites opcionales de PostgreSQL/migraciones conservan sus guardas originales y no se ejecutaron: no se habilitaron sus URLs de prueba ni se aplicó SQL. No se tocó Supabase. Las migraciones versionadas se incorporan como archivos originales de las ramas para la posterior coordinación del equipo.

### Funcionalidades verificadas

- **HU-26:** reglas/DAO de edición cubiertos por sus pruebas; pantalla real carga una versión vigente, bloquea guardar sin cambios, conserva lo escrito sin red y envía la versión esperada al guardar. La actualización prompt mantiene un formulario abierto.
- **HU-29:** API con JWT y DAO en memoria; selector real aplica la plantilla y exige fechas nuevas; plantillas personales y borradores offline conviven y sobreviven a recarga; propietario/sobre se validan y el logout limpia los datos.
- **HU-30:** suite TSX original, contratos/HTTP con DAO en memoria; pantalla real crea una lista con un ítem obligatorio; perfil conserva ambos accesos; la cuenta B no recibe la lista de A y se bloquean escrituras sin red.
- **Privacidad/PWA:** no se persisten respuestas API médicas, contactos, planes, rescate o listas de equipo; se conservan assets offline; respuestas y escrituras tardías no contaminan otra sesión.

Para la prueba de navegador se ampliaron únicamente los fixtures locales y se añadió `frontend/tests/pwa/historiasIntegradas.spec.ts`. El probe de HU-29 ahora importa el adaptador productivo integrado. Las nuevas verificaciones de cabeceras también exigen 401/no-store en `/plantillas` y `/usuario/listas-equipo`, comprobando que las rutas reales siguen montadas.

Los escenarios PWA usan un servidor HTTP de fixtures; no acreditan ejecución de SQL o PostgREST en DEV. Las suites backend ejercitan las reglas y rutas reales con sustitutos de persistencia. Los grupos comparten casos y no deben sumarse como pruebas únicas.

## Publicación y revisión

Después del commit final se sube exclusivamente `fix/service-worker-privacidad` y se comprueba en GitHub que el PR #68 no tenga conflictos y que los jobs backend/frontend de Actions terminen satisfactoriamente. El resultado remoto y sus enlaces se informan al cerrar la tarea; los resultados locales anteriores no se presentan como Actions.

El PR permanece abierto para una nueva revisión técnica. No se hace merge hacia develop, no se borran ramas y no se cambia su aprobación. La aplicación de migraciones en DEV y cualquier prueba SQL posterior siguen siendo acciones separadas del equipo.

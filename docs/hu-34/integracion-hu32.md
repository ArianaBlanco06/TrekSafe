# HU-34 — Incorporación de la dependencia HU-32

Fecha: 5 de noviembre de 2026. Responsable: Andriy Hitoshi Enciso Rojas (@Hitoshi).

Andriy inició un merge de `origin/feat/hu-32-puntos` sobre `feat/hu-34-avances-manuales`. Git dejó seis archivos en conflicto. Esta intervención combina su contenido; marcar la resolución, finalizar el merge y publicar permanecen a cargo de Andriy. No se ejecutaron `git add`, commits, cambios de rama, fetch, push ni aplicación de migraciones desde el asistente.

## Resolución revisada

| Archivo en conflicto | Resolución |
| --- | --- |
| `backend/migrations/README.md` | Conservar guía compartida y secciones HU-26/HU-29/HU-30, incorporar documentación HU-32 y su dependencia de `002`. Documentar su excepción existente de RPC `SECURITY DEFINER` sin cambiar el SQL. |
| `backend/src/presentation/http/app.ts` | Conservar no-store, todas las rutas existentes y la repetición HU-28; añadir puntos HU-32 antes de las rutas generales de expediciones. |
| `frontend/package.json` | Conservar scripts de equipo, privacidad y HU-28; incorporar `test:ui` y `typecheck:ui` de HU-32. Mantener Playwright fijado a `1.64.1`. |
| `frontend/package-lock.json` | Resolver la diferencia de rango Playwright usando la misma versión fija del manifiesto; conservar el grafo combinado. |
| `frontend/src/pages/PaginaListaExpediciones.tsx` | Mostrar ambos accesos para programadas: «Editar» de HU-26 y «Gestionar puntos» de HU-32. |
| `frontend/vite.config.ts` | Conservar `prompt`, precache estático, limpieza de privacidad y reglas `NetworkOnly`, incluida la exclusión de puntos. Descartar la antigua regla genérica `NetworkFirst` que volvería a cachear datos privados. |

Además, `frontend/tsconfig.playwright.json` delimita la comprobación NodeNext a configuraciones y suites HU-32. Su patrón antiguo `tests/**/*.ts` incluía pruebas de privacidad y HU-28 que usan resolución bundler. Esas suites siguen cubiertas por `typecheck:tests`; no se eliminó ni deshabilitó ninguna prueba. Se amplió el escenario de acceso desde el listado en `frontend/tests/hu32/puntosRuta.spec.ts` para comprobar que el enlace «Editar» coexiste con «Gestionar puntos».

En `frontend/tests/pwa/servidor.mjs` se deshabilitó la lectura de archivos de entorno para compilar el módulo auxiliar y se fijó explícitamente su API a `/api`. La primera ejecución mostró que Vite podía resolver la propiedad específica desde `.env` por encima de la definición del objeto completo; las solicitudes ficticias lentas no llegaban al servidor local. Se corrigió únicamente la configuración del servidor de pruebas, conservando las aserciones de sesión y el cliente de producción.

La integración automática de `frontend/src/app/App.tsx` conserva las pantallas existentes e incorpora la pantalla de puntos. El middleware no-store sigue antes de las rutas y del parser JSON. Los nuevos puntos mantienen versión INTEGER y el ensamblaje de HU-32 sin recrear su implementación.

## Verificación local

Referencia de ejecución: Node 22.23.4. Se usó `VITE_API_URL=/api` únicamente en el proceso de build; ningún `.env` fue editado.

| Comprobación | Resultado |
| --- | --- |
| Typecheck backend y frontend | Correctos. |
| Typecheck de pruebas compartidas y de UI HU-32 | Correctos tras delimitar las suites de la configuración HU-32. |
| `npm ci --prefix frontend --dry-run --ignore-scripts --offline --no-audit --no-fund` | Correcto: manifiesto y lock compatibles; no es una reinstalación completa. |
| `npm test --prefix backend` | 238 pruebas aprobadas, 0 fallos; suites opcionales PostgreSQL omitidas sin conexión configurada. |
| `npm run test:equipo --prefix frontend` | 46 aprobadas, 1 integración PostgreSQL omitida, 0 fallos. Incluye las pruebas existentes HU-28/HU-29/HU-30 descubiertas por el script. |
| Builds backend y frontend/PWA | Correctos; generado Service Worker y precache de assets. |
| `npm run test:ui --prefix frontend` | 12 pruebas HU-32 aprobadas en Edge, incluida la coexistencia de «Editar» y «Gestionar puntos». API sustituida, sin SQL. |
| `npm run test:pwa:privacidad --prefix frontend` | 12 pruebas aprobadas con Service Worker activo, servidor ficticio local y dos cuentas. Incluye actualización mediante prompt, sesión tardía, limpieza, offline y listas HU-30. |
| Revisión final | Sin marcadores de conflicto ni errores de whitespace; dependencias del manifiesto y raíz del lock coinciden. El índice Git sigue pendiente de resolución por Andriy. |

La primera ejecución de suites TSX dentro del aislamiento de herramientas falló por `uv_os_get_passwd / ENOMEM` antes de cargar las pruebas. Su repetición fuera de ese aislamiento terminó con los resultados indicados; no se alteraron pruebas para evitar el fallo. El primer `typecheck:ui` detectó imports de otras suites por el patrón demasiado amplio; se corrigió su alcance y se verificaron ambas configuraciones de tipos por separado.

No se levantó el backend real contra DEV, no se inició el cron de producción, no se aplicó SQL y no se ejecutaron los escenarios que requieren PostgreSQL/PostgREST. Estas comprobaciones no certifican el estado de Supabase ni GitHub Actions. Los avances HU-34 continúan sin implementar.

## Cierre a cargo de Andriy

Los archivos pueden no contener ya marcadores de conflicto y seguir apareciendo como `UU`/`AA`: Git conserva ese estado hasta que Andriy marque la resolución con `git add`. Los archivos de `docs/hu-34/` que aparecen sin seguimiento también se deben registrar para conservar las fases 1 y 2 y este informe. Después corresponde finalizar el merge con su commit y comprobar `git status`.

No aceptar versiones completas de una rama ni ejecutar migraciones compartidas para cerrar el merge. La fase 3 de HU-34 se desarrollará después de esa preparación, tomando el esquema real de puntos como dependencia.

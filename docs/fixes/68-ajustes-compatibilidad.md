# PR #68 — Compatibilidad de privacidad con HU-26, HU-29 y HU-30

Fecha: 3 de noviembre de 2026. Responsable: Andriy Hitoshi Enciso Rojas (@Hitoshi).

Esta revisión modifica el fix de `fix/service-worker-privacidad` para el [PR #68 existente](https://github.com/ArianaBlanco06/TrekSafe/pull/68), que resuelve el issue #67. No se crea otro PR ni se hace merge. Git, commit y push siguen a cargo de Andriy. No se modificaron `.env`, Supabase o migraciones SQL.

## Fuentes contrastadas

Los archivos de HU-29/HU-30 no estaban integrados en esta rama. Se consultaron por HTTPS, sin comandos Git, los commits que contenían los contratos reales:

| Historia | Rama y PR | Commit revisado |
| --- | --- | --- |
| HU-26 | `feat/hu-26-editar-plan`, #61 | `62f004825750cf7ee6032928c3fe888ab1944e84` |
| HU-29 | `feat/hu-29-plantillas`, #59 | `c1c68c14bb0cf5fc09fbdcba001289c8202991e8` |
| HU-30 | `feat/hu-30-equipo`, #62 | `92ddf58156fa177260ca03230b7c69e5e599cef5` |

El [manifiesto](../../frontend/tests/compatibilidad/origenes.json) fija esas revisiones. La verificación adicional guarda también las huellas de los fuentes descargados en su carpeta temporal. Los resultados no se atribuyen a versiones posteriores de esas ramas.

## Decisiones técnicas

**Claves y propietario de HU-29.** El almacén mantiene `route-templates` y `expedition-drafts` y admite únicamente `plantillas-cuenta:v1:` seguido del ID exacto de `getSessionUser()`. No acepta claves de otro usuario, otro esquema, sufijos adicionales ni rutas API. La firma pública recibe `string` porque `claveCachePlantillas()` de HU-29 devuelve ese tipo; la autorización de la clave se hace mediante la lista explícita en ejecución.

Las lecturas y escrituras conservan `getSessionScope()`, que combina usuario y nonce de sesión y sobrevive a la recarga. Cada operación revalida el ámbito después de las esperas. Una escritura pendiente que termina tras el logout elimina su caché anterior, sin afectar al ámbito nuevo. La limpieza existente elimina las claves personales tanto de Cache Storage como del fallback local.

**Sobre de HU-29.** Se reutiliza `plantillasDesdeSobre` original, verificando esquema, propietario y forma del sobre antes de guardar o devolver datos. Se incorporó su módulo puro sin modificarlo respecto al commit de HU-29. El adaptador original se conserva como fixture de pruebas: continúa realizando su propia validación y filtrando plantillas inválidas. No se reimplementa su contrato ni se incorpora toda la funcionalidad/UI de HU-29 a esta rama.

**Actualización de HU-26.** `vite.config.ts` conserva `registerType: 'prompt'` y `clientsClaim: true`, ambas comprobadas en HU-26. No se añade una aceptación automática de actualizaciones. La prueba abre un formulario, espera de verdad un worker nuevo en estado `waiting` y comprueba que conserva los campos y el documento. Solo las pruebas/capturas aceptan explícitamente el relevo después de terminar ese escenario. La limpieza de cachés antiguas se verifica después de activar el worker corregido.

**Pruebas separadas de HU-30.** Se restaura exactamente su comando:

```text
test:equipo = tsx --tsconfig tsconfig.json --test src/**/*.test.ts src/**/*.test.tsx
test:pwa:privacidad = playwright test --config playwright.privacy.config.ts
```

Se conservan Playwright y sus tipos y se agregan `tsx`, `react-test-renderer` y `@types/react-test-renderer` con los rangos de HU-30. El lock se regenera y se valida con `npm ci`. El job frontend instala también las dependencias backend que requieren las pruebas integradas.

CI ejecuta ambos comandos por pasos independientes. Si los fuentes de HU-30 aún no están presentes, informa esa ausencia y omite únicamente su paso; no sustituye HU-30 con Playwright. En la copia de compatibilidad, donde sí están sus fuentes reales, se ejecutó el comando npm original `test:equipo`.

**Otros dos límites de integración.** `clienteApi` conserva `import.meta.env?.VITE_API_URL` de HU-30 para poder importarse con TSX fuera de Vite, junto con las protecciones de sesión/no-store del fix. La prueba backend de cabeceras ya no impone un status ajeno a su responsabilidad: comprueba `no-store` en el rechazo del parser, compatible tanto con el 500 histórico como con el 400 que agrega HU-30. El manejador de errores productivo no se modifica en esta revisión.

Se mantienen SOLID/SRP: el almacén decide qué clave puede persistir; el módulo puro de HU-29 valida su formato; la sesión determina el ámbito; Workbox decide el acceso a red. Ninguna corrección recupera NetworkFirst ni una caché de endpoints privados.

## Archivos de esta revisión

| Archivo | Cambio |
| --- | --- |
| [offlineStorage.ts](../../frontend/src/lib/offlineStorage.ts) | Clave personal exacta, propietario/sobre y verificaciones después de esperas. |
| [plantillasCuentaLogica.ts](../../frontend/src/lib/plantillasCuentaLogica.ts) | Módulo original de HU-29, reutilizado sin modificaciones. |
| [clienteApi.ts](../../frontend/src/services/clienteApi.ts) | Importación compatible con TSX, manteniendo privacidad. |
| [vite.config.ts](../../frontend/vite.config.ts) | `prompt` y `clientsClaim` de HU-26. |
| [package.json](../../frontend/package.json) | Suites separadas y dependencias de HU-30. |
| [package-lock.json](../../frontend/package-lock.json) | Lock combinado y comprobado con instalación limpia. |
| [ci.yml](../../.github/workflows/ci.yml) | Pasos TSX/PWA separados y dependencias backend del job frontend. |
| [cachePrivada.test.ts](../../backend/src/presentation/http/cachePrivada.test.ts) | Prueba de privacidad compatible con ambos manejadores HTTP. |
| [compatibilidad.spec.ts](../../frontend/tests/pwa/compatibilidad.spec.ts) | Cuatro escenarios HU-29 y uno de actualización HU-26. |
| [privacidad.spec.ts](../../frontend/tests/pwa/privacidad.spec.ts) | Conserva las nueve pruebas y adapta activación/esperas a prompt. |
| [probe.ts](../../frontend/tests/pwa/probe.ts) | Expone el adaptador/validador real únicamente al servidor de pruebas. |
| [Fixture HU-29](../../frontend/tests/compatibilidad/hu29/cachePlantillasCuenta.ts) | Copia exacta del adaptador revisado; no se distribuye en el build productivo. |
| [origenes.json](../../frontend/tests/compatibilidad/origenes.json) | PR, commits y lista cerrada de fuentes para reproducir la comprobación. |
| [verificar-integracion.mjs](../../frontend/tests/compatibilidad/verificar-integracion.mjs) | Copia temporal, tipos y suites reales de los contratos revisados, sin SQL. |
| [capturar-devtools.mjs](../../frontend/tests/pwa/capturar-devtools.mjs) | Aceptación explícita del worker en la captura, sin activación automática de producción. |
| [Documento del fix](67-service-worker-privacidad.md) y [cuerpo para PR #68](67-borrador-pr.md) | Comandos, alcance y resultados actualizados. |
| [Evidencia seleccionada](evidencias-67/inventario-cuenta-b.json) | Inventario y cinco PNG regenerados con la configuración final. |
| Este documento | Decisiones, trazabilidad, resultados y pendientes de revisión. |

## Validación

Entorno: Windows, Node 22.23.4 y Edge 156.0.4314.58. Las pruebas PWA usan el build productivo y un servidor HTTP local de fixtures; los workers permanecen activos.

| Comprobación | Resultado |
| --- | --- |
| Instalación limpia frontend, con dependencias combinadas | `npm ci` aprobado. |
| Typecheck backend y frontend | Aprobados. |
| Typecheck de pruebas | Aprobado. |
| Pruebas backend de la rama del fix | 14 aprobadas. |
| Build backend | Aprobado. |
| Build frontend | Aprobado con `prompt`, `clientsClaim` y el worker generado. |
| PWA/privacidad, suite independiente | 14 escenarios aprobados; proceso terminado con código 0. |
| Tipos backend/frontend de la copia con contratos HU-29/HU-30 | Ambos aprobados. |
| Backend con fuentes HU-30 en copia temporal | 59 pruebas aprobadas. La suite PostgreSQL está expresamente omitida. |
| `test:equipo` en esa copia: HU-29 + HU-30 | 33 pruebas registradas: 32 aprobadas y una integración PostgreSQL omitida. Incluye las nueve pruebas puras originales de HU-29. |

Los grupos comparten pruebas y no se suman como casos únicos. En HU-30 frontend pasaron 23 pruebas sin PostgreSQL; las otras nueve aprobadas pertenecen a la lógica de HU-29. No se configura `HU30_TEST_DATABASE_URL`, se retira del entorno de los hijos y no se ejecuta SQL. La suite backend PostgreSQL marcada `SKIP` tampoco se ejecutó, aunque el resumen de Node no la contabiliza como test individual omitido.

La copia temporal usada para la comprobación aprobada fue `frontend/test-results/compatibilidad/integracion-mRRA7M/`. Contiene los logs `typecheck-backend-integrado.log`, `typecheck-frontend-integrado.log`, `backend-integrado.log`, `hu29-hu30-tsx.log` y sus huellas de origen. Esa carpeta se excluye de Git. No es una rama ni un merge.

La copia parte de los fuentes actuales del fix y añade los archivos nuevos de HU-30, su manejador de errores y el adaptador/pruebas puras de HU-29. Conserva el `offlineStorage`, `clienteApi` y comandos de este fix. No combina automáticamente los cambios de rutas/pantallas de `App.tsx`, perfil o creación de expediciones de ambas ramas; esa combinación corresponde a la integración revisada del equipo.

## Criterios comprobados por Playwright

1. El adaptador original de HU-29 guarda y lee las plantillas de la cuenta activa.
2. Una recarga offline mantiene el ámbito y esas plantillas.
3. Se rechazan propietario ajeno, sobres corruptos, esquema incorrecto, claves arbitrarias y rutas API. Se conserva el filtrado de `plantillasDesdeSobre`.
4. Logout elimina plantillas/borradores y la cuenta B solo recupera sus propios datos, también tras recarga offline.
5. Una escritura pendiente de HU-29 no vuelve a poblar caché/fallback tras logout.
6. Las nueve pruebas anteriores siguen verificando API médica/contactos/expediciones/rescate sin persistencia, expiración, operaciones tardías y funcionamiento offline autorizado.
7. Un worker en espera no recarga ni cambia un formulario abierto. El escenario de actualización anterior acepta explícitamente la nueva versión antes de comprobar su política de privacidad.

Informe HTML: `frontend/test-results/privacidad-report/index.html`. Inventarios, capturas y trazas se guardan en `frontend/test-results/privacidad/` y se adjuntan por CI. La [guía del fix](67-service-worker-privacidad.md) enlaza las capturas reales de DevTools seleccionadas.

## Reproducción de los comandos independientes

Desde la raíz, con Node 22:

```powershell
npm.cmd ci --prefix frontend
npm.cmd ci --prefix backend
npm.cmd run typecheck --prefix backend
npm.cmd test --prefix backend
npm.cmd run build --prefix backend
npm.cmd run typecheck --prefix frontend
npm.cmd run typecheck:tests --prefix frontend
$env:VITE_API_URL = '/api'
npm.cmd run build --prefix frontend
npm.cmd run test:pwa:privacidad --prefix frontend
```

En Windows se aprovecha Edge. En Linux, instalar Chromium para Playwright como indica CI. Para repetir la comprobación de compatibilidad por HTTPS, sin cambiar ramas y sin SQL:

```powershell
npm.cmd run test:compatibilidad:hu29-hu30 --prefix frontend
```

Cuando HU-30 ya esté integrada en la rama que el equipo prepare, ejecutar allí `npm.cmd run test:equipo --prefix frontend`, además de `test:pwa:privacidad`. No ejecutar `test:equipo` en una copia sin sus archivos y presentar esa ausencia como una suite aprobada.

## Pendientes del equipo

- Andriy debe hacer commit/push en la misma rama para actualizar exclusivamente el PR #68. No se ha publicado esta revisión desde el asistente.
- Confirmar GitHub Actions del PR después del push; los resultados locales no son una ejecución remota.
- Integrar bajo revisión las rutas/pantallas y los últimos commits de HU-29/HU-30 y repetir ambas suites sobre esa combinación real.
- La integración PostgreSQL de HU-30 no se ejecuta aquí: requiere su entorno y autorización separados. Ninguna prueba omitida se presenta como aprobada.
- Obtener la revisión técnica y aprobación del equipo antes de integrar. No se hizo merge ni se registró una aprobación externa.

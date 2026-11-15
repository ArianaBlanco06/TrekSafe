# #111 / #112 — PWA, consultas y verificación publicada

Fecha: 2026-11-14. Base: `develop` `8f9c4fed0b8a798e04f7e909f1c19d82e8222d92`.
Responsable de implementación: subagente C; integración y acreditación: coordinador/PO.

## Cambios y contratos

- Un gestor en memoria comparte las consultas periódicas por **recurso, filtros y sesión**. Se usa en expedición activa/panel recordatorio, alertas de rescate/layout y consola filtrada. Mantiene el intervalo de 30 segundos y una sola lectura pendiente por recurso; un refresco solicitado durante una lectura programa una única lectura posterior y descarta el dato anterior a la actualización.
- Ocultar la pestaña aborta la lectura actual y pausa las consultas. Volver a visible refresca inmediatamente. Desmontar el último consumidor elimina temporizador, observadores y resultado en memoria. La sesión y el JWT deben seguir siendo los de la consulta para publicar su resultado. No se persisten respuestas privadas.
- Los tres servicios de lectura admiten un `AbortSignal` opcional. Se conservan rutas, JSON, autenticación JWT propia y reglas de autorización. Las operaciones de escritura y la cola HU-49 no se convierten en polling.
- El login conserva el destino local de una ruta protegida, dentro del rol autenticado. Se rechazan URL externa, `//`, otro rol, traversal, codificación de ruta y barras invertidas. La ruta existente del enlace al incidente funciona después del login. Un logout explícito descarta el destino previo; un 401 puede conservarlo para reautenticar. Esto no reemplaza los permisos del servidor ni añade rutas de acceso médico.
- Se conservan HU-49 (revisión expresa, UUID estable y comprobación del mismo comando ante respuesta incierta), HU-50, `NetworkOnly`, limpieza al salir y la política de actualización PWA sin descartar formularios.

## Medición local controlada antes/después

Se ejecutó el **mismo fixture y los dos componentes reales** `AnfitrionRecordatorioSenderista` y `PaginaExpedicionActiva`, con una respuesta vacía idéntica de `fetch`, temporizadores simulados e intervalos de 30 segundos. Se midieron cinco minutos visibles (incluida carga inicial), cinco minutos ocultos y el regreso a visible. No son cinco minutos de tráfico real ni mediciones del entorno publicado.

| Escenario | Base antes de modificar consumidores | Después |
|---|---:|---:|
| Solicitudes en 5 min visibles, incluida carga inicial | 22 | 11 |
| Solicitudes adicionales en 5 min ocultos | 20 | 0 |
| Solicitudes inmediatas al volver a visible | 0 | 1 |

Resultado del fixture: 50% menos solicitudes visibles para esos dos consumidores y ninguna consulta periódica oculta. No se extrapola al total de la aplicación, a tiempos de respuesta o a consumo de recursos remotos. El baseline se capturó antes de cambiar los consumidores; los logs están en `.local-evidence/polling-baseline.log` y `polling-final.log` del worktree de C.

Reproducir el resultado actual: `npm --prefix frontend run test:medicion:polling`.
La variable `TREKSAFE_MEDICION_BASELINE=1` solo se usa para comparar con el código base; no debe usarse para acreditar el código nuevo.

El build final mide aproximadamente **472,34 kB / 130,43 kB gzip** para el bundle principal y mantiene los mapas en chunks separados (Leaflet compartido aproximadamente 162,39 kB / 51,11 kB gzip). Es tamaño del build local, no tiempo de carga inicial ni comparativa equivalente antes/después. Queda por medir en las URLs publicadas, con red, navegador y datos constantes: solicitudes/endpoint, carga inicial, bytes transferidos y tiempos antes/después, tres repeticiones visibles/ocultas/retorno.

## Verificación local

Node 22.23.4; dependencias copiadas de una instalación existente del mismo lockfile; sin cargar credenciales ni conectar servicios remotos. La compilación usa Vite 6.4.3 y PWA 0.21.2 resueltos por el lockfile.

| Verificación | Resultado |
|---|---|
| `test:equipo` | 303 aprobadas, 2 integraciones SQL condicionales omitidas; ninguna fallida |
| Tipos frontend y build | Aprobados |
| Tipos de pruebas y UI | Aprobados |
| Gestor de consultas | 7 casos: compartir, lectura lenta/refresco, pausa/aborto, sesión, filtros/limpieza, recuperación de red, cancelación idempotente |
| Retorno tras login | 5 casos entre prueba de función y flujo React: ruta protegida→login→incidente, logout descarta destino, rol ajeno y externo rechazados |
| Medición controlada | 1 prueba aprobada; 11 / 0 / 1 solicitudes |
| Validador de destino publicado | 6 pruebas aprobadas; ausencias, destinos inválidos, SHA, modo lectura, opt-ins/cuentas y manifiesto ausente |
| UI HU-32 | 13 aprobadas, navegador Edge real y servidor local |
| PWA con SW activo y fixtures locales | 32 aprobadas en Edge, 43,4 s; `.local-evidence/frontend-pwa-final.log` |

Los grupos anteriores se superponen; no se suman como casos únicos. Las pruebas SQL omitidas no cuentan como aprobadas. Los casos PWA usan el Service Worker del build y datos ficticios locales; no acreditan el dominio publicado.

Se corrigieron dos regresiones detectadas durante esta validación: un consumidor nuevo que reutilizaba el resultado compartido debía terminar su estado de carga; un logout explícito debía descartar el destino protegido anterior al incorporar el retorno postlogin. Sus regresiones están cubiertas.

Las pruebas de navegador necesitan acceso HTTP a loopback. La ejecución restringida no pudo completar su comprobación de servidor; al permitir la ejecución local del navegador/servidor sí se ejecutaron. Para evitar colisiones se admiten `TREKSAFE_TEST_UI_PORT` y `TREKSAFE_TEST_PWA_PORT` (defaults 4173/4174); C usó 5283/5284. No reutilizar ni detener servidores ajenos.

## Runner publicado: contrato compartido con el roadmap

`frontend/tests/publicado/configuracion.ts` exporta `leerConfiguracionPublicada(env = process.env)` y `ConfiguracionPublicada`. La configuración de Playwright independiente es `frontend/playwright.publicado.config.ts`: **no inicia servidor local ni instala mocks**; permite el SW real, verifica TLS y desactiva traces, capturas y vídeo para evitar conservar credenciales o respuestas privadas. Los resultados solo incluyen metadatos de entorno, URLs, commit/esquema declarados y alcance.

Usar un manifiesto JSON sin credenciales:

```json
{
  "entorno": "academico",
  "frontendUrl": "https://<dominio-publico>",
  "apiUrl": "https://<dominio-api-publico>/api",
  "commit": "<SHA completo de 40 caracteres>",
  "esquema": "<identificador del registro aplicado>"
}
```

Los marcadores anteriores son deliberadamente inválidos: completar los valores reales. Faltantes, HTTP, localhost/IP, URLs con credenciales/consulta y commit corto producen un error de arranque, **sin pruebas verdes por omisión**. La validación del nombre es sintáctica; el PO debe identificar la cuenta y los recursos de destino antes de ejecutar. Declarar el commit/esquema en el manifiesto no demuestra que estén publicados: el agente de infraestructura debe aportar la imagen/despliegue y el registro correspondientes.

Variables admitidas:

| Variable | Uso |
|---|---|
| `TREKSAFE_PUBLICADO_MANIFIESTO` | Ruta al manifiesto JSON |
| `TREKSAFE_PUBLICADO_ENTORNO` | Override de `entorno`, debe ser `academico` |
| `TREKSAFE_PUBLICADO_FRONTEND_URL` / `TREKSAFE_PUBLICADO_API_URL` | Overrides de URLs |
| `TREKSAFE_PUBLICADO_COMMIT` / `TREKSAFE_PUBLICADO_ESQUEMA` | Overrides de identificación de versión |
| `TREKSAFE_PUBLICADO_PERMITIR_ESCRITURAS=1` | Opt-in de pruebas autenticadas; incluso login hace un POST |
| `TREKSAFE_PUBLICADO_CUENTAS_FICTICIAS=1` | Confirma que se usan cuentas y datos de prueba |
| `TREKSAFE_PUBLICADO_SENDERISTA_A_CORREO` / `..._CLAVE` | Credenciales ficticias A, solo entorno de proceso |
| `TREKSAFE_PUBLICADO_SENDERISTA_B_CORREO` / `..._CLAVE` | Credenciales ficticias B distinta de A |
| `TREKSAFE_PUBLICADO_RESCATISTA_CORREO` / `..._CLAVE` | Credenciales del rescatista de prueba |

No poner claves en el manifiesto, comandos compartidos, PR ni capturas. Proporcionarlas mediante el almacén/entorno autorizado del ejecutor; el runner no las imprime ni las guarda como estado de autenticación.

La revisión final reprodujo un timeout de `locator.fill` que incluía su valor en el error de Playwright, incluso con las trazas apagadas. Se corrigió el helper de acceso para emitir un error genérico sin causa ni valores; un reporter específico guarda únicamente resultado, título y duración, omitiendo errores, pasos, adjuntos y salida cruda. El ejecutor deshabilita DEBUG/PWDEBUG y la captura automática de contexto de página; `preserveOutput=never` descarta la salida por prueba. No sustituir este reporter por list/JSON/HTML estándar al usar credenciales. El JSON resumido conserva los fallos como fallos; localizar el caso por su título y repetirlo en un entorno controlado para diagnosticarlo. La comprobación `test:publicado:config` incluye ahora ocho pruebas: seis de configuración y dos de privacidad del error/reporte. Se verificó también el timeout real con Edge y un campo de contraseña ficticio deshabilitado, sin valores privados en el error resultante.

1. `npm --prefix frontend run test:publicado:lectura`: dos comprobaciones públicas sin login/escrituras: salud HTTP JSON y ruta SPA/login con SW activo. El nombre del proyecto y metadatos dicen **SOLO SMOKE, SIN ACEPTACIÓN**. Un resultado aprobado no valida DB, worker, correo, HU-50 ni flujos privados.
2. `npm --prefix frontend run test:publicado`: requiere los dos opt-ins y las tres cuentas. Incluye las comprobaciones públicas y una prueba autenticada parcial: A→logout→B, lectura privada por la API de destino, ausencia de caché API, ausencia de fallback privado sin red y acceso de rescatista a consola. No crea expediciones, incidentes ni envía correo. Las cuentas deben existir previamente y no son cuentas de uso personal.
3. Completar la matriz integral del coordinador/QA con las 25 HU, regresión R1 pertinente, autorización médica, relevo/cierre, concurrencia, fallos, recepción real de correo y recuperación. Estos tres smoke tests no sustituyen esa matriz.

En esta entrega solo se ejecutaron localmente el validador, el fallo esperado sin destino y `--list` con dominios ficticios para confirmar dos pruebas de lectura. **No se ejecutó ningún smoke contra URLs remotas, ningún login remoto ni correo.**

## Puerta de cierre

La parte local de C queda lista para revisión e integración. #111 requiere todavía la medición y la regresión sobre las URLs públicas identificadas. #112 requiere además la matriz integral completa, evidencia de recepción y recuperación, ausencia de bloqueantes y aceptación explícita del PO sobre la versión final. Mantener como pendiente/no ejecutado todo lo que no tenga esa evidencia; no cerrar issues solo por este dossier o por CI.

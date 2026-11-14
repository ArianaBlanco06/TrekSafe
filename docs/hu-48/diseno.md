# HU-48 · Exportar un reporte operativo en CSV

Responsable: John. Issue [#50](https://github.com/ArianaBlanco06/TrekSafe/issues/50).
Rama `feat/hu-48-exportar-csv`, creada y actualizada por John.
Base inicial: `4c40cc69b87aa43b9d49f2cf9c8818b9e7848b92`, con HU-47 integrada
mediante el PR #134. En la fase 4, `develop` remoto ya estaba en `a860fa8`, con
HU-50 y sus registros integrados; John debe incorporar esa base antes del PR.

## Alcance

El CSV contendrá incidentes individuales que cumplan los filtros aplicados en
HU-47: rango de días en UTC, apertura/cierre, destino y resultado del rescate.
El alcance sigue siendo global para cualquier rescatista con perfil validado.
Se exportan seis campos mínimos, sin nombres, ficha médica, contactos ni resumen
de cierre. Los incidentes cerrados históricos sin informe conservan resultado vacío.

| Criterio | Implementación prevista | Estado actual |
| --- | --- | --- |
| CA-01 · Mismo filtro, datos mínimos | Reutilizar filtros/autorización de HU-47 y lista blanca de seis campos | Integración local real aprobada; prueba compartida en DEV pendiente |
| CA-02 · Recorrido paginado | Iterator por cursor de id, sin desplazamientos ni repetición de filas | Probado con lector simulado y con 1.205 filas SQL reales en siete páginas |
| CA-03 · Archivo seguro y fiel | UTF-8, encabezados estables, escape de comillas y neutralización de fórmulas | Descarga real de 1.205 filas y muestra de caracteres aprobadas por API/SDK/PostgREST/navegador; apertura en la hoja del equipo pendiente |

## Contratos y SOLID

- `ILectorPaginasReporteIncidentes` pertenece a la familia DAO del reporte de
  HU-47. Expone solo lectura paginada. La interfaz de conteos
  `IReporteIncidentesDAO` permanece segregada; el adaptador de producción podrá
  implementar ambos contratos sin obligar a quien solo consulta conteos a recorrer filas.
- `IncidenteReporte` declara únicamente `id`, `zona`, `abiertoEn`, `cerradoEn`,
  `estado` y `resultado`. Estado y resultado reutilizan los tipos del dominio existente.
- `IteradorIncidentesReporte` implementa `AsyncIterable<IncidenteReporte>`.
  Depende de la interfaz de páginas, no de Supabase. Pide una página al necesitarla
  y mantiene solo su contenido y un cursor.
- `ExportadorCsv` recibe cualquier `AsyncIterable<IncidenteReporte>` y emite
  fragmentos de texto. No conoce HTTP, autenticación ni adaptadores de persistencia.
- La composición concreta y la autorización HTTP se conectarán en la fase de backend.

Se aplican Iterator y DAO, con SRP, ISP y DIP. La responsabilidad de consultar,
recorrer, serializar, adaptar HTTP y descargar en navegador permanece separada.

## Recorrido

Orden ascendente por `incidentes.id`, UUID canónico en minúsculas. La primera
página usa `despuesDe = null`; las siguientes usan el último id emitido como
cursor exclusivo. Cada consulta devuelve como máximo el tamaño solicitado y
determina `hayMas` leyendo una fila adicional.

Tamaño inicial: 200 filas; límite del contrato de aplicación: 500 por página.
Mil incidentes se recorren en cinco páginas de 200. Se cuentan incidentes,
incluidos dos que compartan expedición. No se unen notas ni relevos que puedan
multiplicar filas.

El Iterator rechaza ids repetidos o desordenados, páginas demasiado grandes,
ids no canónicos y páginas vacías con `hayMas = true`. Cada recorrido conserva
su propio cursor. Cancelar el consumo impide solicitar otra página. Un fallo
o rechazo de autorización posterior se propaga y debe interrumpir la descarga.

El lector de persistencia deberá aplicar los mismos filtros y comprobar el
perfil validado del actor de la sesión del servidor en cada página. El orden
estable evita duplicados por desplazamiento. Este contrato no representa una
instantánea histórica congelada: la exportación realiza una nueva lectura con
los filtros aplicados y puede reflejar cambios posteriores a la consulta visual.

## CSV

Encabezados, en este orden:

```text
id,zona,fecha_apertura,fecha_cierre,estado,resultado
```

- UTF-8 con BOM al comienzo, separador coma y terminación de fila CRLF.
- Todas las celdas se encierran entre comillas dobles. Una comilla dentro del
  valor se duplica. Se conservan acentos, comas y saltos internos.
- Cierre o resultado nulos se representan como celdas vacías.
- El exportador construye explícitamente los seis valores; campos adicionales
  recibidos en ejecución no se serializan.
- Si el primer carácter significativo puede iniciar una fórmula (`=`, `+`, `-`,
  `@` o sus variantes de ancho completo), se antepone una tabulación dentro de
  la celda entrecomillada. Se consideran espacios y controles anteriores al prefijo.
  El texto original se conserva detrás de esa protección.
- La tabulación protectora forma parte del dato subyacente para un importador
  programático. Las pruebas comprueban su representación; no ejecutan Excel.

Referencias de formato y protección:
[RFC 4180](https://www.rfc-editor.org/rfc/rfc4180) y
[OWASP CSV Injection](https://owasp.org/www-community/attacks/CSV_Injection).
La protección elegida se orienta a la apertura en Excel, conforme a la recomendación
de tabulación dentro de la celda entrecomillada. El comportamiento en otras hojas
y al guardar/reabrir depende del programa; la aceptación funcional sigue pendiente.

## Validación de esta fase

18 pruebas aprobadas y TypeScript completo del backend sin errores.

- 1.000 incidentes en cinco páginas, orden e ids completos y únicos.
- Actor y filtros reutilizados en cada solicitud, conjunto vacío y cursores independientes.
- Cancelación sin precarga de la siguiente página, fallo de persistencia y pérdida
  de autorización entre páginas.
- Rechazo de duplicados, retrocesos, ids no canónicos y respuestas de página inválidas.
- Encabezados, seis columnas, nulos, UTF-8, comas, comillas, acentos y saltos internos.
- Prefijos de fórmula, espacios/controles anteriores y variantes de ancho completo.
- Exclusión de campos adicionales sensibles y propagación de errores del recorrido.

Comando, desde `backend` con Node 22:

```powershell
node --import tsx --test src/application/iterators/IteradorIncidentesReporte.test.ts src/application/services/ExportadorCsv.test.ts
```

El lector de las pruebas de esta primera fase es simulado. La fase 2 añade
persistencia SQL real y el endpoint; la fase 3 incorpora el botón y la descarga
en navegador. No se realizaron acciones de Git/GitHub.

## Fases siguientes

1. Backend. Completado en la fase 2 descrita abajo. La migración propuesta 031
   queda pendiente de coordinación para DEV; la 029 aplicada se conserva.
2. Frontend. Completado en la fase 3 descrita abajo, con filtros aplicados,
   descarga, error/reintento, cancelación y protección de sesión.
3. Integración. Completada localmente en la fase 4, con persistencia y PostgREST
   reales, 1.205 incidentes, permisos, fallos y worker activo.
4. Entrega. Evidencia y texto de PR preparados. Quedan actualización de rama,
   coordinación/aplicación de 031, prueba en DEV, CI y validación de Marko.

## Fase 2 · Persistencia y endpoint

Se implementó `GET /api/rescate/estadisticas.csv`, con exactamente los mismos
parámetros de HU-47: `fechaDesde`, `fechaHasta`, `criterioFecha`, `zona` y
`resultado`. La identidad se obtiene del JWT. Las claves adicionales, incluidos
cursor, tamaño de página o actor, se rechazan. El recorrido completo lo administra
el backend, con páginas internas de 200 filas.

`prepararConsultaReporteIncidentes` centraliza la validación de actor y filtros
para ambos casos de uso. `ReporteIncidentesDAOSupabase` implementa las dos
interfaces segregadas: conteos y páginas. El nuevo método normaliza fechas a
ISO UTC, valida la forma de la respuesta y devuelve solo los seis campos
permitidos. Los errores de RPC y permisos comparten la traducción de HU-47.

`ExportarReporteIncidentes` depende del lector de páginas y del puerto
`IExportadorIncidentes`. Lee la primera página y comprueba su forma antes de
devolver el recurso de descarga, incluso si el resultado está vacío. El
controlador utiliza `Readable` y `pipeline` para emitir los fragmentos con
contrapresión. La composición concreta se mantiene en infraestructura.

### Respuesta HTTP

```http
GET /api/rescate/estadisticas.csv?fechaDesde=2026-11-01&fechaHasta=2026-11-13&criterioFecha=apertura
Authorization: Bearer <token de TrekSafe>
```

Una respuesta correcta utiliza:

```http
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="incidentes-apertura-2026-11-01_2026-11-13.csv"
Cache-Control: no-store
X-Content-Type-Options: nosniff
```

El nombre utiliza únicamente fechas y criterio validados. No incorpora textos
de destino ni otros valores libres. Un conjunto vacío produce BOM y encabezados.

Sin token se responde 401; rol senderista o perfil no validado, 403; filtros
inválidos, 400. Un fallo de la primera página devuelve JSON 500 sin cabecera de
archivo. Si una página posterior falla o pierde autorización, la respuesta se
interrumpe. El cliente debe consumir el cuerpo completo antes de guardar y
rechazar un cuerpo truncado. Cancelar el consumo cierra el Iterator e impide
continuar solicitando páginas.

### Migración propuesta 031

Se preparó `031_hu48_exportacion_incidentes.sql`. Durante esta fase se comprobó
en GitHub que `030_hu50_ficha_medica_responsable.sql` ya existe en `develop`.
Por eso no se utilizó 030. La numeración 031 sigue propuesta y necesita
coordinación con Sebastian/Ariana antes de aplicar en DEV.

La RPC `treksafe_leer_pagina_incidentes_reporte` requiere 029 con sus dependencias.
Utiliza `SECURITY INVOKER`, `STABLE` y `search_path` vacío; revoca ejecución de
`PUBLIC`, `anon` y `authenticated`, y la concede solo a `service_role`. Revalida
rol persistido y perfil en cada página. No cambia permisos de tablas ni el
SQL de 029. Tampoco consulta campos médicos o contactos.

La consulta ordena por id, aplica un cursor exclusivo y limita candidatos a
`p_limite + 1`, con máximo 500 filas de salida por página. Devuelve un objeto
JSON con la colección y `hayMas`, sin depender del límite de filas de PostgREST.
El informe se une opcionalmente por su relación única; no se unen notas/relevos.
Los criterios de fechas, zona literal y resultado coinciden con 029 y su
equivalencia se comprueba con conteos reales.

El archivo es transaccional, registra 031 solo si existe `treksafe_migraciones`
con `ON CONFLICT DO NOTHING`, y rechaza una versión ya registrada. No es
re-ejecutable. Esta implementación no lo aplicó en Supabase DEV.

### Verificación de la fase 2

- Backend completo: 1.068 pruebas aprobadas, cero fallos. Las suites PostgreSQL
  condicionadas a sus propios entornos no se activaron en esa ejecución.
- TypeScript y compilación del backend aprobados.
- Se agregaron 18 pruebas de caso de uso, adaptador paginado y HTTP, más la
  comprobación de privacidad de la nueva ruta. Se conservaron las 18 de la fase 1.
- El HTTP con lector simulado descargó 1.000 filas y verificó BOM, acentos,
  encabezados de descarga, identidad del JWT, cinco páginas y errores 400/403/500.
  Un fallo posterior hizo rechazar la lectura del cuerpo en vez de completar un CSV.
- PostgreSQL 18 real desechable: 21 comprobaciones aprobadas, 13 heredadas de
  HU-47 y 8 específicas de HU-48. Incluyen 1.205 filas en siete páginas, equivalencia
  con HU-47 para filtros y catálogo completo, ids globales iguales entre actores,
  históricos sin informe, autorización entre páginas, permisos, `READ ONLY` y registro.

Comando SQL desde la raíz, con Node 22 y PostgreSQL nativo:

```powershell
node backend/scripts/test-hu48-postgres.mjs --pg-bin "C:\Program Files\PostgreSQL\18\bin"
```

El runner reutiliza la preparación y fixtures de HU-47, crea
`treksafe_hu48_desechable` en loopback y aplica las migraciones de sus dependencias
solo allí. No carga `.env`, no usa Supabase, no modifica el servicio PostgreSQL
instalado y detiene su propia instancia al finalizar. Conserva logs en la
carpeta temporal que imprime. No se ejecutó todavía el recorrido completo
CSV por SDK/PostgREST real y navegador; corresponde a la fase de integración.

La rama local todavía parte de `4c40cc6`. Antes del PR, John debe incorporar
el `develop` actualizado que contiene HU-50 y resolver cualquier conflicto de
composición o rutas. En esta fase no se realizaron operaciones Git ni se
modificó el archivo de evidencia de HU-47 que John tenía editado.

## Fase 3 · Descarga desde la pantalla

`DescargaCsvReporte` incorpora el botón «Descargar CSV» debajo del resumen de
estadísticas. Recibe el reporte ya aplicado y no lee los campos editables del
formulario. El botón se muestra también para conjuntos vacíos, cuyo CSV válido
contiene solo encabezados. Se bloquea mientras se actualizan las estadísticas,
cuando la consulta está en error, durante otra descarga o sin conexión.

`useDescargaCsvReporte` administra el estado de descarga, los errores/reintentos
y su cancelación. Conserva el reporte, token y ámbito de sesión al iniciar.
Cambiar el reporte, actualizar las estadísticas, desmontar la pantalla o quedar
offline aborta la solicitud. Una respuesta tardía de otro reporte o sesión se
descarta antes de crear el archivo. Reconectar no inicia descargas automáticamente.

`descargarCsvEstadisticas` reutiliza el constructor de parámetros del servicio
HU-47. El cliente API comparte autenticación, rechazo de errores y comprobación
de ámbito entre JSON y archivos. La lectura binaria espera el cuerpo completo,
comprueba nuevamente la sesión y respeta la señal de cancelación. El servicio
rechaza un cuerpo vacío o de tipo distinto de `text/csv`.

`guardarArchivoDescargado` se ocupa únicamente de solicitar el guardado mediante
un enlace temporal y un Blob ya completo. Retira el enlace y libera el objeto
URL después de un segundo. El nombre usa el criterio y fechas del reporte;
no incorpora textos libres. El mensaje «Descarga solicitada» no promete que el
usuario haya guardado el archivo: esa decisión queda en el navegador.

Se conservan SRP y DIP entre transporte, servicio del reporte, estado de interfaz,
presentación y mecanismo de guardado. El hook de conectividad existente admite
también ejecución sin `window` en las pruebas y considera offline solo cuando
`navigator.onLine` sea explícitamente falso.

### Verificación de la fase 3

- 17 nuevas pruebas frontend: transporte binario, servicio CSV, descarga temporal,
  componente y conexión con los filtros aplicados de la página.
- Suite completa: 277 aprobadas, 2 omitidas por depender de entornos propios,
  cero fallos. Se conservan las pruebas de JSON, sesión y HU-47.
- TypeScript de aplicación y configuraciones de pruebas/Playwright aprobado.
- Build PWA aprobado.
- Suite completa de privacidad con worker activo: 32 aprobadas, incluidas dos
  nuevas de HU-48. Se descargaron 1.000 filas mediante el guardado real del navegador.
- CSV con BOM, acentos y comillas, filtros sin aplicar ignorados al exportar,
  cuerpo HTTP interrumpido sin ofrecer archivo y reintento del mismo filtro.
- Offline bloquea el botón y reconectar no reintenta. Cache Storage no conserva
  respuestas CSV. Pantalla de 320 px sin desbordamiento horizontal.

[Evidencia del frontend y captura](../evidencias/hu-48-frontend/evidencia.md).
En estas pruebas de navegador la API es ficticia y local. El build, el Service
Worker y el mecanismo de descarga son reales. La comprobación del CSV por API
de producción, SDK Supabase, PostgREST y PostgreSQL real sigue en la fase 4.
No se aplicaron migraciones en DEV ni se realizaron acciones de Git/GitHub.

## Fase 4 · Integración completa y entrega preparada

`test-hu48-postgres.mjs --with-browser --postgrest <binario>` añade el recorrido
real a las 21 comprobaciones SQL. Reutiliza el arranque de servicios de HU-47
sin modificar su evidencia. `hu48-flujo-completo.mjs` reúne los escenarios CSV
y escribe únicamente en `docs/evidencias/hu-48-local`.

Se usaron API, casos de uso, DAO y SDK de producción, PostgREST 16.5 nativo,
PostgreSQL 18 desechable y build PWA real en Edge. El proxy HTTP solo adapta
el prefijo del SDK y propaga cuerpos interrumpidos. Su observador comprueba
los parámetros de cada página sin reemplazar respuestas.

### Verificación de la fase 4

- 21 comprobaciones SQL aprobadas y 11 escenarios completos aprobados.
- 1.205 ids exportados en siete solicitudes de página; cursores y actor
  comprobados y lista comparada con una consulta SQL independiente.
- CSV del navegador idéntico byte a byte al de la API, incluido BOM.
- Filtros de apertura/cierre, destino literal y catálogo de resultados coinciden
  con HU-47. Dos rescatistas validados obtienen el mismo alcance global.
- Siete fixtures separadas del día de volumen verifican comillas, comas, acentos,
  saltos internos y prefijos ASCII/ancho completo de fórmula.
- Errores 401/403/400 reales sin cabecera de descarga. Una excepción SQL inicial
  devuelve JSON 500; una excepción SQL posterior interrumpe el cuerpo sin ofrecer
  archivo, y restaurar la función permite el reintento completo.
- Cancelación al actualizar un reporte durante una lectura SQL demorada, sin
  descarga tardía. Offline bloquea; reconectar no descarga automáticamente.
- Worker activo sin respuestas CSV en Cache Storage, vista de 320 px correcta,
  sin errores JavaScript ni cambios en las filas por las consultas.

Las excepciones/demoras se inyectan solo en la función de la base desechable y
se restaura su definición original después de cada escenario. No se aplicó
esa inyección ni ninguna migración en DEV. Todos los servicios se detuvieron.

[Evidencia completa, capturas y archivos CSV](../evidencias/hu-48-local/evidencia.md).
La apertura en Excel/LibreOffice no se comprobó automáticamente; queda incluida
en la validación funcional de Marko. Se incorporó la suite SQL de HU-48 al job
de backend del workflow; el CI remoto queda pendiente de publicar los cambios.

### Estado compartido y siguientes acciones de John

Se comprobó en solo lectura el proyecto DEV `ibnwggvqgjpeqcretjak`. Respondió
200, con 029 y 030 registradas y sin registro de 031. El `develop` remoto
consultado estaba en `a860fa8`, mientras la rama local seguía en `4c40cc6`.
No se realizaron fetch, merge, commits, push ni publicaciones.

John debe guardar los cambios y actualizar su rama con `develop` antes del PR,
revalidar cualquier conflicto de composición/rutas, confirmar la numeración y
coordinar la aplicación de 031 con Sebastian/Ariana. Después corresponde la
[prueba compartida de DEV](validacion-dev.md), aceptación de Marko y revisión.
El [texto del PR](pr.md) incluye `Closes #50` y pendientes explícitos.

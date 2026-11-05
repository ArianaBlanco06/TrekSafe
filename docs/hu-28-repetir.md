# HU-28: repetir una expedición del historial

## Primera entrega: contrato y reglas

La primera entrega de `feat/hu-28-repetir` incorporó el núcleo del Factory Method.
La segunda añade las consultas de Supabase y la API que se describen más abajo.
El borrador no es una expedición guardada: la creación posterior asigna un id
nuevo y valida las fechas y los contactos al confirmar. La tercera entrega conecta
el historial con el formulario, como se describe más abajo.

Se reutilizan sin cambios `CreadorPlan`, `IPlanEditable`, `IContactosVigentes` y
`verificarContratoCreadorPlan` de la referencia local de HU-29
`origin/feat/hu-29-plantillas`, commit `c1c68c1`. Al integrar ambas historias deben
conservarse estos archivos comunes, junto con las pruebas de los dos creadores.

`CreadorDesdeHistorial` consulta mediante `IHistorialExpedicionesDAO` y acepta
únicamente expediciones completadas del propietario. Los orígenes ajenos,
inexistentes o de otros estados devuelven el mismo error 404. Su producto
`PlanDesdeHistorial` implementa `IPlanEditable`, conserva ruta, coordenadas,
tolerancia y sugerencias de contactos y acompañantes, y no retiene referencias
mutables a los datos originales.

La operación común `prepararBorrador` deja las fechas vacías, revalida los contactos
vigentes, elimina sugerencias duplicadas y devuelve únicamente los campos
permitidos. Se conservan como sugerencias para revisión, no como una autorización
de guardado. Las alertas, los datos médicos, la confirmación, el estado y el id de
la expedición original no se trasladan al nuevo plan. `origenId` identifica solo
la procedencia del borrador.

## Responsabilidades y SOLID

| Componente | Responsabilidad |
| --- | --- |
| `IHistorialExpedicionesDAO` | Leer los datos reutilizables de un origen propio. |
| `CreadorDesdeHistorial` | Comprobar propietario y estado y construir el producto. |
| `PlanDesdeHistorial` | Representar una copia inmutable de los datos reutilizables. |
| `CreadorPlan` | Aplicar las reglas comunes de preparación del borrador. |
| `IContactosVigentes` | Comprobar cuáles de los contactos sugeridos siguen disponibles. |

Se separan las consultas de las escrituras (ISP); los colaboradores se reciben
mediante interfaces (DIP). La variante de historial amplía el creador compartido
sin cambiar la variante de plantilla (OCP). La misma suite de contrato comprueba
las invariantes del creador (LSP), y cada componente tiene una responsabilidad
acotada (SRP).

```mermaid
classDiagram
    CreadorPlan <|-- CreadorDesdeHistorial
    CreadorPlan <|-- CreadorDesdePlantilla
    IPlanEditable <|.. PlanDesdeHistorial
    IPlanEditable <|.. PlanDesdePlantilla
    CreadorDesdeHistorial ..> IHistorialExpedicionesDAO
    CreadorDesdeHistorial ..> PlanDesdeHistorial
    CreadorDesdePlantilla ..> PlanDesdePlantilla
    CreadorPlan ..> IContactosVigentes
    CreadorPlan ..> IPlanEditable
```

Los componentes de plantilla del diagrama pertenecen a HU-29 y no se incorporan
a esta rama en esta entrega.

## Verificación de la primera entrega

El 4 de noviembre de 2026, con Node 22.23.4, pasaron las 15 pruebas nuevas de
historial, el typecheck, el build y las 141 pruebas de la suite ordinaria del
backend. La suite PostgreSQL de HU-30 permanece condicionada a su entorno local
desechable y no se ejecutó en esta comprobación.

También se reunieron en una carpeta temporal los archivos comunes de esta rama y
el creador, producto, consultas en memoria y pruebas originales de HU-29 en
`c1c68c1`. Pasaron las 23 pruebas de ambos creadores: 15 de historial y 8 de
plantilla. Esta comprobación acredita la compatibilidad unitaria de esas versiones
del Factory Method, no la integración de las pantallas ni las API de ambas HU.

Desde la raíz, para reproducir la comprobación ordinaria:

```powershell
npm.cmd run typecheck --prefix backend
npm.cmd test --prefix backend
npm.cmd run build --prefix backend
```

## Segunda entrega: consultas y API

La API autenticada expone `GET /api/expediciones/:id/borrador`, usando el prefijo
configurado para el backend. Requiere el JWT propio de TrekSafe y rol `senderista`.
El propietario se obtiene del token; ningún parámetro de query sustituye esa
identidad. Devuelve `200` con `{ borrador }`, siguiendo el mismo formato de HU-29.

| Resultado | Código HTTP |
| --- | --- |
| Borrador de una expedición propia completada | `200` |
| UUID mal formado | `400` |
| Sesión ausente, inválida o expirada | `401` |
| Rol distinto de senderista | `403` |
| Origen ajeno, inexistente o no completado | `404` |
| Fallo de consulta de historial o contactos | `500`, sin entregar un borrador parcial |

`HistorialExpedicionesDAOSupabase` recibe el cliente y aplica filtros de id,
propietario y estado en la consulta. Selecciona solo los datos reutilizables y los
identificadores de contactos y nombres de acompañantes. No consulta fechas
antiguas, datos médicos, alertas ni confirmaciones.

Para los contactos se reutiliza sin cambios `DAOContactosVigentesSupabase` de la
misma referencia `c1c68c1` de HU-29, además de los cuatro archivos comunes de la
primera entrega. Solo recupera identificadores que siguen perteneciendo al
senderista y mantiene el orden de las sugerencias. La escritura definitiva deberá
volver a validar los contactos, porque pueden cambiar después de preparar el borrador.

El controlador valida el UUID y coordina la respuesta; el router aplica sesión y
rol únicamente a `/:id/borrador`. Las otras rutas de expediciones mantienen su
comportamiento. `app.ts` conecta las implementaciones concretas con el creador y
monta el router. La política global `Cache-Control: no-store` y las reglas
NetworkOnly de la PWA cubren esta ruta privada.

Esta fase usa tablas existentes y no requiere migraciones. Solicitar un borrador
es una lectura: no crea ni modifica expediciones, ni inicia el cron o el correo
durante las pruebas.

Las pruebas del adaptador usan el SDK real de Supabase con transporte HTTP
sustituido; comprueban la selección, filtros, mapeo y errores. Las pruebas de API
usan Express y JWT reales con consultas sustitutas, y verifican permisos,
aislamiento, UUID, fechas vacías, revalidación de contactos y ausencia de
escrituras. La prueba global de privacidad incluye también el rechazo sin sesión
de la ruta nueva. Estas comprobaciones no acreditan PostgREST ni Supabase DEV.

El 4 de noviembre de 2026, con Node 22.23.4, pasaron las 19 pruebas nuevas de API
y consultas, la nueva comprobación de privacidad y las 161 pruebas de la suite
ordinaria del backend, junto con el typecheck y el build. La suite PostgreSQL
condicionada de HU-30 no se ejecutó en esta fase. El frontend no cambia todavía.

## Tercera entrega: historial y formulario

El historial muestra «Repetir expedición» para cada origen completado. El enlace
abre `/senderista/expedicion/nueva?repetir=<id>`; la URL contiene únicamente el id,
no una copia del plan. Sin red se indica que es necesario conectarse para
recuperarlo.

`PrepararExpedicionDesdeHistorial` solicita el borrador mediante el cliente HTTP
autenticado y sin caché, presenta carga, error y reintento, y solo entonces monta
el formulario. La página utiliza una clave de cuenta/sesión y origen; la carga
descarta resultados tardíos al salir o cambiar de sesión. Recuperar el origen no
escribe el borrador en Web Storage ni crea una expedición.

`FormularioCrearExpedicion` reutiliza la creación existente e inicializa ruta,
coordenadas, tolerancia, acompañantes y contactos sugeridos. Ambas fechas empiezan
vacías. Se exige una salida futura y un retorno posterior. El usuario debe
confirmar que revisó los contactos; modificar su selección invalida esa
confirmación. Al cargar la lista actual de contactos se descartan las sugerencias
que ya no están disponibles. Los fallos de carga ofrecen reintento y no habilitan
la revisión si no hay contactos visibles.

La creación envía solamente los campos admitidos por `crearExpedicion`: excluye
el id y el estado originales, `origenId`, alertas, confirmaciones y datos médicos.
El backend existente asigna la nueva identidad y vuelve a validar las fechas y la
propiedad de los contactos. El formulario bloquea envíos simultáneos, conserva lo
escrito ante un fallo y permite reintentar.

Reconectar no vuelve a cargar el origen ni descarta el formulario. Se mantiene el
flujo offline existente: una vez abierto y revisado el formulario, el usuario
puede guardar expresamente un borrador de su sesión para sincronizarlo después.
Ese guardado y la plantilla local de ruta siguen usando el almacenamiento aislado
por sesión del fix de privacidad. La lectura de la API no se convierte en caché.

Las pruebas de esta entrega montan React y el router con el cliente HTTP real y
respuestas sustitutas. Sustituyen únicamente el componente de mapa para evitar
depender de un DOM en las pruebas de componentes. Comprueban el enlace, la carga,
los campos vacíos, fechas inválidas, revisión de contactos, selección eliminada,
reintentos, doble envío, reconexión, guardado offline y cambio de sesión. No
sustituyen la revisión visual ni la prueba de nueva identidad en PostgreSQL/DEV.

El 4 de noviembre de 2026, con Node 22.23.4, pasaron las 14 pruebas nuevas del
recorrido y las 37 pruebas ordinarias del frontend. El recorrido PostgreSQL de
HU-30 se omitió por no disponer de su base local desechable en esta ejecución.
También pasaron el chequeo de tipos del frontend, el chequeo de tipos de las
pruebas PWA, el build y las 12 regresiones de privacidad/PWA en Edge con el worker
real y un servidor local de datos ficticios. Para estas últimas se construyó con
`VITE_API_URL=/api` únicamente en el proceso de pruebas, sin editar los `.env`.
Estas regresiones cubren también el formulario ordinario y la sincronización
offline existentes; no comprueban el recorrido nuevo contra Supabase DEV.
El ejecutor terminó con `12 passed`; fue necesario detener su servidor temporal
después de los casos por un bloqueo del cierre automático en Windows.

```powershell
npm.cmd run test:equipo --prefix frontend
npm.cmd run typecheck --prefix frontend
npm.cmd run typecheck:tests --prefix frontend
npm.cmd run build --prefix frontend
```

## Cuarta entrega: recorrido real en DEV y evidencia

Se verificó el recorrido completo con Edge, el login y la API reales de TrekSafe
y PostgREST de Supabase DEV. El formulario creó otra expedición, se comprobó su
persistencia al recargar y se contrastaron la nueva fila y sus relaciones con el
origen. La cuenta B no pudo acceder al borrador de A. También se comprobaron los
rechazos de fechas antiguas y contactos borrados o ajenos, y la limpieza de los
datos ficticios de la prueba.

El alcance, los resultados, las cuatro capturas y los comandos están en
[hu-28-validacion.md](hu-28-validacion.md). La prueba optativa
`npm.cmd run test:hu28:dev --prefix frontend` necesita `HU28_DEV_RUN=1`; no se
ejecuta como parte de las suites ordinarias ni introduce rutas de prueba en la API.

## Pendientes para completar HU-28

1. Coordinar los puntos intermedios con su responsable. El contrato actual de
   HU-29 no tiene ese campo: esta entrega conserva el contrato existente. La copia
   de puntos disponibles sigue pendiente y debe validarse antes de aceptar el
   alcance completo. No se reemplazarán puntos existentes por una colección vacía.
2. Adjuntar la evidencia al issue y al PR de HU-28, recibir la revisión técnica y
   la aceptación del equipo, y coordinar la integración del contrato con HU-29.

Las tres primeras entregas utilizaron sustitutos; la cuarta sí acredita el
recorrido real en Supabase DEV para el alcance sin puntos intermedios. No se
declara integrada HU-29 ni aceptada la historia completa.

# Validación local de HU-30

El 1 de noviembre de 2026 se verificó la gestión de listas de equipo en Windows
con Node 22.23.4, npm 10.9.9 y PostgreSQL 18.1 local desechable. Se aprobaron
60 pruebas del backend y 20 del frontend, sin fallos ni omisiones en la ejecución
integrada. También pasaron los dos archivos de pruebas SQL, typecheck de ambos
proyectos y sus builds, incluyendo la generación de la PWA.

Esta evidencia acredita el comportamiento local. La comprobación contra Supabase
DEV y la revisión visual siguen pendientes por acuerdo con Jhon. No se declara
la HU aceptada ni Done; esa decisión corresponde a la revisión y aceptación del
equipo.

## Matriz de criterios de aceptación

La referencia funcional es HU-30 del Product Backlog de ISW2, hoja Product Backlog,
fila 41. La decisión adicional de permitir listas vacías fue confirmada por Jhon.

| Criterio o escenario | Evidencia ejecutada | Resultado local |
| --- | --- | --- |
| El propietario crea, edita y elimina listas con nombre e ítems | Prueba integrada React → cliente HTTP → Express → DAO → PostgreSQL. Conserva el id de un ítem editado, añade otro, quita el anterior y elimina la lista. | Aprobado |
| Rechazar nombres vacíos | Pruebas de dominio, servicio, API, formulario y funciones SQL con cadenas vacías, espacios y tabuladores; contrato DAO con espacios Unicode. | Aprobado |
| Conservar ítems obligatorios u opcionales | La prueba integrada crea ambos tipos y vuelve a consultarlos desde la API y PostgreSQL. | Aprobado |
| Cada usuario consulta y modifica únicamente sus listas | La prueba integrada cambia a B: el listado de A desaparece y consultar, editar o eliminar su lista devuelve 404. La lista propia de B permanece intacta cuando A elimina la suya. | Aprobado |
| Lista inicialmente vacía | Pruebas del esquema, dominio, servicio, API, formulario y creación de la lista vacía de B en el recorrido integrado. | Aprobado |
| Persistencia entre sesiones | La vista se desmonta y reconstruye con otro JWT del mismo usuario. Sus datos se recuperan por HTTP desde PostgreSQL. | Aprobado en simulación de nueva sesión React |
| Conservar datos ante entradas inválidas y carreras | Contrato DAO y SQL; dos conexiones prueban ediciones serializadas y edición contra eliminación. | Aprobado |
| Error de guardado y pérdida de conexión | React con contrato HTTP sustituido comprueba que se conserva el formulario y se puede reintentar. | Aprobado en pruebas de componentes |
| Descubrimiento de pruebas en Node 22 y Windows | Los scripts npm ejecutaron las 60 pruebas del backend y las 20 del frontend, incluyendo las suites nuevas. | Aprobado |

## Alcance del recorrido integrado

Archivo: `frontend/src/testing/hu30FlujoCompleto.integration.test.tsx`.

1. Crear dos perfiles ficticios A y B en la base temporal.
2. Montar React con el cliente HTTP de producción y una API Express local que
   utiliza el servicio y el adaptador Supabase de la aplicación.
3. Firmar un JWT de A y crear una lista con nombre acentuado, emoji e ítems
   obligatorio y opcional. Consultar sus datos por API y por SQL.
4. Reconstruir la vista con otro JWT de A; recuperar y editar la lista persistida.
5. Cambiar a B, comprobar que no ve la lista e intentar acceder directamente por
   su identificador: lectura, actualización y eliminación reciben 404.
6. Crear una lista vacía propia de B, volver a A y eliminar su lista tras aceptar
   una confirmación simulada. Comprobar que B conserva su lista.
7. Desmontar React, cerrar el servidor y eliminar las cuentas ficticias. El script
   comprueba el estado final y apaga PostgreSQL.

React se monta con `react-test-renderer`: no se abre un navegador y los eventos y
la confirmación son simulados. Las solicitudes HTTP sí llegan a Express real.
El SDK Supabase usa el puente `clienteSupabasePostgresPruebas`, que ejecuta las
funciones reales como `service_role` sobre PostgreSQL local. El puente sustituye
PostgREST; no comprueba el servicio remoto ni el login real de las cuentas.

## Reproducción

Con Node 22 activo y las dependencias de ambas carpetas instaladas desde sus
lockfiles, ejecutar desde la raíz:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File backend/scripts/test-hu30-postgres.ps1
npm.cmd run typecheck --prefix backend
npm.cmd run typecheck --prefix frontend
npm.cmd run build --prefix backend
npm.cmd run build --prefix frontend
```

El script requiere `initdb`, `pg_ctl` y `psql` en PATH. Crea una instancia nueva en
TEMP, escucha solo en loopback y no utiliza `DATABASE_URL` ni credenciales DEV.
Establece `HU30_TEST_DATABASE_URL` solo para la ejecución de ambas suites y restaura
su valor al finalizar. No inicia `main.ts`, el cron ni el envío de correo.

Sin esa variable, las pruebas ordinarias omiten las comprobaciones PostgreSQL y
el recorrido integrado. Un resultado de las pruebas ordinarias por sí solo no
equivale a los 80 casos de la ejecución integrada.

Node 22 se ejecutó desde una copia portable temporal del
[archivo oficial de Node.js](https://nodejs.org/en/download/archive/v22.23.4),
con SHA-256 contrastado contra `SHASUMS256.txt` de la misma distribución. La
instalación normal del equipo permanece en Node 24.15.0.

## Pendientes para la aceptación integrada

| Comprobación | Estado y requisito |
| --- | --- |
| Aplicación de migraciones en Supabase DEV | Pendiente de coordinación con Sebastian. Aplicar los dos archivos HU-30 en el orden documentado; no ejecutar de nuevo `init_schema.sql`. |
| Recorrido con PostgREST y sesiones reales | Pendiente de configurar `.env` locales mediante el canal privado del PO y de disponer del esquema DEV actualizado. No compartir claves en capturas o en el repositorio. |
| Apariencia móvil y escritorio | Pendiente: revisar ancho estrecho, listas largas, errores, tema oscuro y ausencia de desbordamientos. No había navegador habilitado en la sesión. |
| Accesibilidad de interacción | Pendiente: recorrer campos y botones con teclado, comprobar foco y lectura de errores en un navegador. |
| Evidencia funcional de la PWA | Pendiente: capturas o video del recorrido contra DEV con cuentas ficticias. |
| Review y aceptación del PO | Pendiente de las comprobaciones anteriores y de la revisión del PR. |

Para la revisión manual, usar una API de desarrollo coordinada por el equipo.
El código base aún inicia su cron automáticamente; la ejecución de varias API
contra la base compartida depende del control `CRON_ENABLED` del Issue #55.

El recorrido manual debe incluir crear y editar con A, recargar o iniciar otra
sesión de A, acceder con B, comprobar el aislamiento, cancelar una eliminación y
confirmarla después. Para comprobar la PWA y sus reglas de caché, usar el build
y preview, no solamente el servidor de desarrollo de Vite.

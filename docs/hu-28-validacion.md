# Validación de HU-28 en Supabase DEV

## Complemento local: copia de puntos (8 de noviembre de 2026)

Se incorporó el cambio de `hu28-copiar-puntos.patch` con estos ajustes: los fallos
al consultar puntos no se convierten en una lista vacía; un guardado no confirmado
abre el editor del plan ya creado con un aviso; no se inicia otra petición ni se
navega con respuestas de una sesión anterior; una repetición con puntos requiere
conexión para evitar perderlos en el borrador offline, que no admite ese campo.
La función de copia conserva todos los puntos recibidos sin truncarlos.

Verificación local: 88 pruebas de frontend aprobadas, 2 integraciones PostgreSQL
omitidas por no activar su entorno; `typecheck`, `typecheck:tests` y build PWA
correctos. Las pruebas de HU-28 usan React y HTTP sustituido: comprueban copia
con IDs nuevos, orden y coordenadas, conservación del origen, errores, consulta
de lo persistido tras un guardado incierto, desconexión y cambios de sesión.
Estos resultados no sustituyen la evidencia contra Supabase DEV.

Para completar el criterio en DEV, repetir una expedición propia completada con
al menos dos puntos, introducir fechas futuras y revisar contactos. Comprobar el
aviso de copia, registrar y abrir los puntos de la nueva expedición; recargar y
verificar nombres, orden y coordenadas. Confirmar también que el origen conserva
sus puntos y que los IDs de la copia son distintos. Adjuntar capturas y el
resultado al PR. Este complemento reutiliza la API y las migraciones de HU-32;
no añade otra migración.

## Evidencia histórica: 4 de noviembre de 2026

El 4 de noviembre de 2026 se comprobó el recorrido real de HU-28 con la PWA en
Edge, la API Express de esta rama y PostgREST de Supabase DEV. Se aprobaron el
login de dos cuentas ficticias, la preparación del borrador, la creación con otro
id, la persistencia al recargar, la conservación del origen y el aislamiento.
Aquella ejecución no incluyó la copia de puntos intermedios. Su implementación
local se incorporó el 8 de noviembre de 2026; la evidencia de ese criterio en DEV
sigue pendiente y no se declara la HU aceptada.

La ejecución final terminó a las **14:40:50 de America/Bogota**
(`2026-11-04T19:40:50.868Z`) con Node **22.23.4**. El ejecutor devolvió
`1 passed (43.3s)`. Los chequeos de tipos de backend y pruebas de frontend, el
build del backend y el build de la PWA terminaron correctamente.

## Evidencia

- [Resumen con las capturas](evidencias/hu-28-dev/evidencia.md).
- [Informe de ejecución y limpieza](evidencias/hu-28-dev/validacion.json).
- [Historial del usuario A](evidencias/hu-28-dev/01-historial-dev.png).
- [Borrador en vista de 390 px: fechas vacías y revisión de contactos](evidencias/hu-28-dev/02-borrador-fechas-vacias-dev.png).
- [Nueva expedición persistida junto al origen](evidencias/hu-28-dev/03-nueva-expedicion-persistida-dev.png).
- [Usuario B: origen ajeno rechazado con 404](evidencias/hu-28-dev/04-usuario-B-origen-ajeno-404-dev.png).

| Criterio o escenario | Comprobación real | Resultado |
| --- | --- | --- |
| Reutilizar únicamente una expedición propia completada | Login por la API de TrekSafe; historial propio y `GET /expediciones/:id/borrador`. | Aprobado |
| Solicitar fechas nuevas | API devuelve ambas fechas en `null`; el navegador muestra los campos vacíos y bloquea registrar. La API rechaza las fechas antiguas con `400`. | Aprobado |
| Revisar contactos vigentes | Se elimina un contacto ficticio tras preparar el borrador. Crear con él o con un contacto de B devuelve `400`; no se crean filas parciales. El formulario exige confirmar la revisión. | Aprobado |
| Crear con identidad independiente | Origen `74cd41bd-d7e9-4bd4-addc-3c9e179899d3`; nueva expedición `0f3c152b-6915-4138-a814-a143ce5dd0b9`. La API devuelve `201`. | Aprobado |
| Conservar el origen | Comparación de fila, vínculos y acompañantes antes y después de la creación. | Aprobado |
| Conservar ruta y datos reutilizables | El navegador comprueba ruta y coordenadas del borrador. Se verifican coordenadas, tolerancia, contactos y acompañantes en la nueva fila y sus relaciones. | Aprobado |
| Persistencia | Se recarga la página; la nueva expedición y la original siguen visibles. | Aprobado |
| Excluir campos privados y estados heredados | El borrador no contiene id de destino, estado, datos médicos, alertas ni confirmación. La nueva expedición queda `programada`, sin bitácoras ni despachos heredados. | Aprobado |
| Aislamiento A/B | B ve únicamente su historial. Un origen ajeno y uno inexistente responden igual con `404`; la PWA no muestra el formulario ajeno. | Aprobado |
| Protección de caché | Respuestas de API con `Cache-Control: no-store`; se conservan las reglas NetworkOnly del fix de privacidad. | Aprobado |
| Puntos intermedios disponibles | El contrato compartido actual no los incluye; requiere coordinación con los responsables de HU-29/HU-32. | Pendiente |

## Alcance y limpieza

Se usaron cuentas, contactos y expediciones ficticios exclusivos de esta ejecución.
El servidor escuchó únicamente en loopback y utilizó `createApp`, sin ejecutar
`main.ts` ni iniciar el cron. Se mantuvo el correo simulado y no se aplicaron
migraciones. Las llamadas de base llegaron al servicio real de Supabase; no se
sustituyeron PostgREST ni las respuestas de creación.

El navegador permitió únicamente el origen local de la prueba. Por eso el mapa
de las capturas no carga mosaicos externos; sus coordenadas y marcadores sí se
comprueban. La captura del formulario usa una vista alta para que la barra fija
no tape las fechas. Las imágenes conservan la interfaz de la aplicación.

La limpieza se verificó: se eliminaron únicamente las cuentas ficticias haciendo
coincidir **UUID y correo**; sus expediciones se eliminaron por las relaciones
existentes. Se consultó después que no quedaran esas cuentas ni expediciones.
El informe conserva sus identificadores para trazabilidad y las huellas SHA-256
de los archivos principales usados. No contiene claves, JWT ni contraseñas.

## Reproducción

Requiere las dependencias instaladas de ambas carpetas, Node 22, Edge en Windows
(o Chromium de Playwright en otros sistemas), `backend/.env` del DEV acordado,
`NODE_ENV=development`, `CRON_ENABLED=false` y correo simulado.

La prueba es optativa y necesita `HU28_DEV_RUN=1`: no se ejecuta en las suites
ordinarias ni en el CI de privacidad. Crea sus propios datos ficticios y los
limpia al terminar, también si una comprobación falla. El resultado y las capturas
se generan en `frontend/test-results/hu28-dev/`, excluido de Git; las copias de la
ejecución final revisada están en `docs/evidencias/hu-28-dev/`.

Desde la raíz en PowerShell:

```powershell
$hu28ApiAnterior = $env:VITE_API_URL
$hu28DevAnterior = $env:HU28_DEV_RUN
try {
    $env:VITE_API_URL = '/api'
    $env:HU28_DEV_RUN = '1'
    npm.cmd run build --prefix frontend
    if ($LASTEXITCODE -ne 0) { throw 'Fallo el build de pruebas.' }
    npm.cmd run test:hu28:dev --prefix frontend
    if ($LASTEXITCODE -ne 0) { throw 'Revisar validacion.json y su limpieza.' }
} finally {
    $env:VITE_API_URL = $hu28ApiAnterior
    $env:HU28_DEV_RUN = $hu28DevAnterior
}
```

## Texto para el issue y el PR

```text
HU-28 validada contra Supabase DEV el 04/11/2026.

Se comprobó el recorrido PWA → API → PostgREST → base de datos con dos usuarios:
borrador propio con fechas vacías, revisión de contactos, creación con otro id,
persistencia al recargar, conservación del origen y rechazo 404 para una cuenta ajena.
Las fechas antiguas y los contactos borrados o ajenos se rechazan sin crear expediciones.

Se adjuntan cuatro capturas y el informe de ejecución. Los datos ficticios fueron limpiados.
La integración de puntos intermedios permanece pendiente; no se declara cerrada la HU.
```

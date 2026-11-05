# Validación local de HU-31

El 5 de noviembre de 2026 se comprobaron las fases 2 a 4 en Windows, con
Node 22.23.4 y PostgreSQL 18.1. La historia incluye API y pantalla. El recorrido
completo y las migraciones en Supabase DEV siguen pendientes.

## Resultados de la fase 3

| Comprobación | Resultado |
| --- | --- |
| `npm.cmd run typecheck --prefix backend` | Aprobado. |
| `npm.cmd run build --prefix backend` | Aprobado. |
| Suite ordinaria sin activar PostgreSQL | 193 pruebas aprobadas; las suites condicionadas de PostgreSQL no se ejecutan. |
| Migraciones y archivos SQL de prueba de HU-30 y HU-31 | Aplicados y comprobados en una instancia local nueva y desechable. |
| Backend con ambas suites PostgreSQL activadas | 229 pruebas aprobadas: las 193 ordinarias, 9 de HU-30 y 27 de HU-31 con PostgreSQL. |
| Regresión frontend de HU-30 | 24 pruebas aprobadas, incluido React, HTTP y PostgreSQL. |
| Limpieza | Dos usuarios semilla, cero listas base e ítems, cero preparaciones e ítems copiados. Servidor temporal apagado. |

Las 27 pruebas PostgreSQL de HU-31 incluyen 17 de contrato y 10 de integración.
La fase 3 añade además 10 pruebas de API con memoria, 10 del adaptador con SDK y
una comprobación de privacidad en el ensamblaje HTTP real.

## Comportamiento comprobado

- Copia completa con orden e identidades nuevas, marcas falsas y soporte de
  listas vacías. Una segunda asociación se rechaza sin modificar la existente.
- Cálculo de obligatorios pendientes, marcar/desmarcar y reintentos que no
  invierten el valor. Escrituras en ítems distintos conservan ambos cambios.
- Renombrar, editar o eliminar la lista origen conserva contenido y marcas de la
  copia. Eliminar la expedición o la cuenta elimina la preparación por cascada.
- Propiedad de expedición y lista y pertenencia de ítems. Una cuenta B no puede
  consultar ni escribir la preparación de A. La identidad procede del JWT.
- Escrituras limitadas a programada/en progreso y consultas en los demás estados.
- Asociación que espera una edición de HU-30 copia la versión nueva completa;
  si se elimina el origen mientras espera, no crea preparación.
- Cambio de estado bajo bloqueo a completada o alerta invalida la escritura
  pendiente antes de que pueda guardar.
- Un fallo provocado al insertar el segundo ítem revierte también la cabecera;
  después de retirar el fallo es posible reintentar.
- RLS, políticas, permisos directos revocados, RPC solo para backend,
  `SECURITY INVOKER` y `search_path` vacío. Aun concediendo temporalmente lectura
  dentro de una transacción de prueba, los roles de cliente no ven filas.
- API con UUID y booleanos estrictos, rechazo de campos extra, 401/403/404/409,
  error 500 sin detalles privados y `Cache-Control: no-store`.
- La preparación no cambia los datos ni la versión del plan. La actualización
  SQL del estado a completada funciona con obligatorios pendientes.

## Reproducción

Desde la raíz, con dependencias del backend y frontend instaladas y Node 22 activo:

```powershell
npm.cmd run typecheck --prefix backend
npm.cmd run build --prefix backend
powershell.exe -NoProfile -ExecutionPolicy Bypass -File backend/scripts/test-hu31-postgres.ps1 -PostgresBin "C:\Program Files\PostgreSQL\18\bin"
```

El script de HU-31 amplía el de HU-30, conserva el nombre local
`treksafe_hu30_test` y activa sus dos variables de pruebas solamente durante la
ejecución. El guardián de conexiones exige `127.0.0.1` o `localhost` y ese nombre
exacto. Crea un directorio temporal, inicia PostgreSQL en un puerto de loopback,
reproduce los roles y ejecuta el esquema inicial solo en esa instancia nueva.
Después aplica las migraciones, prueba, verifica la limpieza y apaga el servidor
en `finally`. Los registros se conservan en el directorio temporal indicado.

La ejecución local registrada utilizó
`treksafe-hu30-2f7de16e3c2749989c411d850f213b48` dentro de TEMP. El script terminó
con código 0. Ningún comando requiere una clave de Supabase ni toma
`DATABASE_URL` como destino de migración.

## Fase 4: interfaz y regresiones

La última ejecución local aprobó:

| Comprobación | Resultado |
| --- | --- |
| Tipos y compilación backend | Aprobados. |
| Tipos y build frontend/PWA | Aprobados. |
| Tipos de pruebas Playwright | Aprobados. |
| Backend con PostgreSQL desechable | 229 aprobadas. |
| Frontend con ambas integraciones PostgreSQL activadas | 43 aprobadas, ninguna omitida. |
| Navegador Edge | 14 aprobadas: 12 de privacidad/regresión y 2 de UI de HU-31. |
| Limpieza | Dos usuarios semilla, cero listas, ítems o preparaciones de prueba; instancia apagada. |

HU-31 añade 17 pruebas de componentes, una de cliente HTTP y una integrada de
React, JWT, HTTP, SDK y PostgreSQL. La integración utiliza las rutas reales de
equipo y HU-30; los metadatos del plan se sirven mediante una lectura SQL de
prueba con filtro de propietario, sin sustituir las escrituras de preparación.

La ejecución final empleó la instancia temporal
`treksafe-hu30-a5327a18a8174f58b69193ca9baac3b1`, con código de salida 0.
Se acotó la comprobación final de HU-30 a sus usuarios ficticios para que no
confunda los datos de la prueba paralela de HU-31 con datos sobrantes propios.

Las pruebas de pantalla cubren carga y reintento, asociación con confirmación
PWA, listas vacías, independencia del origen, errores de guardado sin falso éxito,
doble envío, conflictos, consulta por estado, reconexión y respuestas tardías
de cuentas anteriores. La prueba integrada verifica marcas y contador después
de remontar la pantalla, eliminación de la lista origen y aislamiento entre A/B.

En navegador se revisó la presentación a 390 px, sin desbordamiento horizontal,
con capturas generadas en `frontend/test-results/privacidad`. Los dos casos de
HU-31 usan respuestas ficticias y deshabilitan el service worker: comprueban la
interfaz, no PostgREST. Las otras 12 regresiones sí ejercitan el worker real.

El caso de retorno de navegador abre el diálogo existente, envía su contraseña
ficticia y navega a la confirmación aun con obligatorios pendientes y la API de
equipo simulada como no disponible. Comprueba la independencia de la UI y el
payload enviado, pero sustituye la respuesta del endpoint de retorno; la
verificación real de contraseña y persistencia del retorno queda para DEV.

Para reproducir navegador, establecer la URL relativa en el proceso tanto del
build como del ejecutor: el servidor de pruebas también construye su módulo
`probe` y debe apuntar a la API ficticia, no al destino del `.env` local.

```powershell
$hu31ApiAnterior = $env:VITE_API_URL
try {
    $env:VITE_API_URL = '/api'
    npm.cmd run build --prefix frontend
    if ($LASTEXITCODE -ne 0) { throw 'Falló el build de pruebas.' }
    npm.cmd run test:pwa:privacidad --prefix frontend
    if ($LASTEXITCODE -ne 0) { throw 'Fallaron las pruebas de navegador.' }
} finally {
    $env:VITE_API_URL = $hu31ApiAnterior
}
```

No se editan los `.env`. Se usa Edge con perfil temporal de pruebas.

## Alcance pendiente

El SDK serializa las RPC y un puente de pruebas las ejecuta en PostgreSQL real
como `service_role`. Se sustituye su transporte; **no se ha probado PostgREST
ni Supabase DEV para HU-31**.

El caso SQL de retorno de la fase 3 verifica que el esquema permite completar el
estado con equipo pendiente. El testigo HTTP de esa fase verifica que el router nuevo no
intercepta la ruta existente; no ejecuta su controlador de contraseña. La prueba
funcional completa del retorno desde la PWA corresponde a las fases siguientes.

Quedan pendientes las migraciones de HU-31 en DEV coordinadas con
Sebastian, la prueba funcional real con dos cuentas, la evidencia del PR y la
revisión y aceptación del equipo. La numeración de `004` y `005` debe confirmarse
con Sebastian antes de aplicarlas en la base compartida. HU-31 todavía no está
lista para declararse terminada.

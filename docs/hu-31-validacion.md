# Validación local de HU-31

El 5 de noviembre de 2026 se comprobaron las fases 2 y 3 en Windows, con
Node 22.23.4 y PostgreSQL 18.1. La historia está implementada hasta la API.
La interfaz y el recorrido completo en Supabase DEV siguen pendientes.

## Resultados ejecutados

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

## Alcance pendiente

El SDK serializa las RPC y un puente de pruebas las ejecuta en PostgreSQL real
como `service_role`. Se sustituye su transporte; **no se ha probado PostgREST
ni Supabase DEV para HU-31**.

El caso de retorno de esta fase verifica que el esquema permite completar el
estado con equipo pendiente. El testigo HTTP verifica que el router nuevo no
intercepta la ruta existente; no ejecuta su controlador de contraseña. La prueba
funcional completa del retorno desde la PWA corresponde a las fases siguientes.

Quedan pendientes la pantalla, las migraciones de HU-31 en DEV coordinadas con
Sebastian, la prueba visual y funcional con dos cuentas, la evidencia del PR y la
revisión y aceptación del equipo. La numeración de `004` y `005` debe confirmarse
con Sebastian antes de aplicarlas en la base compartida. HU-31 todavía no está
lista para declararse terminada.

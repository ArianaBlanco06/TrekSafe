# HU-50 · Prueba manual de la ficha médica del responsable

Estado: **pendiente en DEV tras aplicar la 030**. No se aplicó en ningún entorno remoto durante el desarrollo. Hasta entonces la única evidencia es la local: `resultado-postgres.md` y `resultado-suites.md`.

## Antes de empezar (Ariana, solo lectura)

1. Aplicar `030_hu50_ficha_medica_responsable.sql` una sola vez, **después de la 021 y la 025** (requiere `016` y `017`). Anotarlo en `REGISTRO_APLICACION.md`.
2. Consulta de solo lectura (debe dar `false`): `SELECT has_table_privilege('service_role','public.accesos_ficha_medica','UPDATE');`
3. Recargar el esquema de PostgREST para exponer `treksafe_contexto_ficha_medica`, `treksafe_leer_ficha_cifrada_responsable`, `treksafe_registrar_acceso_ficha_medica` y `treksafe_anonimizar_notas_avance`.

## Cuentas y datos

- Dos cuentas de rescatista validadas, A y B, y una cuenta de senderista con una ficha médica con consentimiento y una expedición en `alerta`. Un cliente HTTP o la aplicación contra DEV. No pegar tokens en la evidencia (`Bearer ***`). Datos médicos ficticios.

## Pasos

| # | Paso | Resultado esperado | Captura |
|---|---|---|---|
| 1 | A asume la coordinación de la alerta (HU-39) y abre el detalle | No se ve ninguna ficha: solo el botón "Ver ficha médica" y el aviso "Cada consulta queda registrada" | |
| 2 | `GET /api/rescate/alertas/:expedicionId` | La respuesta no tiene la clave `fichaMedica` | |
| 3 | A pulsa "Ver ficha médica" | 200 con tipo de sangre, alergias, condiciones y medicación; "Ocultar ficha" borra los datos | |
| 4 | B abre el mismo detalle | Texto "Solo el responsable vigente…", sin botón; `GET .../ficha-medica` con el token de B da 403 `NO_ES_RESPONSABLE` sin datos | |
| 5 | Relevo de A a B (HU-40) | A recibe 403; B recibe 200 | |
| 6 | Consultar `accesos_ficha_medica` (solo lectura, con rol de servicio) | Una fila por cada intento de los pasos 3 a 5, con actor, resultado, motivo y hora del servidor, y sin datos de salud | |
| 7 | A localiza y cierra el incidente (HU-42) | Tras cerrar, la consulta de A da 403 `INCIDENTE_CERRADO` | |
| 8 | Dejar vencer la alerta de otro senderista y revisar el correo recibido por un rescatista | Ni etiquetas ni valores médicos; aparece el aviso "La ficha médica no se envía por correo…" | |
| 9 | ARCO "anonimizar rutas" de un senderista con avances con nota | `notasAvanceAnonimizadas` > 0 en la respuesta; las notas de las expediciones completadas o canceladas quedan vacías | |
| 10 | Revocar el consentimiento (ARCO `eliminar_personal`) y consultar | 403 `SIN_CONSENTIMIENTO` para el responsable; sin ficha en la respuesta | |

## Pendiente de confirmar en DEV

- Que `error.message` de las RPC llegue por PostgREST (la fachada y el DAO dependen de ello).
- Que el esquema recargado exponga las cuatro RPC.
- Que `has_table_privilege('service_role', 'public.accesos_ficha_medica', 'UPDATE')` dé `false`.

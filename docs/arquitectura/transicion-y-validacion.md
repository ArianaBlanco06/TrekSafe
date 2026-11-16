# Transición y validación

Responsable transversal: PO. Se pueden corregir componentes previamente validados o vinculados a issues cerradas, registrando antecedente, impacto y nueva evidencia. No reabrir o reasignar automáticamente todas las HU por esta documentación.

## Orden de trabajo

1. **#106:** fijar diseño, fuentes, decisiones y matriz. Publicar el PR documental a `develop`.
2. **#107 y #108:** preparar entradas/contratos y persistencia compatibles. Revisar registros de migración antes de ejecutar SQL. La conciliación de #103 ya está integrada: no repetir sus DDL.
3. **#109 y #111:** integrar outbox y procesador, privacidad/sincronización de interfaz y HU existentes sobre los contratos anteriores. #109 debe resolver atomismo, numeración y contadores del PR #90.
4. **#110:** verificar cuentas y recursos, construir/publicar la imagen y frontend por entorno, configurar grupos/secretos, supervisión y recuperación. Confirmar costo total y suficiencia de 256 MB.
5. **#112:** probar la versión publicada, las HU requeridas y la regresión R1 pertinente con datos ficticios; registrar resultados por rol y dependencia.

Las dependencias concretas están en la [matriz](matriz-trazabilidad.md). No fusionar automáticamente PR abiertos para cumplir el diseño: cada uno requiere integración y validación contra su revisión actual.

## Secuencia de publicación objetivo

| Paso | Condición de entrada | Acción / evidencia requerida |
|---|---|---|
| 1. Identificar destino | Cuenta y proyecto del entorno conocidos | Registrar commit, esquema, dominio, app, plan, recursos y destinatarios de prueba; sin revelar valores secretos |
| 2. Preparar recuperación | Datos y esquema inspeccionados | Respaldo/restauración según capacidades reales del plan; ensayar recuperación con datos ficticios |
| 3. Esquema compatible | Pruebas desechables pasan | Aplicar solo migraciones faltantes y compatibles en su orden; distinguir asiento faltante de estructura faltante |
| 4. API y worker | Ambos programas presentes en la misma imagen | Configurar grupos `api`/`worker`, un ejemplar activo de cada uno; HTTP únicamente en API; registrar imagen/commit |
| 5. Transferir ejecución | Productores de avisos usan el contrato transaccional | Detener el cron legado antes de activar el nuevo; definir hora de corte, conservar pendientes y recuperar vencimientos acumulados |
| 6. Publicar PWA | API compatible accesible por HTTPS | Build con `VITE_API_URL` correcto; `CORS_ORIGIN` del mismo entorno; verificar rutas SPA y actualización de worker de navegador |
| 7. Comprobar | Versiones y destinos registrados | Salud, DB, actividad de tareas, flujo por rol, pendientes y correo controlado; guardar evidencia |

La transición de despachos históricos a outbox necesita reconciliar expediciones ya en alerta, envíos conocidos y resultados ambiguos. #109 definirá y probará el procedimiento para no volver a avisar masivamente ni ignorar pendientes. Una pausa breve del productor durante el corte no debe perder hechos vencidos: al volver, el worker evaluará el intervalo acumulado. Monitoreo continuo no equivale a cambio sin interrupción garantizada.

Los comandos históricos `fly deploy` y `set-fly-secrets.ps1` **no implementan esta transición por sí solos**. Los comandos operativos definitivos, después de implementar las entradas y verificar la CLI utilizada, pertenecen a #110. No se incluye un `fly.toml` ejecutable de dos procesos antes de que los programas existan.

## Recuperación

- Preferir volver a una imagen anterior compatible conservando el esquema aditivo y los pendientes. Registrar imagen, hora y responsable.
- No ejecutar archivos `.down.sql` destructivos sobre bases compartidas ni usar `init_schema.sql` como restauración.
- Si la versión anterior no entiende la nueva outbox, no reactivar envíos directos sin conciliación: podrían duplicarse notificaciones. Mantener pendientes y recuperar el procesador compatible.
- Una migración incompatible bloquea la publicación hasta tener una transición/restauración ensayada. La documentación no certifica backups que el plan de cuenta no haya verificado.

## Escenarios y evidencia de las siguientes issues

| ID | Escenario | Resultado esperado | Issue |
|---|---|---|---|
| V1 | Construir/arrancar API y worker separados | HTTP sin cron; worker sin servicio público | #107, #109, #110 |
| V2 | Fallar creación de expedición a mitad | Sin cabecera, vínculos o acompañantes parciales | #108 |
| V3 | Fallar antes/después de commit de alerta | Reversión conjunta o pendiente duradero recuperable | #108, #109 |
| V4 | Dos procesadores y una reserva vencida | Reclamación coherente, sin sobrescritura de propietario antiguo | #109 |
| V5 | Rechazo temporal y agotamiento de intentos | Espera/estado trazables; fallo visible | #109 |
| V6 | Aceptación del proveedor con respuesta perdida | Incierto; no se cuenta como recibido | #109, #112 |
| V7 | Reiniciar solo API / solo worker | Independencia de procesos y recuperación duradera | #110, #112 |
| V8 | DB caída o transporte sin configuración | Estado operativo degradado visible; sin falso éxito | #109, #110 |
| V9 | Dos sesiones editan o cancelan al pasar la salida | Conflicto de versión/estado según HU, sin perder evento | #108, #112 |
| V10 | Logout, otra cuenta, reconexión y SW activo | Datos privados aislados y operación offline sin duplicación | #111 |
| V11 | Acceso médico por actor sin autorización | Rechazo/auditoría; correo sin ficha en texto | #109, #111, #112 |
| V12 | Publicación y recepción de correo controlado | Commit/esquema identificados y recepción acreditada | #112 |

Esta tabla es el plan de comprobación futuro, no resultados ya obtenidos. Las pruebas de #106 se limitan a documentación y se registran en [evidencias](evidencias.md).

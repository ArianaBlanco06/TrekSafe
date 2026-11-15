# Ejecución de aceptación integral por el PO

Este protocolo se ejecuta después del roadmap de despliegue, sobre un proyecto académico separado de DEV y con datos ficticios. Aún no se ha ejecutado contra URLs publicadas. Completar el registro de versión antes de probar: fecha UTC/Lima, commit de 40 caracteres, digest de imagen, versiones de migraciones realmente aplicadas, URL frontend/API y referencia de ejecución. Una compilación, un smoke o la aceptación de Brevo no sustituyen esta aceptación.

## Preparación y límites

Usar diez cuentas ficticias de senderista y dos rescatistas validados mediante registros institucionales ficticios autorizados. Registrar las cuentas por los flujos normales; guardar sus contraseñas fuera de Git, informes y capturas. No copiar datos de DEV. Configurar como contactos únicamente buzones controlados cuyos titulares hayan aceptado la prueba. El máximo de la sesión es **20 correos reales totales**, incluidos reintentos y retornos; llevar un contador y detener el worker antes de superar el presupuesto. No cambiar destinatarios a direcciones aleatorias ni generar un correo por cada petición de carga.

Confirmar API y worker con el mismo digest, exactamente un worker activo, configuración de producción, fallback desactivado y frontend con la URL absoluta de la API. Registrar `/api/salud` y `/api/disponibilidad`, heartbeat de ambos ciclos y ausencia de pendientes sin conciliar. Guardar evidencias mínimas con ids de fixture; ocultar tokens, contraseñas, destinatarios y datos médicos en las capturas. Las pruebas con datos de salud usarán exclusivamente valores ficticios inequívocos y se documentarán por resultado, sin copiar la ficha a los artefactos.

## Secuencia funcional

1. **Regresiones R1 pertinentes:** registrar/iniciar/cerrar sesión; recuperar acceso si está habilitado; validar rol; crear expedición, consultar activa/historial y confirmar retorno. Acceder con otra cuenta y con token ausente/vencido debe rechazarse sin filtrar recursos. Comprobar consentimiento y ficha cifrada con contenido ficticio; revisar que correos y logs no incluyan salud. Ejecutar los flujos principales de cada rol en escritorio y pantalla móvil.
2. **HU26–38:** ejecutar las acciones y rechazos indicados en `ejecucion_requerida` de cada fila de la matriz: edición/cancelación/repetición, plantillas, listas/equipo, puntos/mapa, avances/ampliación, historial, avisos y recordatorios. Registrar un resultado individual por CA con evidencia concreta; compartir un video entre criterios solo si permite localizar cada comprobación.
3. **HU39–43 y HU50:** dos rescatistas intentan asumir simultáneamente la misma alerta; comprobar un responsable y un conflicto. Probar relevo pendiente/aceptado, bitácora solo anexada, cierre localizado, priorización y acceso médico antes/después del relevo/cierre/consentimiento. El rescatista ajeno debe recibir rechazo antes del descifrado.
4. **HU44–46:** confirmar retorno, comprobar outbox e identidad lógica; producir rechazo confirmado y resultado ambiguo con transporte controlado; repetir la solicitud manual. Correlacionar evento, intentos y estado. Para el correo real, registrar por separado aceptación del proveedor y recepción comprobada en buzón, incluida carpeta spam. Revisar enlace de rescate → login → incidente autorizado y ausencia de salud.
5. **HU47–48:** filtros de fechas/zona/resultado con incidentes conocidos y múltiples relevos/entradas; exportar 1000 incidentes ficticios, comprobar unicidad, paginación, comillas, tildes, encabezados y celdas potencialmente interpretadas como fórmulas. Este fixture se prepara en el proyecto académico, sin despachos pendientes.
6. **HU49/PWA:** instalar/abrir con Service Worker activo; crear borrador offline, reiniciar y cambiar de cuenta; comprobar aislamiento, logout y cache privada. Reconectar exige revisar fechas/contactos; repetir id no duplica. Probar versión obsoleta, respuesta tardía de sesión anterior, actualización de Service Worker y dos pestañas. Bloquear mapa y comprobar lista alternativa visible.

## Carga controlada y observación

El perfil inicial es **10 senderistas y 2 rescatistas durante 15 minutos**, seguido de **30 minutos de observación**. Es una propuesta de ensayo para recursos gratuitos; no es un resultado ya medido ni una garantía de capacidad. Puede ejecutarse manualmente en sesiones separadas o mediante una herramienta de carga revisada. No lanzar automatismos de escritura sin revisar sus destinatarios y efectos.

Durante la carga, cada senderista consulta su estado/avisos y recorre pantallas a un ritmo humano; los rescatistas consultan consola y un incidente autorizado. Usar fixtures ya creados para consultas. Reservar escrituras concurrentes, expiraciones, retorno y envíos para casos funcionales numerados, sin bucle de creación o confirmación. Mantener la medición antes/después del polling en el mismo dispositivo, escenario, duración y visibilidad; medir además carga inicial en el dominio publicado. La medición local de C es un antecedente, no el resultado de este ensayo.

Registrar intervalos y cantidad de solicitudes, latencia p50/p95, errores por estado, CPU/RAM de ambas VM, espacio en disco, conexiones y consumo Supabase, pendientes/edad máxima e intentos outbox. Separar errores de autorización deliberados del error inesperado. Criterios iniciales: cero pérdida o duplicación lógica detectada, cero acceso privado cruzado, cero error inesperado 5xx, ningún reinicio por memoria y ningún pendiente que supere los 10 minutos sin explicación/acción. Anotar latencias observadas; el PO fija su umbral de experiencia antes de aprobar, sin inventar un objetivo retrospectivo. Si aparece un bloqueante, detener la prueba, conservar evidencia y abrir un defecto antes de retomar.

## Fallos y recuperación

Sobre fixtures identificados y sin agotar el presupuesto de correo:

| Ensayo | Resultado que debe acreditarse |
|---|---|
| Detener worker después de persistir un pendiente | API permanece accesible; sonda operativa degrada al caducar heartbeat; al reiniciar persiste y se procesa el pendiente. |
| Detener API | Monitor externo detecta caída; worker conserva su ciclo; reinicio vuelve a servir la misma versión. |
| Interrumpir acceso a DB de cada proceso | Sonda 503 y ciclos con fallo/heartbeat caducado; recuperar acceso no pierde pendientes. No modificar reglas DEV. |
| Caída tras inicio de intento y antes de confirmar resultado | Reserva expirada produce incierto; no se reenvía automáticamente. Documentar posibilidad de recepción anterior y revisión humana. |
| Reinicio/publicación con trabajo en curso | Apagado ordenado o conservación del intento; imagen/digest y esquema compatibles tras el reinicio. |
| Restauración/rollback ensayados | Restaurar respaldo solo en destino desechable separado; comprobar objetos/datos ficticios y pendientes. Volver a digest compatible sin deshacer DDL destructivamente. |

Un intervalo de UptimeRobot Free de cinco minutos no acredita detección inmediata. Registrar tiempos observados de caída, primera detección, reinicio y recuperación. La ausencia de alerta del monitor no prueba continuidad si el ensayo dura menos que su intervalo.

## Cierre de asignaciones

Completar los 75 resultados y todos los criterios de las seis tareas. Registrar cada fallo con issue, impacto y reproducción. Un criterio pendiente/bloqueado impide afirmar aceptación integral. El PO revisa personalmente las evidencias, confirma recepción de correo y firma el acta con sus limitaciones. Después actualizar issues y milestone según sus condiciones reales; no cerrar #108 mientras falte la evidencia de aplicación de 032 en el entorno requerido, ni #109–112 por haber preparado scripts. El cierre formal también requiere revisión/merge conforme a las reglas del repositorio.

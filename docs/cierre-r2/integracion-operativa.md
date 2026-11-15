# Integración operativa R2 — evidencia local de #109

Fecha: 2026-11-14, America/Lima. Base de trabajo: `develop` `8f9c4fe`. Esta entrega prepara la ejecución en dos procesos/máquinas y la comprobación del entorno publicado. No acredita un despliegue ni el cierre de #109–#112.

## Comportamiento incorporado

- `dist/api.js` solo atiende HTTP. En producción rechaza `CRON_ENABLED=true`.
- `dist/worker.js` exige cron activado y transporte real en producción. Registra su instancia en PostgreSQL antes de empezar. Ejecuta plazos y consumo de outbox con intervalos independientes; cada ciclo evita solapamientos locales. Las reservas SQL de HU-45 conservan la exclusión entre procesos.
- El productor operativo promueve programadas, invoca exclusivamente `treksafe_evaluar_vencimientos_con_outbox` (024) y genera recordatorios in-app. No llama a los transportes/servicios históricos de alerta. Un fallo de SQL o recordatorios se propaga y el ciclo se registra como error.
- El consumidor existente de HU-45 procesa pendientes aunque el productor no genere alertas nuevas. Conserva identidad de notificación, tokens de reserva por adquisición, tres intentos automáticos y esperas de 1/5 minutos. El estado incierto necesita conciliación; no se reintenta automáticamente.
- El transporte tiene un máximo de 30 s. Brevo cancela la solicitud HTTP; SMTP tiene límites de conexión/saludo/socket y un plazo absoluto que cierra su transporte. El consumidor clasifica timeout/respuesta perdida como incierto. La reserva vigente de 300 s debe superar el timeout más un margen de 5 s. Un resultado tardío no cambia una notificación ya clasificada como incierta.
- Los logs operativos separan `aceptados`, `simulados`, `reintentados`, `fallidos` e `inciertos`, sin destinatarios, cuerpos ni claves. El campo histórico `exitosos` del resultado interno equivale a aceptación por el proveedor; no acredita recepción.
- Los correos `ALERTA_RESCATE` incorporan un enlace a `/rescatista/alertas/:expedicionId` únicamente con UUID válido y origen configurado. El texto se escapa al generar HTML; no se incorpora el resto de metadata. La ruta sigue exigiendo login/autorización. No se altera la clave idempotente ni se añade un token al enlace.

## Disponibilidad y privacidad

`GET /api/salud` conserva su respuesta histórica y no prueba la salud de otro proceso.

`GET /api/disponibilidad` devuelve exclusivamente:

```json
{"estado":"operativo"}
```

con HTTP 200, o `{"estado":"degradado"}` con HTTP 503. La sonda consulta PostgreSQL mediante el puerto privado de estado worker y la migración **032** del paquete de datos. Requiere ambos ciclos recientes y correctos; fallos/resultado incierto y pendientes vencidos degradan el estado. No expone instancias, contadores, errores, correo ni secretos. Usa `Cache-Control: no-store`; internamente agrupa consultas concurrentes y conserva su resultado un máximo de 10 s. Una consulta bloqueada responde degradado a los 3 s; las solicitudes Supabase del servidor se cancelan como máximo a los 10 s.

Cada ciclo registra su resultado con reloj del servidor de base. Un fallo de persistencia no fabrica una señal saludable en memoria: la última señal caduca. El apagado deja de admitir ciclos, espera los que están trabajando y registra parada antes de liberar recursos. Un corte abrupto se detecta por caducidad; las reservas y pendientes permanecen en PostgreSQL.

## Configuración por rol

| Variable | API publicada | Worker publicado |
|---|---|---|
| `NODE_ENV` | `production` | `production` |
| `CRON_ENABLED` | `false` explícito | `true` explícito |
| `MAIL_DEV_FALLBACK` | `false` | `false` |
| `PUBLIC_APP_URL` | Opcional | Origen HTTPS de la PWA, sin ruta, credenciales ni parámetros |
| `CRON_INTERVAL_MS` | Sin temporizador | 60000 por defecto |
| `OUTBOX_INTERVAL_MS` | Sin temporizador | 15000 por defecto |
| `OUTBOX_BATCH_SIZE` | No aplica | 1 por defecto, rango 1–4 |
| `WORKER_HEARTBEAT_MAX_AGE_MS` | 180000 por defecto | Mismo umbral del entorno |
| `OUTBOX_PENDING_MAX_AGE_MS` | 600000 por defecto | Mismo umbral del entorno |

El backend rechaza producción con fallback simulado y configuraciones cuyo lote/intervalo puedan exceder el umbral de heartbeat considerando transporte y RPC. Si se aumenta el lote, ajustar y validar también el umbral. Ambos umbrales tienen un máximo de 24 h para coincidir con el contrato SQL. Ciclos de plazos excepcionalmente largos se mostrarán degradados; las mediciones reales del entorno académico determinarán si es preciso reducir carga o ajustar la configuración.

La ausencia de `CRON_ENABLED` ahora significa **false**. Los valores ya definidos en el proceso tienen prioridad sobre `backend/.env`. Estos cambios son intencionales para impedir trabajo accidental sobre DEV. `main.js` queda reservado a compatibilidad local y rechaza producción. La herramienta manual `run-cron-tick.ts` usa el productor transaccional y requiere activación explícita; no arranca un consumidor adicional.

## Verificaciones locales realizadas

- Compilación y tipos backend aprobados. En esta estación se reutilizaron dependencias instaladas mediante una junction; TypeScript se ejecutó con `--preserveSymlinks` para evitar TS2742 de una función de pruebas histórica. No se cambió la configuración TypeScript del proyecto ni se añadió una dependencia por esa circunstancia local.
- Regresión completa: **1170 pruebas aprobadas**, sin fallos. El resumen de Node indica cero tests omitidos, pero aparecen **siete grupos PostgreSQL condicionales omitidos**: HU-30, HU-31, registro HU-31, HU-36, HU-41, HU-42 y HU-50. Este comando no acredita sus pruebas SQL.
- Pruebas específicas: productor transaccional sin fallback, consumidor independiente, no solapamiento, cierre esperando trabajo, error/reanudación, pérdida de reserva antes de enviar, timeout/respuesta tardía sin reenvío ciego, cierre SMTP, separación de simulación, sonda HTTP 200/503, caché y timeout de disponibilidad, configuración segura y enlaces privados escapados.
- La revisión de datos aporta y prueba la migración 032 separadamente. La integración final debe ejecutar sus runners PostgreSQL/PostgREST junto al candidato integrado; no se sustituye ese resultado por los dobles usados en estas pruebas de aplicación.

## Condiciones pendientes para acreditar el entorno publicado

1. Revisar y aplicar solo SQL realmente faltante al nuevo proyecto académico; no ejecutar esta entrega contra DEV compartido. La migración 032 no se aplicó remotamente desde este trabajo.
2. En el entorno académico nuevo, iniciar API/worker de la misma imagen inmutable y con las variables de rol; verificar heartbeat de ambos ciclos y la sonda pública.
3. Si se migra un entorno con alertas/despachos históricos, conciliarlos antes de activar el nuevo productor. No reencolar masivamente ni afirmar que las alertas anteriores ya poseen pendientes duraderos.
4. Verificar con destinatarios controlados recepción real, fallo temporal, agotamiento y respuesta ambigua. Estos tests locales no enviaron correo real.
5. Ensayar corte/reinicio de cada proceso, caída de DB, reservas vencidas y recuperación de pendientes sobre el candidato publicado. Medir recursos y registrar limitaciones del alojamiento gratuito.
6. Incorporar evidencia de las URLs, commit, digest/esquema, fecha y resultado en #109/#110/#112. No cerrar tareas por el hecho de compilar o por el resultado de mocks.

No se crearon servicios remotos, no se ejecutó DDL remoto, no se publicaron ramas y no se cerraron issues en esta entrega.

# Contratos y operación objetivo

Este documento especifica requisitos para #107–#111. No cambia tipos, rutas, variables ni configuración ejecutable en #106.

## Entradas y dependencias

| Interfaz | Estado base | Contrato objetivo |
|---|---|---|
| Arranque HTTP | `node dist/main.js`, API y cron juntos | Entrada independiente `node dist/api.js`; solo HTTP, sin tareas ni requisito de conexión SMTP |
| Arranque de tareas | Temporizador iniciado por `main.ts` | Entrada independiente `node dist/worker.js`; reloj, repositorios y transporte ensamblados, sin puerto público |
| Cliente → API | `/api`, JSON y `Authorization: Bearer <JWT>` | Mantener rutas y JWT propios; autorizar rol y propietario antes de consultar/descifrar |
| API/worker → DB | SDK Supabase con `service_role` y RPC | Contratos de repositorio; las operaciones compuestas deben ser atómicas en PostgreSQL |
| Worker → correo | Clase concreta con API/SMTP/dev-log | Adaptador de transporte con resultado distinguible: aceptado, fallo confirmado o incierto; simulación separada |
| Consulta de salud | `/api/salud`, HTTP 200 con información de correo/cron local | Preservar la ruta; no interpretar su respuesta como validación de DB, correo real o worker remoto |

Los nombres de las dos entradas son **objetivo de #107/#109**; actualmente no existen. Se construirá una sola imagen con ambos programas. El dominio y la aplicación deben depender de contratos, y la infraestructura implementarlos. La composición concentra las instancias concretas.

## Configuración y secretos

| Configuración | API | Worker | Navegador / entorno |
|---|---|---|---|
| `NODE_ENV`, proyecto Supabase | Producción académica con destino explícito | Mismo destino que API del entorno | DEV apunta a otro proyecto; ninguna credencial real en documentación |
| `PORT=3000`, `API_PREFIX=/api`, `CORS_ORIGIN` | Requeridos por HTTP | No expone servicio HTTP | Origen exacto de PWA del mismo entorno |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Solo servidor | Solo servidor | Nunca en variables `VITE_*` |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Emisión/verificación propias | Solo si un caso de uso lo requiere | JWT cliente en sesión; sin compartir claves entre entornos |
| `MEDICAL_ENCRYPTION_KEY` | Acceso autorizado a ficha | Evitar dependencia de descifrado para enviar avisos | La clave no se envía al cliente ni se publica en logs |
| `CRON_ENABLED` | Fijar `false`; además, la entrada HTTP no llama al cron | `true` en el worker continuo | Local contra DEV compartido: `false` salvo instancia coordinada |
| `CRON_INTERVAL_MS` | Sin temporizador | Base existente 60000 ms | Intervalo de evaluación, no promesa de entrega en 60 s |
| `BREVO_API_KEY` / `SMTP_*` | Sin dependencia operativa para atender HTTP | Credenciales del transporte seleccionado | En DEV, destinatarios controlados |
| `MAIL_DEV_FALLBACK` | Sin envíos directos de flujos migrados | `false` en publicado; ausencia de transporte debe ser visible como fallo de configuración | `dev-log` nunca equivale a envío/recepción real |
| `VITE_API_URL` | No aplica | No aplica | URL pública API incorporada al compilar en Vercel |

La configuración por grupo debe implementarse explícitamente: definir `CRON_ENABLED=false` como valor común a toda la app desactivaría también el worker si este sigue leyéndolo sin una estrategia por proceso. La entrada y configuración efectivas se prueban en #109/#110. Mantener predeterminado `true` y confiar en omitir la variable no es una política de despliegue.

El intervalo de lectura de outbox debe ser configurable independientemente del intervalo de plazos en #109. Se conserva la política de intentos de la HU integrada y se documentan sus valores reales; #106 no cambia el contrato funcional de HU-45 ni inventa un esquema de configuración ya implementado.

## Persistencia y concurrencia

- Transacción de negocio: estado + evento + avisos requeridos se confirman juntos. Crear expedición, vínculos y acompañantes también debe ser una operación completa o revertida.
- Identidad: una clave única de notificación lógica considera evento, destinatario y canal; un reintento conserva esa identidad. Distinguirla de la identidad del intento y del identificador del proveedor.
- Reserva: reclamar de forma atómica, con propietario y caducidad. Finalizar o renovar solo con propiedad vigente para impedir que un worker antiguo sobrescriba el resultado de uno nuevo.
- Duración: timeout de transporte y reserva deben ser coherentes; no iniciar trabajo fuera de la reserva válida. Evitar ticks superpuestos dentro del proceso, además de coordinar concurrencia en DB.
- El envío externo ocurre fuera de la transacción SQL. No mantener bloqueos SQL durante una llamada al proveedor. Reinicios y despliegues deben conservar pendientes y liberar/recuperar reservas de forma segura.
- Resultados: pendiente, intentado, aceptado por proveedor, fallido e incierto se distinguen semánticamente. Recibido solo se declara con evidencia específica de recepción. La traducción al esquema de HU-45/HU-46 se valida al integrarlo.

## Fallos y señales operativas

| Escenario | Comportamiento requerido | Señal / prueba futura |
|---|---|---|
| DB no disponible | Evitar escrituras parciales; recuperar ciclos cuando vuelva | Error identificado, último ciclo correcto no actualizado falsamente |
| API reiniciada | Worker sigue evaluando; pendientes permanecen | Comprobar con dos máquinas en #112 |
| Worker reiniciado antes/después del commit | Rollback completo antes; pendiente recuperable después | Prueba de corte en ambos puntos |
| Reserva vencida | Reclamación segura con control de propietario | Concurrencia y worker anterior retrasado |
| SMTP/API rechaza temporalmente | Registrar intento y espera; reintentos acotados | Estado y próxima ejecución visibles |
| Proveedor acepta y se pierde respuesta | Incierto y conciliación; no afirmar recepción ni reintentar ciegamente | Prueba de timeout ambiguo; posible duplicación documentada |
| No hay correo configurado | Worker no acredita envíos; falla su verificación operativa | No ocultarlo como `dev-log` exitoso |
| PWA pierde conexión o cambia de cuenta | Mantener solo borradores permitidos; no servir API privada cacheada | Regresiones HU-49, privacidad y respuesta tardía |

#110 debe distinguir vida de API, acceso a DB y actividad del worker. El estado actual del cron es memoria de proceso: al separar máquinas no se comparte. La supervisión necesitará una señal persistente de último ciclo correcto y resultados consultables de outbox; no inferir salud del worker a partir del HTTP 200 de API. Este diseño no añade un endpoint público de administración ni un SLA.

Logs y evidencia usarán identificadores de operación y errores anonimizados, sin JWT, claves, fichas o cuerpos completos de correos. La outbox retiene datos mínimos de destinatario/contexto y requiere control de acceso y política de conservación en #108/#109.

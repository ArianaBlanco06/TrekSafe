# TrekSafe

Sistema Automatizado de Monitoreo y Gestión de Seguridad para Turismo de Aventura en Alta Montaña.

El senderista registra su plan de expedición y confirma el retorno seguro. Si no lo hace a tiempo, TrekSafe escala alertas automáticas a contactos de emergencia y equipos de rescate, con ubicación y ficha médica.

[Arquitectura y estado R2](docs/arquitectura/README.md) · [`.env.example`](.env.example)

URLs históricas: [PWA](https://treksafe-app.vercel.app) · [API /salud](https://treksafe-api.fly.dev/api/salud). Consulta del 2026-11-10: PWA respondió 404 y el host de API no se resolvió desde el entorno de comprobación. La versión publicada y la configuración de las cuentas no están verificadas. [Evidencia y límites](docs/arquitectura/estado-actual.md).

![Node](https://img.shields.io/badge/Node.js-22-339933?logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3FCF8E?logo=supabase&logoColor=white)
![Fly.io](https://img.shields.io/badge/API-Fly.io-24175B?logo=flydotio&logoColor=white)
![Vercel](https://img.shields.io/badge/PWA-Vercel-000000?logo=vercel&logoColor=white)

> Proyecto académico — **Universidad de Lima** · Continuidad de Ingeniería de Software 1 a Ingeniería de Software 2 · 2026.
> **Release 2 (ISW2):** arquitectura objetivo con API y tareas en máquinas separadas y monitoreo continuo. El diseño de [#106](https://github.com/ArianaBlanco06/TrekSafe/issues/106) guía las tareas de implementación y despliegue; la validación integral corresponde a [#112](https://github.com/ArianaBlanco06/TrekSafe/issues/112). No se declara aquí un cierre funcional de las 25 HU R2.

> **Continuidad ISW2 — HU-32:** gestión de puntos intermedios implementada y validada localmente. [Dossier, demostración y evidencia](docs/hu-32/README.md). Su migración `010_hu32_puntos_ruta.sql` está aplicada y registrada en Supabase DEV.

## Contenido

- [Características](#características)
- [Arquitectura](#arquitectura)
- [Stack](#stack)
- [Estructura](#estructura)
- [Inicio rápido](#inicio-rápido)
- [Despliegue](#despliegue)
- [API](#api)
- [Seguridad](#seguridad)
- [Equipo](#equipo)
- [Licencia](#licencia)

## Características

**Senderista**
- Plan de ruta, countdown y check-in de retorno seguro
- Ficha médica cifrada AES-256 y contactos de emergencia
- PWA offline (borradores / caché) y derechos ARCO (Ley N° 29733)

**Rescatista**
- Consola con semáforo por zona y detalle de alerta (mapa + ficha médica auditada)
- Confirmación de recepción, bitácora e historial operativo

**Motor**
- Cron de plazos, alertas por correo (Brevo API o SMTP) e idempotencia de despacho

<details>
<summary>Detalle de capacidades</summary>

| Rol | Capacidades |
| --- | --- |
| Senderista | Registro/login JWT, expedición activa, recordatorio a 30 min, modo oscuro mobile-first |
| Rescatista | Validación institucional simulada (AGMP/MINCETUR), filtro por zona, estados En búsqueda → Localizados → Cerrado |
| Sistema | Sin IoT ni GPS continuo; monitoreo pasivo por verificación positiva |

</details>

## Arquitectura

Monorepo con PWA estática en Vercel y backend Node/Express para Fly.io. La base inspeccionada es `develop` en `8508bb4`: API, temporizador y correo se inician juntos. Esa configuración no acredita el inventario publicado.

**Objetivo R2:** una imagen Docker compartida y dos grupos Fly, `api` y `worker`, con una máquina activa por grupo en `iad`; únicamente API expone HTTP. Ambos acceden a PostgreSQL mediante la Data API/RPC de Supabase. El procesador evaluará plazos y enviará notificaciones desde una outbox transaccional. Las entradas separadas y esa integración aún requieren implementación.

El navegador usa REST y JWT propios. `service_role` permanece en servidor y evita RLS; API/RPC deben aplicar autorización de actor y propietario. El correo es un adaptador dentro del backend, sin un servicio TCP interno adicional.

**Backend:** carpetas `presentation`, `application`, `domain` e `infrastructure`; parte del código aún depende directamente de infraestructura. La inversión de dependencias y composición se completan en #107. **Frontend:** pages / components / services / lib / context / hooks / features.

Diagramas y contratos: [estado actual](docs/arquitectura/estado-actual.md), [objetivo](docs/arquitectura/arquitectura-objetivo.md), [decisiones y costos](docs/arquitectura/decisiones.md), [transición](docs/arquitectura/transicion-y-validacion.md) y [matriz de tareas/pruebas](docs/arquitectura/matriz-trazabilidad.md).

## Stack

| Capa | Tecnologías |
| --- | --- |
| Frontend | React 18 · Vite 6 · TypeScript 5 · Tailwind 4 · React Router 7 · PWA/Workbox · Leaflet/OpenStreetMap |
| Backend | Node.js 22 · Express 4 · Zod · bcrypt · JWT propio · Helmet · CORS |
| Datos | PostgreSQL (Supabase) · RLS deny-by-default |
| Email | Brevo API · Nodemailer (SMTP) |
| Seguridad | AES-256-GCM · rate limiting · auditoría de acceso médico |

## Estructura

```
TrekSafe/
├── backend/            # API + cron + correo actuales; separación futura api/worker
│   ├── src/            # Presentación, aplicación, dominio e infraestructura
│   ├── migrations/     # SQL incremental y registro por entorno
│   ├── Dockerfile
│   └── fly.toml        # Configuración histórica de un grupo app
├── frontend/           # PWA React / Vite, salida dist
├── docs/arquitectura/  # Diseño R2, evidencia, decisiones y transición
├── .github/workflows/  # CI: validaciones; publicación pendiente en #110
├── init_schema.sql     # Solo base nueva/descartable: borra y recrea tablas
└── .env.example        # Plantilla sin secretos
```

## Inicio rápido

**Requisitos:** Node.js 22 (alineado con Docker y CI) · npm ≥ 10 · proyecto [Supabase](https://supabase.com) · (opcional en local) [Brevo](https://www.brevo.com)

```bash
git clone <url-del-repositorio>
cd TrekSafe
npm run install:all

cp .env.example backend/.env
echo "VITE_API_URL=http://localhost:3000/api" > frontend/.env
# Completa SUPABASE_*, JWT_SECRET, MEDICAL_ENCRYPTION_KEY y correo en backend/.env
```

Para una **base nueva y descartable**, revisar `init_schema.sql` y después las [migraciones incrementales y sus dependencias](backend/migrations/README.md). `init_schema.sql` borra y recrea tablas: **no ejecutarlo en DEV compartido ni en un entorno con datos existentes**. No repetir DDL por un asiento ausente; comprobar estructura y registro primero. Mantener `CRON_ENABLED=false` al desarrollar contra DEV compartido salvo la instancia coordinada del motor.

```bash
npm run dev:backend    # http://localhost:3000/api/salud
npm run dev:frontend   # http://localhost:5173
```

<details>
<summary>Variables de entorno principales</summary>

| Variable | Descripción |
| --- | --- |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Solo backend |
| `JWT_SECRET` | ≥ 32 caracteres |
| `MEDICAL_ENCRYPTION_KEY` | 32 bytes AES-256 |
| `BREVO_API_KEY` o `SMTP_*` | Alertas por correo |
| `CORS_ORIGIN` | Origen del frontend |
| `MAIL_DEV_FALLBACK` | `true` en dev · `false` en prod |
| `CRON_ENABLED` | Control actual del motor; fijar `false` en DEV compartido. API/worker separados son objetivo pendiente |
| `VITE_API_URL` | URL del API (build-time en Vercel) |

Referencia completa: [`.env.example`](.env.example).

</details>

<details>
<summary>Scripts npm</summary>

| Comando | Descripción |
| --- | --- |
| `npm run install:all` | Dependencias backend + frontend |
| `npm run dev:backend` / `dev:frontend` | Desarrollo |
| `npm run build:backend` / `build:frontend` | Build producción |
| `npm test --prefix backend` | Tests |
| `npm run test:mail --prefix backend` | Verifica correo |
| `npm run test:rescue-alert --prefix backend` | Simula alerta |

</details>

## Despliegue

La siguiente tabla recoge **destinos históricos declarados**, no disponibilidad o revisión publicada certificadas:

| Capa | Plataforma | URL |
| --- | --- | --- |
| PWA | Vercel | https://treksafe-app.vercel.app |
| API + cron | Fly.io (`iad`) | https://treksafe-api.fly.dev |
| DB | Supabase | `service_role` |
| Email | Brevo (desde Fly) | API y/o SMTP |

**Secuencia R2 objetivo:** esquema compatible → API/procesador → frontend → comprobaciones y recuperación. Ver [procedimiento y condiciones](docs/arquitectura/transicion-y-validacion.md).

El diseño de dos máquinas se implementará en #107/#109/#110. El costo base de cómputo y sus exclusiones están en [decisiones](docs/arquitectura/decisiones.md); el costo total de las cuentas no está verificado.

**Referencia histórica de una sola API:** los comandos siguientes no despliegan la arquitectura R2 objetivo. `set-fly-secrets.ps1` utiliza una app fija e importa valores del `.env`; revisar destino y configuración por entorno antes de cualquier uso. La guía operativa final pertenece a #110.

```bash
cd backend
fly apps create treksafe-api --org personal   # si no existe
powershell -File scripts/set-fly-secrets.ps1
fly deploy
```

Vercel: Root Directory `frontend` · Build `npm run build` · Output `dist` · Env `VITE_API_URL=https://treksafe-api.fly.dev/api`.

```bash
fly secrets set CORS_ORIGIN=https://treksafe-app.vercel.app -a treksafe-api
```

Artefactos: [`backend/fly.toml`](backend/fly.toml) · [`backend/Dockerfile`](backend/Dockerfile) · [`frontend/vercel.json`](frontend/vercel.json).

> El diseño envía correo desde el procesador de Fly. La API de Brevo o SMTP deben configurarse y probarse con destinatarios controlados. No asignar IP de egreso fija por defecto; evaluarla solo si el proveedor lo requiere. Configurado, encolado, aceptado y recibido son estados distintos.

<details>
<summary>Base de datos</summary>

Estados de expedición: `programada` → `en_progreso` → `completada` | `alerta`. Una `programada` puede pasar a `cancelada` (HU-27), que es final: el cron no la activa ni la alerta.

Entidades: `usuarios`, `perfiles_senderista`, `perfiles_rescatista`, `expediciones`, `contactos_emergencia`, `fichas_medicas`, `bitacoras_rescate`, `despachos_correo`, `auditoria_acceso_medico`, …

Las migraciones `sprint*_migration.sql` y `post_mvp_migration.sql` están obsoletas. Release 2 agrega SQL en `backend/migrations/`; el esquema inicial no incluye por sí solo todas esas ampliaciones. Orden y aplicaciones reales: [README de migraciones](backend/migrations/README.md) y [registro por entorno](backend/migrations/REGISTRO_APLICACION.md). Los asientos conciliados de TECH-56 ya figuran en `develop`; no implican DDL aplicado de nuevo.

</details>

## API

Prefijo `/api` · `Authorization: Bearer <JWT>` · JSON `camelCase`

| Área | Rutas clave |
| --- | --- |
| Salud | `GET /salud` |
| Auth | `POST /auth/registrar-senderista` · `registrar-rescatista` · `iniciar-sesion` |
| Usuario | `/usuario/ficha-medica` · `/contactos` · `/privacidad/revocar` |
| Expediciones | `POST /` · `GET /` · `GET /activa` · `GET /historial` · `GET /:id` · `PUT /:id` · `POST /:id/cancelar` · `POST /:id/ampliar-retorno` · `POST /:id/confirmar-retorno` |
| Rescate | `/expediciones` · `/historial` · `/alertas` · confirmar · bitácora |

## Seguridad

| Medida | Implementación |
| --- | --- |
| Ley N° 29733 | Consentimiento en registro; ficha médica cifrada en reposo |
| Derechos ARCO | `POST /usuario/privacidad/revocar` |
| Roles JWT | `senderista` / `rescatista` |
| RLS | Deny-by-default; acceso vía `service_role` |
| Auditoría médica | Accesos de rescatistas registrados |
| Rate limiting | 20 req / 15 min en auth |
| Cliente | Solo `VITE_API_URL` (sin secretos) |

La PWA conserva assets públicos y borradores/plantillas propios de la sesión; las respuestas API no se guardan para uso offline. Los datos locales privados se eliminan al cerrar sesión. Política, pruebas y evidencia en [fix de privacidad #67](docs/fixes/67-service-worker-privacidad.md).

**Fuera de alcance:** GPS continuo IoT · APIs gubernamentales reales · SMS de pago.

## Equipo

| Integrante | Rol |
| --- | --- |
| Marko Antonio Lopez Bernuy | Product Owner |
| Ariana Belen Blanco Quintana | Scrum Master |
| Manuel Rodrigo Llaury Murga | Developer |
| Pedro Leonardo Ormeño Moquillaza | Developer |
| Yahel Jair Cordova Amez | Developer |

**Docente:** Jorge Luis Irey Nuñez · Universidad de Lima · Ingeniería de Sistemas

## Licencia

Proyecto académico (Universidad de Lima, 2026). Uso educativo del curso; sin licencia open source publicada en el repositorio.

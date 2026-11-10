# HU-39 · Prueba manual contra Supabase real (proyecto personal)

Fecha: 2026-11-10. Destino: proyecto personal `wwan….supabase.co` (nunca el DEV del equipo; el ref `ibnw…` está en la lista de bloqueo).
Backend local desde el worktree, con `CRON_ENABLED=false`, sin SMTP/Brevo y sin `DATABASE_URL`. Claves y tokens enmascarados (`Bearer ***`, `***`); el ref, con 4 caracteres.

## Estado inicial (lectura, sin modificar nada)

- 17 migraciones registradas (000–014, 016 y 017). `incidentes` con 0 filas; `expediciones` con 0.
- 2 usuarios (1 senderista, 1 rescatista sembrado = A, Carlos Mendoza Quispe) y las 4 credenciales del padrón sembrado, activas.
- **`eventos_plan` tenía 9 filas heredadas** de pruebas antiguas (0 expediciones que las referencien). Esa tabla es de solo anexar (trigger `EVENTO_PLAN_INMUTABLE`), por lo que **no se limpia y se quedan**. No afectan a HU-39. Tras esta prueba `eventos_plan` sigue en 9: la prueba no escribió en ella.
- `puntos_ruta` y `avances_expedicion` responden 403 `42501` a `service_role`: es intencionado (las migraciones 010 y 016 hacen `REVOKE ALL` y dejan solo las RPC).

## Clave `sb_secret_`

El proyecto personal usa una clave del formato nuevo. `@supabase/supabase-js` 2.108.2 la acepta en PostgREST (`from('usuarios')`) y en la RPC (`treksafe_asumir_coordinacion`, que respondió `NO_ES_RESCATISTA` con UUID al azar, antes de escribir). El backend arrancó y conectó. Esa clave no contiene el ref: la guarda de la prueba comprueba solo URL, `--ref-personal` y lista de bloqueo.

## Datos creados (todos con marca, para borrarlos)

- A = rescatista sembrado (Carlos Mendoza Quispe); B = Lucía Fernández Ríos (AGMP-2024-00203), registrada por `POST /api/auth/registrar-rescatista` (ese flujo no envía correo: solo valida el padrón y guarda).
- Un rescatista sin perfil (`hu39-sinperfil@example.invalid`) y expediciones `HU39-PRUEBA` sembradas por REST con `service_role`: 2 en `alerta` y 1 `en_progreso` por serie. Los tokens se firmaron con el `JWT_SECRET` del backend local.

## Primera pasada (serie 0): 3 FALLA de mi guion, no del sistema

La primera ejecución del guion marcó 3 FALLA, todas de "coordinacion con las 6 claves": mi lista esperada decía `estado` y la respuesta trae `version`. La lista del test de la ruta (`rutasCoordinacion.test.ts`) coincide con la respuesta real, así que corregí el guion. El resto de esa pasada fue PASS. Dejó 2 incidentes más (expediciones `…0001` y `…0002`); se tratan como datos de prueba.

## Guion de la API (serie 1)

```text
Destino: wwan….supabase.co · API http://localhost:3000/api · fase api

== 1. A (Carlos Mendoza) y B (Lucía 7ae1df4c…) ==
== 2. Asumir, repetir y 409 sobre E1 ==
  A asume (operacionId 7a70140c…) → 201 {"coordinacion":{"incidenteId":"e5244b95-c51f-425a-804f-635e41b4edfe","version":1,"responsableId":"22222222-2222-4222-8222-222222222222","nombreResponsable":"Carlos Mendoza Quispe","asumidoEn":"2026-11-10T16:19:00.270Z","esMia":true}}
  PASS  A asume: 201
  PASS  coordinacion con las 6 claves
  PASS  esMia true y nombre de A
  PASS  A repite el mismo operacionId: 200 y mismo cuerpo — HTTP 200
  PASS  A con otro operacionId: 200 y mismo incidenteId — HTTP 200
  B asume → 409 {"error":"ErrorAplicacion","mensaje":"Otro rescatista ya coordina esta alerta","codigo":"COORDINACION_YA_ASUMIDA","responsableVigente":{"responsableId":"22222222-2222-4222-8222-222222222222","nombreResponsable":"Carlos Mendoza Quispe"}}
  PASS  B asume: 409 COORDINACION_YA_ASUMIDA
  PASS  responsableVigente = A

== 3. Errores ==
  PASS  senderista: 403 PROHIBIDO — HTTP 403 PROHIBIDO
  PASS  rescatista sin perfil: 403 NO_ES_RESCATISTA — HTTP 403 NO_ES_RESCATISTA
  PASS  alerta inexistente: 404 — HTTP 404 ALERTA_NO_ENCONTRADA
  PASS  expedición en_progreso: 404 — HTTP 404 ALERTA_NO_ENCONTRADA
  PASS  cuerpo inválido {}: 400 — HTTP 400
  PASS  cuerpo inválido {"operacionId":"no-es-uuid"}: 400 — HTTP 400
  PASS  sin token: 401 (única respuesta 401) — HTTP 401
  PASS  ninguna otra respuesta fue 401

== 4. Dos POST simultáneos sobre E2 ==
  A → 201, B → 409
  PASS  exactamente un 201 y un 409 — 201,409
  PASS  el 409 nombra al ganador
  PASS  un solo incidente en 0017 — 1 fila(s)
  PASS  un solo incidente en 0018 — 1 fila(s)

== 5. Lecturas con A y con B ==
  [A] monitor 200 · alertas 200 · detalle 200
  PASS  [A] las tres lecturas responden 200
  PASS  [A] coordinacion presente en las 3 lecturas — 9 aparición(es) con incidente
  PASS  [A] coordinacion con las 6 claves
  PASS  [A] esMia=true
  PASS  [A] coordinacion sin campos médicos
  [A] claves de aspecto médico fuera de coordinacion en el detalle: fichaMedica (fichaMedica puede seguir hasta HU-50)
  [B] monitor 200 · alertas 200 · detalle 200
  PASS  [B] las tres lecturas responden 200
  PASS  [B] coordinacion presente en las 3 lecturas — 9 aparición(es) con incidente
  PASS  [B] coordinacion con las 6 claves
  PASS  [B] esMia=false
  PASS  [B] coordinacion sin campos médicos
  [B] claves de aspecto médico fuera de coordinacion en el detalle: fichaMedica (fichaMedica puede seguir hasta HU-50)

RESULTADO: todo PASS
```

## Verificaciones de Supabase real

```text
Destino: wwan….supabase.co · API http://localhost:3000/api · fase verificaciones

== E1. RAISE EXCEPTION vía PostgREST real (llamada cruda como B sobre E1, ya coordinada por A) ==
  HTTP 400
  cuerpo: {"code":"P0001","details":"{\"id\": \"22222222-2222-4222-8222-222222222222\", \"nombreCompleto\": \"Carlos Mendoza Quispe\"}","hint":null,"message":"COORDINACION_YA_ASUMIDA"}
  PASS  error.message = código del RAISE — COORDINACION_YA_ASUMIDA
  PASS  error.details = JSON {id, nombreCompleto} del responsable (lo que lee leerResponsableVigente) — {"id":"22222222-2222-4222-8222-222222222222","nombreCompleto":"Carlos Mendoza Quispe"}
  (la prueba de la API ya mostró 409 con responsableVigente: el backend ve lo mismo que PostgREST)

== E2. Embed perfiles_rescatista(nombre_completo) con service_role ==
  HTTP 200 [{"id":"e5244b95-c51f-425a-804f-635e41b4edfe","expedicion_id":"39393939-0000-4000-8000-000000000017","perfiles_rescatista":{"nombre_completo":"Carlos Mendoza Quispe"}},{"id":"7f59a414-5f05-40e8-9c94-071e48a3bfce","expedicion_id":"39393939-0000-4000-8000-000000000018","perfiles_rescatista":{"nombre_completo":"Carlos Mendoza Quispe"}}]
  PASS  el embed se resuelve (HTTP 200, 2 incidentes)
  PASS  cada incidente trae nombre_completo
  PASS  nombre del embed = nombreResponsable de la API — Carlos Mendoza Quispe

RESULTADO: todo PASS
```

- `error.message` llega con el código del `RAISE` y `error.details` con el JSON `{id, nombreCompleto}`; es lo que lee `leerResponsableVigente` y por eso el 409 de la API lleva `responsableVigente`.
- El embed `perfiles_rescatista(nombre_completo)` funciona con `service_role` tras recargar el esquema. Devuelve un objeto (relación a uno), que el DAO ya admite.

## Notas

- `fichaMedica` sigue en el detalle de la alerta hasta HU-50; `coordinacion` no lleva campos médicos.
- Quedan sin ejecutar: la parte del navegador (la hace el autor) y la limpieza de datos de prueba (requiere confirmación). `comprobar-017.sql` (14 comprobaciones de catálogo) debe pegarse en el SQL Editor.
- Datos de prueba al cerrar: 4 incidentes, 6 expediciones `HU39-PRUEBA`, 2 usuarios `hu39-*`, `avisos_usuario` en 0 (no salió ningún aviso).

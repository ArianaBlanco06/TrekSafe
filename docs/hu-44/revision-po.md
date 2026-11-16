# Revisión PO de #93 — 2026-11-13

Correcciones por Codex, delegadas por Marko; se conserva el PR y la autoría de Fernando. Incluye la base de #90; debe integrarse después de ese PR. No aplicar su antigua migración 012 ni repetir 015.

027 agrega el evento lógico de retorno y la RPC que completa la expedición y guarda los pendientes en una sola transacción. Sustituye el UPDATE HTTP seguido de un servicio que encolaba y ocultaba errores. Se retira ese productor separado; el adaptador usa una RPC sin fallback, conserva la traducción a datos de negocio y mantiene la ruta, contraseña, roles y JSON públicos.

Se notifica a contactos vinculados y, si la alerta fue atendida, al último responsable y a rescatistas que recibieron la alerta por un transporte real o registro legacy. La alerta anterior no suprime el retorno. El payload contiene ruta/hora y metadatos de identidad, sin ficha médica. La clave por expedición/destinatario/canal impide duplicación.

Se endurece la limpieza del 401 antes de terminar la solicitud y se elimina un caché antiguo que pudiera reaparecer tras una lectura tardía. La regresión de privacidad mantiene la exigencia de cero datos/cachés privados y agrega una carrera determinista de lectura/invalidación.

| Criterio | Prueba | Resultado / entorno |
|---|---|---|
| CA-01: evento atómico | Fallo de INSERT en outbox revierte estado y evento; RPC y adaptador no escriben en dos pasos | SQL PG 17.11 y unitarias |
| CA-02: destinatarios | Contacto previamente alertado, responsable y otro rescatista notificado; tres pendientes exactos | SQL real desechable |
| CA-03: contenido/deduplicación | Repetir RPC conserva evento/pendientes; texto con ruta/hora, sin datos médicos | SQL y SDK/PostgREST real |
| Regresión backend | Tipos, build y suite completa | 915 aprobadas con Node 22.23.4 |
| Frontend | Tipos, build y pruebas | 216 aprobadas; 2 condicionales omitidas |
| Privacidad | 401, logout, cambio de cuenta, respuesta/escritura/lectura tardías | 23 PWA aprobadas en Edge headless |
| Integración | SQL de HU-44/45, contratos históricos y SDK real | 31 escenarios PG/PostgREST aprobados |

**027 pendiente de Ariana en DEV**, después de 026. Aprobación final, merge y cierre de #46 esperan las aplicaciones reales y CI del último commit. No se activa correo real, cron compartido ni publicación.

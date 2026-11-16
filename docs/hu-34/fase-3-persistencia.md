# HU-34 — Fase 3: persistencia

8 de noviembre de 2026. Implementada [016_hu34_avances_expedicion.sql](../../backend/migrations/016_hu34_avances_expedicion.sql), posterior a 002/010, con registro condicional de versión `016` y nombre `hu34_avances_expedicion`. No se aplicó en Supabase. El DDL se ejecuta una sola vez.

La tabla `avances_expedicion` conserva cuenta, expedición, solicitud, punto, fotografía de nombre/orden, nota y hora del servidor. La FK compuesta exige una nueva clave única de soporte en `puntos_ruta`; no se modifica 010. Es diferible para permitir cascadas de expedición/cuenta sin permitir borrar un punto referenciado aisladamente.

La RPC bloquea la expedición propia y evalúa el estado después de esperar. Recupera una solicitud equivalente antes de rechazar por estado; una acción nueva exige `en_progreso` y punto perteneciente. La clave cuenta/solicitud y su resolución de colisiones cubren solicitudes simultáneas, incluso sobre planes distintos. Una solicitud con contenido diferente produce conflicto. Hora con milisegundos tomada después de los bloqueos. Último avance ordenado por fecha e ID.

Las dos RPC son `SECURITY DEFINER` con nombres calificados y search_path fijo, como solicitó el equipo. `service_role` recibe únicamente ejecución, sin acceso directo a avances ni auxiliares. RLS deniega acceso al navegador. No hay escrituras en eventos de plan, ni cambios de estado, versión, plazo o metadatos de expediciones.

19 comprobaciones PostgreSQL desechables aprobadas: dependencia, registro, permisos, Unicode, propiedad, estados, recuperación tardía, concurrencia coordinada, rollback, cascadas y alerta posterior al avance. [Runner](../../backend/scripts/test-hu34-postgres.mjs).

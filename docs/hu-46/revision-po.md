# Revisión PO de #94 — 2026-11-13

Correcciones por Codex por delegación de Marko; se conserva el PR y la autoría de Fernando. Integra la base corregida de #90. Separa IConsultaDespachos de IColaDespachos y mantiene las rutas de consulta/reintento existentes.

028 sustituye el Set en memoria por comandos persistentes. La clave, obligatoria de 1–150 caracteres, se vincula a actor, incidente y mensaje; un cambio de contenido produce 409. La consulta y el reintento verifican al responsable vigente y la pertenencia obligatoria del mensaje en SQL; un rescatista ajeno recibe 403. Se toma un bloqueo compartido del incidente frente al relevo y un bloqueo del aviso para decidir su estado.

Solo un fallo definitivo permite autorizar un intento manual adicional. El historial y el contador acumulado se conservan; repetir la clave no vuelve a encolar, incluso desde otra instancia o después de enviar. Los enviados no se reenvían y los inciertos requieren revisión. La respuesta incluye canal y distingue simulaciones dev-log de envíos reales.

| Criterio | Prueba | Resultado / entorno |
|---|---|---|
| CA-01: responsable/consulta | Rechazo de otro rescatista, pertenencia ausente/ajena, consulta autorizada y relevo real de HU-40 | SQL PG 17.11; se instala 021 antes |
| CA-02: manual idempotente | Dos solicitudes SDK concurrentes con misma clave, otra instancia, clave alterada, contador 3→4 y un solo envío | PostgREST 16.5 + SDK reales y transporte sustituido |
| CA-03: estados | Enviado e incierto rechazados; clave repetida no autoriza un segundo intento; simulación excluida de enviados reales | SQL y fachada |
| HTTP | JWT/401, rol/403, responsable/403, X-Idempotency-Key obligatoria, parámetros y no-store | Express local con puertos sustituidos |
| Regresión | Suite backend completa y prueba HTTP adicional | 913 + 1 aprobadas; tipos aprobados |
| Esquema | Instalación/actualización y regresiones históricas; worker concurrente/reinicio | 31 escenarios PG/PostgREST aprobados |

**028 pendiente de Ariana en DEV**, después de 026. No aplicar 012 ni repetir 015. Aprobación final, merge y cierre de #48 esperan DEV y CI del último commit. Esta entrega no acredita despliegue publicado ni recepción real de correo.

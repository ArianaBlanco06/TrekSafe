# Revisión PO de #115 — 2026-11-13

Base `develop` 6ad98a9; revisión por Codex, delegada por Marko. Conflictos de HTTP/documentación resueltos preservando composición inyectable. El ensamblaje de borradores está en infraestructura/composicion/http, sin clientes concretos en createApp.

La función 020 conserva la clave por cuenta y borrador y su respuesta, pero llama a treksafe_crear_expedicion (022) dentro de la misma transacción. Mantiene validación de borrador, relectura tras bloqueo, recuperación de respuesta perdida y tombstone de plan eliminado. No modifica 022 ni otra migración aplicada.

| Criterio | Prueba | Resultado local |
|---|---|---|
| Identidad/reintento | Misma clave, dos conexiones, cuerpo distinto, fecha vencida tras creación | 13 casos PostgreSQL 17.11 aprobados |
| Transacción/propiedad | Fallo inyectado en acompañantes, contactos ajenos, otra cuenta, plan eliminado | Mismo runner SQL aprobado |
| Cola y privacidad | Revisión explícita, logout/401, otra cuenta, respuestas tardías, recarga | 27 PWA aprobadas |
| Regresión | Tipos backend/frontend; suite completa | 909 backend y 220 frontend aprobadas; 2 frontend condicionales omitidas |

**020 sigue pendiente de Ariana en DEV.** Depende de 002, 014 y 022. Se aplica solo si faltan sus objetos y asiento, después de verificar instalación limpia y actualización desechables; no repetir DDL de #108. Revisión final y cierre de #51 esperan DEV y CI del último commit. Esta evidencia no acredita publicación.

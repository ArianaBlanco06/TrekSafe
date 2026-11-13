# Revisión PO de #90 — 2026-11-13

Base `develop` 6ad98a9. Se conserva la autoría de Fernando; correcciones realizadas por Codex por delegación de Marko. La outbox canónica es 015, ya aplicada en DEV; no existe otra migración 012 de HU-45 que deba aplicarse.

026 agrega un historial de intentos sin cuerpo/destinatario, presupuesto automático y autorización de un intento manual. Las cuatro RPC usan SECURITY INVOKER y solo service_role puede ejecutarlas. La selección de pendientes y las reservas utilizan el reloj de PostgreSQL, evitando diferencias de precisión/hora con Node. Un token UUID nuevo identifica cada reserva. El inicio se confirma en SQL antes de llamar al transporte; solo el titular puede finalizar. Si vence una reserva tras iniciar un transporte, queda incierta y no se reenvía automáticamente. Un fallo al registrar el resultado después de aceptar el correo conserva ese inicio duradero.

Los tres intentos automáticos esperan 1 y 5 minutos. dev-log se guarda con su modo y se cuenta como simulación, no como envío real. El scheduler evita ciclos solapados y espera el ciclo en curso al cerrar. Su construcción está en composición; no se activa al importar ni se incorpora automáticamente al arranque pendiente de #109.

Se retiran datos médicos de las alertas de rescate y datos de destinatarios/cuerpos de los logs nuevos. Encolar no crea un registro legacy de envío exitoso. Un fallo de reserva no se oculta como una colisión normal.

| Criterio | Evidencia | Resultado / entorno |
|---|---|---|
| CA-01: persistencia | RPC 024 de #108 + inicio duradero en 026; SDK reiniciado tras aceptación y confirmación SQL fallida | PG 17.11 / PostgREST 16.5 desechable |
| CA-02: exclusión y reintentos | Dos workers reales por SDK; reserva vencida antes/después del inicio, token antiguo, 3 intentos y esperas | 30 escenarios del runner PG aprobados |
| CA-03: incierto/simulado | Historial SQL de intento incierto/simulado, transporte sustituido, métrica real excluye dev-log | SQL y pruebas unitarias aprobadas |
| Regresión | Tipos, build y suite backend | 910 aprobadas con Node 22.23.4 |

**026 no se ha aplicado en DEV.** Ariana debe comparar objetos, funciones y asientos, aplicar solo lo pendiente, registrar su ejecución y recargar PostgREST. No repetir 015 ni el esquema inicial. Aprobación final, merge y cierre de #47 esperan DEV y CI del último commit. No se prueba correo real ni publicación en esta entrega; no se acredita recepción por el destinatario.
